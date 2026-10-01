# Infrastructure & Deployment

Where each part of the system actually runs, and how its two scarce resources — **the
machine's memory/CPU** and **Claude spend** — are kept under control. The logical design in
[`ARCHITECTURE.md`](ARCHITECTURE.md) is deployment-agnostic; this document is the
opinionated deployment of it. Code-level choices are in [`STACK.md`](STACK.md).

## Constraints

- **One machine: `odin`**, the always-on home server. Intel N100 (Alder Lake-N), **4 cores,
  15 GiB RAM, no GPU**, Debian, rootful Docker (`docker -c default …`). There is no
  second, more powerful machine.
- **It is shared.** ~20 containers already run on it (Immich, Paperless, Mattermost,
  Postgres, Home Assistant, Syncthing, …) plus `~/poker-ai`, which is the largest consumer
  when it is being watched. Everything this project runs competes with them. **Memory is the
  scarcest resource, CPU second.** On 2026-10-01 the machine had ~6 GiB available with
  ~3.6 GiB already swapped out, and poker-ai's *idle* Jeff container held 2.1 GiB resident.
- **No cloud, with one exception:** Claude, for curation, sees catalog *text* only. Raw media
  never leaves the box.
- **Private by network.** Tailscale tailnet; nothing is exposed to the public internet.
- **Two budgets, both finite:** a *machine budget* (RAM/CPU other services need first) and a
  *Claude budget* (money, or subscription allowance). Every design choice below is the
  cheaper of the available options, and every expensive step has to justify itself.

## Topology

```
 subject's phone ─HTTPS (Tailscale Service)─▶  odin  (this machine, always on)
 visitor's browser ───────HTTPS───────────▶    ├─ capture      (Deno server)
                                               ├─ exhibition   (Deno server)
                                               ├─ catalog      (cron batch, nightly window)
                                               │    └─ model containers, started and stopped
                                               │       per stage: whisper · small VLM ·
                                               │       embeddings · Jeff
                                               ├─ catalog MCP  (read-only, per curate run)
                                               ├─ studio       (cron: curate / render)
                                               └─ data root (archive, catalog, collection, feedback)
                                                        │
                                                        └──HTTPS──▶ Anthropic API  ← the ONLY cloud egress
                                                                    (curator reads catalog TEXT only)
```

## Where each kind of work goes

**Volume work is local; judgement work is Claude.** Cataloguing is done once per capture
(thousands of items, latency-tolerant, needs to see pixels). Curation is done once per
exhibition (a handful of items, needs taste, never needs to see pixels). That split makes
costs scale predictably: **local compute scales with the archive; Claude spend scales with
the number of exhibitions and never with the archive's size.**

Within local work, always use the cheapest tier that can answer:

| Tier | What | Cost to the machine | Used for |
| ---- | ---- | ------------------- | -------- |
| 0 | **Plain code** — `ffprobe`/`ffmpeg`, arithmetic, SQL | negligible | normalising to MP4, duration, `time_of_day` (solar position from timestamp + coordinates), dominant colors, loudness/silence, motion (GPS speed between captures, frame difference), speech-present gate |
| 1 | **Small perception models** — whisper.cpp, a small vision-language model, a small embedding model | hundreds of MiB each *(VLM and embeddings: to be benchmarked)*; seconds per item | transcript (only clips where speech was detected), `scene_description` + OCR from a keyframe, embeddings |
| 2 | **Jeff** — purpose-trained zero-shot *text* classifier | **4.25 GB peak, ~2.4 GB resident, 3.7 s per ~200-token decision at 3 cores** (measured by poker-ai) | closed-vocabulary tags over the text tier 1 produced, in one forward pass per question |
| 3 | **Claude** | money / allowance, no RAM | curation only: choose, order, write the thesis and placards |

