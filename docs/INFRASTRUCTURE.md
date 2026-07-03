# Infrastructure & Deployment

Where each part of the system actually runs, and how the objective cataloguing
work is dispatched to a machine that is only sometimes on. The logical design in
[`ARCHITECTURE.md`](ARCHITECTURE.md) is deployment-agnostic; this document is the
opinionated deployment of it. Code-level choices are in [`STACK.md`](STACK.md).

## Constraints

- **No cloud.** Everything runs on hardware the subject owns.
- **Private by network.** All machines sit on one **Tailscale** tailnet; nothing
  is exposed to the public internet.
- **An always-on server, but a modest one.** It can run web servers, SQLite, the
  deterministic coordinator, and the (network-bound) curator, but **cannot run
  local ML models** at useful speed.
- **A powerful but intermittent machine** — a **MacBook Pro (M5)** — that can run
  local ML models (whisper, vision, embeddings) but is **not always powered on**.
- **Cron** drives the server's scheduled work; the MacBook behaves like a
  self-hosted CI runner that pulls jobs when available.

## Topology

```
          ┌──────────────────────── Tailscale tailnet ────────────────────────┐
          │                                                                    │
   subject's phone ──HTTPS──▶  SERVER (always on)                MacBook Pro M5 (intermittent)
   (capture PWA)               ├─ capture      (Deno server)     └─ catalog runner (Deno)
                               ├─ exhibition   (Deno server)         ├─ ffmpeg
   visitor's browser ─HTTPS─▶  ├─ catalog coordinator (Deno)         ├─ whisper.cpp
                               ├─ catalog MCP  (read-only)           ├─ local vision model
                               ├─ studio       (cron: curate/render) └─ local embeddings
                               └─ /data (archive, catalog, collection, feedback)
                                        │        ▲
                                        │        │ pull jobs / download clip / post results
                                        └────────┘  (HTTP over the tailnet)
                                        │
                                        └──HTTPS──▶ Anthropic API   ← the ONLY cloud egress
                                                    (curator reads catalog TEXT only)
```

## Compute placement

| Component               | Machine       | Always on? | Talks to cloud?        |
| ----------------------- | ------------- | ---------- | ---------------------- |
| `capture` server        | server        | yes        | no                     |
| `exhibition` server     | server        | yes        | no                     |
| catalog **coordinator** | server        | yes        | no                     |
| catalog **MCP**         | server        | per curate | no                     |
| `studio` curate/render  | server (cron) | host is    | **yes** (Anthropic)    |
| catalog **runner**      | MacBook M5    | no         | no (local models only) |

Two facts fall out of this table and define the whole posture:

- **Only the curator reaches the cloud**, and it sends the catalog's *text*, never
  media. Local cataloguing on the MacBook is what earns that guarantee.
- **The MacBook holds no durable state.** All `/data` lives on the server; the
  runner is a stateless worker. Losing or wiping the MacBook loses nothing.

## Why the cataloguer is split across two machines

Cataloguing is the only ML-heavy work, and it is **latency-tolerant** — a capture
does not need to be catalogued the instant it lands. That makes it a perfect fit
for an intermittent, pull-based worker. Curation, by contrast, is *not* local
compute at all: it calls the Anthropic API, so it belongs on the always-on server
next to its network egress and the token.

So the `catalog` part is one role in two halves (see [`STACK.md`](STACK.md) for
the folders):

- **Coordinator** — server-side, **deterministic, runs no models.** It watches the
  archive for uncatalogued captures, publishes a job per capture, hands jobs to
  runners, ingests their results, and is the **sole writer** of `catalog.sqlite`.
- **Runner** — on the MacBook. When powered on, it pulls jobs, downloads the clip,
  runs the local models, and posts back a text/structured record. Like a
  `github-actions` self-hosted runner: stateless, disposable, one at a time.

## The catalog as a pull-based job system

### Job lifecycle

```
   coordinator                                   runner (MacBook)
   ───────────                                   ────────────────
1. scan archive.sqlite for captures with
   no catalog record and no open job
2. INSERT job (state=pending) ─────────────────▶ jobs.sqlite
                                          ┌──── 3. GET /catalog/jobs/next
   4. atomically mark CLAIMED + lease ────┘        (only when the Mac is on)
      (runner_id, expires_at); return job ───────▶
                                                 5. GET /catalog/captures/{id}/media
   6. stream the clip over the tailnet ─────────▶   (download to temp)
                                                 7. run ffmpeg + whisper + vision +
                                                    embeddings locally → record{}
                                          ┌──── 8. POST /catalog/jobs/{id}/result
   9. validate; WRITE record to           │        (or /fail on error)
      catalog.sqlite; mark DONE ◀─────────┘
```

**States:** `pending → claimed (leased) → done | failed`. A claim carries a
**lease** (`runner_id`, `expires_at`). If the MacBook powers off mid-job, the
lease expires and the coordinator returns the job to `pending`, so it is retried
the next time any runner is available. `failed` is reserved for repeated hard
errors (bad media, model crash) after N retries, and is surfaced for inspection
rather than retried forever.

Because the queue is just rows in `jobs.sqlite`, an offline MacBook simply means
`pending` jobs accumulate. The catalog lags; nothing breaks. Curators keep working
from whatever the catalog already contains; new captures are catalogued once the
Mac wakes and drains the backlog.

### Coordinator HTTP API (tailnet-only)

| Method + path                        | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| `GET  /catalog/jobs/next`            | claim the next `pending` job (returns job + lease) |
| `POST /catalog/jobs/{id}/heartbeat`  | renew the lease on a long job                  |
| `GET  /catalog/captures/{id}/media`  | download the clip to process                   |
| `POST /catalog/jobs/{id}/result`     | submit the derived record; coordinator writes it |
| `POST /catalog/jobs/{id}/fail`       | report an error; requeue or mark `failed`      |

The coordinator is the **only** writer of `catalog.sqlite` and `jobs.sqlite`, even
though the compute happens on another machine — the runner never touches `/data`,
it goes through this API. That preserves the "one writer per store" invariant
across the machine boundary.

## Scheduling

**Server** (`cron` + the always-on coordinator):

```cron
# Coordinator: enqueue jobs for newly-arrived, uncatalogued captures
*/5  * * * *  deno task -C /srv/mol/catalog/coordinator enqueue   >> /var/log/mol/enqueue.log 2>&1

# Author one exhibition per day (needs the Anthropic token)
0 4  * * *    CLAUDE_CODE_OAUTH_TOKEN=$(cat /etc/mol/oauth) \
              deno task -C /srv/mol/studio/curate curate          >> /var/log/mol/curate.log 2>&1

# Render any specs lacking HTML (idempotent; also catches theme changes)
5 4  * * *    deno task -C /srv/mol/studio/render render          >> /var/log/mol/render.log 2>&1
```

(The coordinator's job-serving API is a small always-on Deno service under
`systemd`, alongside `capture` and `exhibition`. Enqueue can also be an internal
interval inside that service instead of cron — either works.)

**MacBook** — the runner is a long-lived loop, started at login and kept alive by
`launchd` (`KeepAlive`), polling the coordinator with backoff:

```
loop:
  job = GET /catalog/jobs/next
  if no job: sleep(30s); continue
  clip = GET /catalog/captures/{job.id}/media
  record = run_local_models(clip)          # ffmpeg, whisper.cpp, vision, embeddings
  POST /catalog/jobs/{job.id}/result record
```

It needs no inbound ports and no public exposure — it only makes outbound calls to
the coordinator over the tailnet.

## Ingress & TLS

Camera capture needs a secure context (`getUserMedia` requires HTTPS). Use
**Tailscale Serve** to terminate HTTPS with tailnet certificates and proxy to the
local Deno processes — no extra proxy, nothing on the public internet:

```
tailscale serve --bg --https 443  http://localhost:8002   # exhibition (visitor)
tailscale serve --bg --https 8443 http://localhost:8001   # capture   (subject)
```

The coordinator's job API is machine-to-machine on the tailnet; it does not need
Tailscale Serve — bind it to the tailnet interface and authenticate runners with a
shared bearer token (from a root-only env file) and/or Tailscale identity headers.
If path/host routing or custom headers are needed later, **Caddy** can sit in front
(as in `tvh-react-vibe`); the machine still stays tailnet-only.

## Privacy & network posture

- **Raw media never leaves the tailnet.** Clips move only server → MacBook over
  Tailscale for local cataloguing. No frames, audio, or video are ever sent to any
  cloud service.
- **Exactly one cloud egress:** the curator (`studio/curate`) → Anthropic API,
  carrying catalog **text** only. This is a direct consequence of the firewall in
  [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`STACK.md`](STACK.md).
- **One outbound credential:** `CLAUDE_CODE_OAUTH_TOKEN`, read from a root-only
  file on the server, never committed, never present on the MacBook.
- **Tailnet-only ingress:** the subject's phone and the visitor's browser reach
  the app only over Tailscale.

## Storage & backups

- All durable state is `/data` on the **server**; the MacBook keeps only temp
  files while a job runs.
- Back up `/data` with `restic`/`rsync`. The **archive**, **collection**, and
  **feedback** are the precious stores (append-only). The **catalog** and **jobs**
  are derived and can be rebuilt from the archive, so they are optional to back up.

## Failure modes

| Situation                     | Effect                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| MacBook off for a while       | `pending` jobs pile up; catalog lags; everything else runs; drains on wake |
| Runner dies mid-job           | lease expires → job returns to `pending` → retried later          |
| Bad media / model crash       | job `fail`s; after N retries marked `failed` and surfaced          |
| Server down                   | no captures/exhibitions/curation; the runner idles (nothing to pull) |
| Anthropic unreachable         | `curate` fails cleanly and retries next schedule; catalog/gallery unaffected |
| Catalog corrupted/lost        | rebuild from the archive by re-enqueuing all captures              |

## Open questions

- **Runner concurrency** — one job at a time is assumed (matches a single
  MacBook). Revisit only if a second runner is ever added.
- **Wake-on-demand** — leave the MacBook to catalogue only when the subject
  happens to power it on, or trigger a wake (e.g. scheduled power-on / WoL) when
  the backlog crosses a threshold.
- **Coordinator enqueue trigger** — cron poll (above) vs. an internal interval vs.
  capture notifying the coordinator on upload.
- **Curate cadence & curator selection** — daily is assumed; confirm, and whether
  selection is uniform-random or weighted (never letting preference override
  integrity — see [`CURATORS.md`](CURATORS.md)).
- **Rotation policy** — how the gallery floor picks the day's exhibition
  (`ARCHITECTURE.md` leaves this open).

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the machine-agnostic design.
- [`STACK.md`](STACK.md) — runtimes, code layout, and the catalog's contents.
- [`CURATORS.md`](CURATORS.md) — what the curator (the one cloud consumer) is.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine all generated text obeys.
</content>