Rules of thumb that fall out of poker-ai's measurements (see
[`~/poker-ai/reports/`](file:///home/oskar/poker-ai/reports)):

- **A deterministic rule beats a small model at what it can express.** In poker-ai a
  hand-written rule bot scored 12/12 against Jeff's 9/12. So anything code can compute
  (`time_of_day`, `motion_state`, colors) is tier 0, never tier 2.
- **A small general model is not a substitute for Jeff.** Qwen2.5-0.5B read as a classifier
  answered the *label* rather than the question (the answer flipped with option order); the
  fine-tune is what makes Jeff work. Consequently **no general 0.5B text model has a job in
  this project** — it would cost memory to be unreliable. Small models here are *perception*
  models (speech, vision, embeddings), not judges.
- **Jeff reads text, not video.** It classifies what tier 1 wrote down. That is the point: a
  new question ("does this scene contain a doorway?") is one cheap forward pass over existing
  text, instead of another expensive vision-model run over pixels.
- **Claude cannot be the perception tier.** The firewall (`STACK.md`) forbids sending media.
  So the local vision model's quality is the ceiling on everything a curator can ever see —
  see [Open questions](#open-questions).

## Resource budget

Compute placement, and what each part costs while it runs. Anything marked *TBD* has not been
measured on this machine and must be benchmarked (as poker-ai's `make bench` did) before it is
relied on.

| Component | Runs | Resident while running | Cloud? |
| --------- | ---- | ---------------------- | ------ |
| `capture` server | always | tens of MiB (expected; poker-ai's server is 41 MiB) | no |
| `exhibition` server | always | tens of MiB (expected) | no |
| catalog batch (Deno) | nightly window | small | no |
| whisper.cpp | one stage of the window | tiny/base model files are 75 / 142 MiB; runtime *TBD* | no |
| small VLM | one stage of the window | *TBD* | no |
| embeddings | one stage of the window | *TBD* | no |
| Jeff (shared `~/jeff` service, lease-managed) | one stage of the window | 2.4 GB steady, 4.25 GB peak | no |
| catalog MCP | per curate run | small | no |
| `studio` curate | a few times a week | one `claude` CLI process, *TBD* | **yes** |
| `studio` render | daily, seconds | small | no |

The rules that keep this from disturbing the other services:

1. **Nothing model-shaped is resident when idle.** Model servers are containers the batch
   starts and stops. This matters more than CPU limits: poker-ai measured that its idle gate
   saves CPU but *not* memory — Jeff holds ~2.1 GiB while nobody is watching (re-confirmed
   today). Memory held while idle is the cost that actually hurts here.
2. **Stage-major, never capture-major.** Run one model over the whole backlog, stop it, then
   start the next — rather than loading every model for each capture. Peak memory is the
   *largest* model, not their sum, and model load time is paid once per night, not once per
   clip.
3. **Pre-flight before every window; skip rather than squeeze.** The batch does nothing if
   - the data root's disk is not mounted, or
   - `MemAvailable` is below `peak(next model) + 2 GiB` (the margin is a starting value), or
   - another instance holds the lock.

   And the **Jeff stage alone** is skipped while another client holds a fresh Jeff lease
   (poker-ai, when someone is watching, holds ~2 of the 4 cores *and* Jeff's single request
   slot).

   A skipped night (or stage) costs nothing: the catalog just lags (see below).
4. **Three threads, low priority.** Measured for Jeff: 2 threads = 8.3 s, **3 threads = 3.7 s**,
   4 threads = 3.1 s. In core-seconds that is 16.6 vs **11.1** vs 12.4 — so 3 threads is both
   faster *and* cheaper than 2; "use fewer cores to be polite" is a false economy past that
   cliff. Run model containers with `--cpus=3`, `OMP_NUM_THREADS=3` (torch ignores the cgroup
   quota), and a low `--cpu-shares` so Immich, Paperless and Mattermost win any contention.
   Whisper and the VLM need their own thread sweep.
5. **Jeff is a shared service (`~/jeff`), and may be stopped at any time.** It is a standalone
   container (`jeff`, image `jeff:latest`, host port `127.0.0.1:8781`; poker-ai is just one
   client). It serves **one request at a time** (a second caller gets `529` +
   `Retry-After: 1`), is stopped when idle, and its lifecycle is **lease-based**
   (`~/jeff/CLAUDE.md`, driver `~/jeff/jeff.sh`). The cataloguer must:
   - **start it on demand:** `~/jeff/jeff.sh up`, then poll `/health` (cold start ~20 s, longer
     if the weights are out of page cache);
   - **hold a lease while using it:** `jeff.sh lease life-museum` every minute or so during
     the stage. Cron's `jeff.sh reap` stops Jeff once *every* client's lease is older than
     10 minutes, so there is no explicit release: after the last stage the container just
     lingers up to ~10 minutes (2.2 GB) and goes. Never `docker stop jeff` by hand;
   - **tolerate it vanishing anyway** (reap races, OOM, a manual stop): on a connection error
     or failed health check, run `up` again and retry the item, bounded (e.g. 3 restarts per
     night), then skip the stage rather than loop. On `529`, back off and retry;
   - **yield to other clients:** if another client's lease is fresh (e.g. `leases/poker`
     touched in the last few minutes) it is in use and each of our requests would cost its
     decisions a `529`; skip the Jeff stage that night (rule 3). Other clients are expected to
     retry on `529`, but a batch that holds Jeff's single slot for hours is not polite.

   Jeff's behaviour, measured CPU settings (3 threads, `OMP_NUM_THREADS` = `--cpus`) and API
   quirks are in `~/jeff/CLAUDE.md` and `~/poker-ai/CLAUDE.md`.
6. **Time-boxed window.** The batch takes a `--deadline`; at the deadline it finishes the
   current item and exits. Initial window **01:00–04:30 JST**, chosen to end before the
   existing 05:00 (Sunday) / 06:00 / 07:30 cron jobs.
7. **Disk is a budget too.** The data root is on the external SSD (`/mnt/usbssd`, 1.8 TB, 1.6 TB
   free); `/home` is 76% used. The archive is ~7 GB/year at
   10 clips/day (estimate from the ideation transcript); the *bootstrap import* of the existing
   photo/video library is unsized — measure it before importing. Temp frames and audio are
   written to a scratch dir and deleted per item.

## Cataloguing is one nightly batch

On two machines this needed a coordinator, a pull-based runner, leases and an HTTP job API.
On one machine all of that disappears: the catalog batch reads clips straight from disk and is
the **sole writer of `catalog.sqlite`** by construction (one process, one lock).

```
cron, 01:00 ─▶ pre-flight (rule 3) ─▶ take lock
  stage 0   code        every new capture: normalise to MP4, ffprobe, colors, loudness,
                        motion, time_of_day, speech-present gate           (no model running)
  stage 1a  whisper     only captures where speech was detected            ─ stop container
  stage 1b  VLM         keyframe → scene_description (+ OCR if text seen)  ─ stop container
  stage 1c  embeddings  over the derived text                              ─ stop container
  stage 2   Jeff        closed-vocabulary tags over the derived text       ─ lease held; Jeff stops itself when idle
  deadline or backlog empty ─▶ release lock
```

- **A stage is "the captures that lack that stage's output".** There is no separate queue:
  pending work is derivable from the catalog itself. Each stage writes its result **and its
  provenance** (model + version, `catalogued_at`) in one transaction, so it is idempotent and
  a crash or the deadline loses at most the item in flight.
- **A capture that fails a stage N times is marked `failed` for that stage and surfaced**,
  not retried forever. Bad media is an event worth looking at, not a loop.
- **Stages are ordered by dependency**, not by cost: embeddings and Jeff read text that 1a/1b
  wrote.
- **Selective rebuild is cheap.** Because provenance is per field, a new Jeff question or an
  upgraded model re-runs only that stage over only the affected rows.
- **An unsure classifier writes nothing.** Jeff's confidence is chance-corrected; near zero
  means "no opinion". The catalog stores *absent*, not a guess — consistent with the doctrine
  that every field is observation ([`../CLAUDE.md`](../CLAUDE.md)). Every Jeff question is
  tuned against a small hand-labelled fixture and its pass rate recorded before the tag is
  trusted; wording and option-menu shape move results a lot (poker-ai's finding), so tuning is
  by measurement, never by ear.

If the machine is busy for a week, `pending` simply accumulates: the catalog lags, curators
keep working from what it already holds, and the backlog drains on the next free window.

## Claude spend

Claude is the one metered resource. Controls, cheapest first:

- **Spend scales with exhibitions, not captures.** Nothing per-capture ever goes to Claude.
- **Production cadence is a budget knob, decoupled from rotation.** The gallery shows one
  exhibition a day *from the collection*; the studio need not author one a day. Initial
  assumption: **3 per week** (`curate` on Mon/Wed/Fri), tunable. The collection only grows, so
  a thin collection means long repeats, which the vision accepts; it is a trade of freshness
  for cost, to be settled with data (below).
- **Runs are bounded.** `claude -p --max-turns N`; MCP tools return capped result sets
  (rows ≤ a few dozen) with terse columns; an overview call returns the catalog's shape
  (facets, counts) in one round trip so the agent doesn't spend turns discovering it. Each
  extra turn re-reads the whole accumulated context, so turns — not output length — dominate
  the bill.
- **At most one retry, and only on a failed voice lint.** The spec is checked
  deterministically (no second person, no banned framing — nostalgia, advice, interpretation)
  before it is saved. A failure gets one retry; a second failure discards the run. An
  exhibition that cannot justify its existence *should not exist* and should not be retried
  until it does.
- **Every run records its usage** (turns, tokens, cost, taken from the CLI's JSON result) in
  the exhibition's `meta.json`, so cadence and model choice are decided from measurements.
- **A hard ceiling.** `curate` refuses to start once the weekly cap is reached, summing
  `usage.cost_usd` over `collection/*/meta.json` and `collection/.rejected/*/meta.json`
  (discarded runs still cost money). It also refuses while the catalog holds too few specimens.
- **Hardened headless run.** `claude -p --output-format json --tools "" --mcp-config <file>
  --strict-mcp-config --allowedTools mcp__catalog --permission-mode dontAsk
  --disable-slash-commands --no-session-persistence --max-turns N --max-budget-usd X`, from an
  empty temp cwd with the prompt on stdin. The model has no file or shell tools; it returns the
  spec as text and `curate` writes it. `--bare` is unusable because it disables OAuth.
  `--max-turns` is a hidden flag on this CLI version; `--max-budget-usd` is the enforced bound.
- **Declines and rejects are kept.** A model may reply `DECLINE: <reason>` when it cannot
  justify an exhibition; that and lint-failed drafts land in `collection/.rejected/<id>/`
  and are never rendered. Measured on a thin fixture: one declined run, 3 turns, about $0.08.
- **Configuration** (environment): `DATA_ROOT`, `CURATE_MAX_TURNS` (8), `CURATE_MAX_RUN_USD`
  (1), `CURATE_WEEKLY_CAP_USD` (5), `CURATE_MIN_SPECIMENS` (30), `CURATE_MODEL`, `CLAUDE_BIN`;
  `--curator=name@vN` forces a curator instead of a random one.
- **The token may be a subscription token.** `CLAUDE_CODE_OAUTH_TOKEN` draws on the same usage
  allowance as interactive Claude Code, so a scheduled job can use up the headroom the
  operator wanted for themselves. Treat the cap as protecting that allowance, not just a
  bill.

## Scheduling

Everything is the user's `crontab` on odin, following the existing house style (`MAILTO`,
`$LOG`, stdout and stderr to separate logs). `deno` is not on `PATH` here — it lives at
`~/.deno/bin/deno` — and cron's `PATH` is minimal, so jobs call it by full path.

```cron
# Cataloguer: nightly window. Pre-flight exits quietly if the machine is busy.
0 1 * * *    ~/.deno/bin/deno task -C ~/life-museum/catalog run --deadline 04:30 >> $LOG/life-museum-catalog.log 2>> $LOG/error.log

# Curate: three exhibitions a week, after the catalog window (needs the Anthropic token)
45 4 * * 1,3,5   CLAUDE_CODE_OAUTH_TOKEN=$(cat ~/.config/life-museum/oauth) \
                 ~/.deno/bin/deno task -C ~/life-museum/studio curate >> $LOG/life-museum-curate.log 2>> $LOG/error.log

# Render any spec lacking HTML (deterministic, idempotent; also picks up theme changes)
55 4 * * *   ~/.deno/bin/deno task -C ~/life-museum/studio render >> $LOG/life-museum-render.log 2>> $LOG/error.log
```

`capture` and `exhibition` are small always-on Deno services started like the machine's other
services. The OAuth token lives in a `0600` file in the user's home, never in the repo.

## Ingress & TLS

Camera capture needs a secure context (`getUserMedia` requires HTTPS). This machine
already gives **every app its own Tailscale Service** (own hostname, HTTPS on 443, proxying
a local port — `immich`, `paperless`, `mattermost`, `kotoba`, `poker`, …), so the museum
follows the same convention; each new service needs one-time admin approval:

```
tailscale serve --service=svc:life-museum         --bg 8002   # exhibition (visitor)
tailscale serve --service=svc:life-museum-capture --bg 8001   # capture    (subject)
```

(8001 and 8002 were free on 2026-10-01; re-check with `ss -ltn` when scaffolding.) Everything
stays tailnet-only. There is no machine-to-machine API any more, so no bearer token is needed.

## Privacy & network posture

- **Raw media never leaves this machine** — not even across the tailnet now. No frames, audio
  or video go to any cloud service.
- **Exactly one cloud egress:** `studio/curate` → Anthropic API, carrying catalog **text**.
  That text can include transcripts of speech, OCR'd text and exact coordinates; this is
  accepted as-is, with no redaction.
- **One outbound credential:** `CLAUDE_CODE_OAUTH_TOKEN`, in a `0600` file, never committed.
- **Tailnet-only ingress** for the phone and the visitor's browser.

## Storage & backups

- All durable state lives under **one data root** outside the repo. **`/mnt/usbssd/museum-data`**
  (decided; earlier drafts wrote `/data`, which is shorthand for this root). It is an
  `ext4` USB SSD mounted via `fstab` with `nofail`, so if the disk is absent the mount point is
  just an empty directory on the root filesystem: every writer must **refuse to start unless
  the data root is on a mounted filesystem** (compare `st_dev` with its parent), or captures
  would silently land on the wrong disk. The directory must be created once with
  `sudo install -d -o oskar -g oskar /mnt/usbssd/museum-data` (the mount is root-owned).
  Model weights go in `models/` under it.
- **The archive, collection and feedback are the irreplaceable stores** (append-only); the
  catalog is derived and can be rebuilt from the archive, so it is optional to back up.
- **The same USB SSD also holds the local borg repositories** (`/mnt/usbssd/borg`), so a
  borg copy of the data root onto it is *not* a second copy. The archive needs a backup
  target on a different device (the existing Backblaze `rclone` job is the natural one). Add
  the data root to it before the first real capture or import — otherwise the archive is one
  disk with no copy, which is exactly how Kotoba ended up unprotected.

## Failure modes

| Situation | Effect |
| --------- | ------ |
| Machine busy / Jeff leased by another client / low memory / data disk not mounted | pre-flight skips the window; catalog lags; everything else runs |
| Window deadline reached mid-backlog | current item finishes, batch exits; resumes next night |
| Process killed or OOM mid-stage | no partial write (one transaction per item); item redone next window |
| Bad media / model crash | stage `fail`s; after N tries marked `failed` for that stage and surfaced |
| A stage's model won't start | that stage is skipped, later stages that need its text skip those rows; nothing breaks |
| Server down | no captures, exhibitions or curation |
| Anthropic unreachable | `curate` fails cleanly and retries at its next slot; catalog and gallery unaffected |
| Claude cap reached | `curate` declines to start until the cap resets |
| Catalog corrupted/lost | rebuild from the archive (clear stage outputs; the batch redoes them) |

## Open questions

- **Which small VLM?** The biggest unknown and the quality ceiling of the whole product.
  Candidates in the SmolVLM / Moondream / Florence-2 class (no benchmark on this machine yet).
  Benchmark on realistic keyframes for seconds/frame and resident memory, and judge captions
  for *observational* wording. If none is good enough, the levers that keep the firewall are a
  bigger local model run less often, or fewer frames per clip; sending frames to Claude would
  break it and is not assumed.
- **Decided: no weather in v1** (it would need a second cloud egress), and **`place_name`
  comes from an offline gazetteer** (coarse, fully local). Revisit weather later if wanted.
- **Curate cadence and model.** 3/week and a mid-tier default model are assumptions. Decide from
  the first weeks of recorded usage; also whether the model is pinned per `curator@version`.
- **Whisper / embeddings footprint and thread counts** — not measured here yet.
- **Rotation policy** — v1 is a stateless daily pick with no consecutive repeats (see
  `STACK.md`). With a thin collection it repeats often; revisit once production outpaces it
  (e.g. weight toward exhibitions not shown recently, which needs a history store).

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the machine-agnostic design.
- [`STACK.md`](STACK.md) — runtimes, code layout, and the catalog's contents.
- [`CURATORS.md`](CURATORS.md) — what the curator (the one cloud consumer) is.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine all generated text obeys.
- `~/jeff/CLAUDE.md`, `~/poker-ai/CLAUDE.md` and `~/poker-ai/reports/` — measured behaviour of Jeff and small
  models on this machine, which the numbers above come from.
