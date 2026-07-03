# Stack & Data

The concrete realization of [`ARCHITECTURE.md`](ARCHITECTURE.md): runtimes, code
layout, on-disk data formats, and **what the catalog is made of**. It stays
machine-agnostic — *where* each part runs and *how* cataloguing jobs are
dispatched live in [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).

The guiding constraint is the product's: **keep it simple**. Few dependencies, no
cloud services, and every exhibition re-renderable years later without a model.

## Constraints that shape the stack

- **Deno** on the server, **React** on the client, **minimal npm**. Prefer the
  standard library and a bare `Deno.serve` over frameworks.
- **Curators/designer are headless Claude Code** (`claude -p`), authenticated with
  a `CLAUDE_CODE_OAUTH_TOKEN`. They see the catalog and nothing else.
- **The cataloguer uses local models** (transcription, vision, embeddings) — so
  raw media never leaves the tailnet, and the curator's firewall from the archive
  is absolute. This is what makes the privacy posture hold; see
  [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).

## Decisions at a glance

| Area              | Decision                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Server runtime    | Deno, raw `Deno.serve` + manual routing (no Oak/Hono)                     |
| Client            | React SPA, bundled by esbuild-via-Deno, plain CSS, no router/SSR/state lib |
| Blob storage      | Video files on the filesystem, content-addressed by capture id           |
| Metadata / catalog| SQLite (`jsr:@db/sqlite`)                                                 |
| Catalog contents  | **Text and structured data only — never media** (see below)              |
| Exhibition specs  | Markdown + YAML frontmatter files on disk (the durable artifact)         |
| Rendered output   | Pre-rendered HTML on disk, produced by a **deterministic** renderer       |
| Enrichment        | **Local models** (whisper.cpp, local vision, local embeddings) — no cloud |
| Curators/designer | Headless Claude Code (`claude -p`)                                        |
| Agent ↔ catalog   | Read-only Deno **MCP server** over the catalog (text/structured only)    |
| Deployment        | Two machines over Tailscale — see [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) |

## The four parts (logical shapes)

Placement and lifecycle are in [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md); here is
what each part *is* in code.

| Part         | Shape                          | Notes                                        |
| ------------ | ------------------------------ | -------------------------------------------- |
| `capture`    | Deno HTTP server + React PWA   | receives uploads → archive                   |
| `catalog`    | coordinator (Deno service) + runner (Deno + local models) | see split below     |
| `studio`     | cron-invoked Deno scripts      | curate (`claude -p`) + deterministic render  |
| `exhibition` | Deno HTTP server + React SPA   | daily rotation, serves the gallery           |

Each HTTP server follows the house pattern: `main.ts` reads `HOST`/`PORT`, calls
`init()` in `server.ts`, which runs one `handler(req)` with manual regex routing —
`/api/*` first, then static files, then `index.html` SPA fallback. Required env
vars fail fast at module load.

## Repo layout

A single monorepo, following the `MrOggy85` house style (`api/` + `client/` per
deployable, extra services as sibling dirs):

```
capture/          # thin capture client — subject-facing server
  api/            # Deno: upload endpoint, reminder scheduling, serves the PWA
  client/         # React PWA: getUserMedia, record, upload
catalog/          # the cataloguer — objective, local-model indexing
  coordinator/    # server-side: find uncatalogued captures, publish + serve jobs,
                  #   ingest results, sole writer of catalog.sqlite (no models)
  runner/         # runs on the MacBook: pull jobs, run local models, post results
  mcp/            # read-only MCP server over catalog.sqlite (for curators)
studio/           # the creative part (cron batch)
  curate/         # curator run: picks a curator, runs claude -p, writes a spec
  render/         # deterministic spec -> HTML renderer + themes
  curators/       # curator definitions: architect@v1.md, filmmaker@v1.md, ...
exhibition/       # the gallery floor — visitor-facing server
  api/            # Deno: daily rotation, serves rendered exhibitions, takes feedback
  client/         # React SPA: the viewer
docs/             # the backbone (this file included)
```

Each `api/`/service carries its own `deno.json` (tasks + `imports` map, no inline
`jsr:`/`npm:` specifiers in source) and colocated `*_test.ts`. `fmt`: 120 cols,
semicolons, single quotes.

## The data stores (on disk)

All durable state lives under a single `/data` root **on the server**. The runner
is stateless (temp files only). Each SQLite file has **one writer**, which keeps
the append-only and one-way invariants from `ARCHITECTURE.md` structural rather
than conventional.

```
/data
  archive/
    2026/07/<capture_id>.mp4       # raw clips, content-addressed
    archive.sqlite                 # raw capture registry     [capture writes]
  catalog/
    catalog.sqlite                 # derived, text/structured [coordinator writes]
    jobs.sqlite                    # cataloguing job queue     [coordinator writes]
  collection/
    <exhibition_id>/
      spec.md                      # the durable artifact      [studio writes]
      index.html                   # pre-rendered output        [studio writes]
      meta.json                    # curator, created, theme    [studio writes]
  feedback/
    feedback.sqlite                # preference + integrity     [exhibition writes]
```

There are **no images or audio in the catalog** — the runner extracts frames and
audio to temp files while it works and discards them; only text and numbers are
written back. Writer/reader map:

| Store             | Writer                | Readers                          |
| ----------------- | --------------------- | -------------------------------- |
| `archive.sqlite`  | `capture`             | `catalog` coordinator            |
| clip files        | `capture`             | `catalog` runner (via API), `exhibition` |
| `catalog.sqlite`  | `catalog` coordinator | `studio` (agents, via MCP)       |
| `jobs.sqlite`     | `catalog` coordinator | — (served to runners over HTTP)  |
| `collection/`     | `studio`              | `exhibition`                     |
| `feedback.sqlite` | `exhibition`          | `studio`                         |

Backups are a single `restic`/`rsync` of `/data`; the archive and collection are
append-only, and the catalog can be rebuilt from the archive if lost.

## What the catalog contains

The catalog is the point where **pixels and sound become words and numbers.** The
cataloguer (local models) is the only thing that ever sees media; it reduces each
capture to an objective, queryable record, and the curator reasons purely over
that reduction. Nothing in the catalog is media, and nothing is interpretive.

One row per capture, roughly:

```
specimen
  capture_id            # → archive
  captured_at           # timestamp + timezone
  lat, lon              # coordinates
  place_name            # reverse-geocoded ("Nakameguro, Tokyo")
  duration_seconds
  motion_state          # still | walking | vehicle …
  time_of_day           # dawn | morning | midday | evening | night
  weather_temp_c
  weather_conditions    # clear | rain | overcast …
  dominant_colors       # [{hex, weight}, …]
  audio_events          # [traffic, birds, speech, music, silence, …]
  transcript            # from whisper.cpp (may be empty)
  scene_description     # one factual sentence from the local vision model
  ocr_text              # any legible text in frame
  objects               # [mug, bicycle, door, keyboard, …] (optional)
```

Plus two cross-cutting structures:

- **Full-text search** (SQLite FTS5) over `scene_description`, `ocr_text`,
  `transcript`, `place_name`.
- **Embeddings** — a vector per capture computed locally over the concatenated
  derived text, for similarity search ("what else is like this?"). Optional in the
  first cut.

And **provenance** on every record — which local model + version produced each
field, the `job_id`, and `catalogued_at` — so the catalog is reproducible and can
be selectively rebuilt when a model is upgraded.

Two consequences worth stating:

- **The catalog schema is the curator's entire world.** A curator's *"attends
  to"* and *"ignores"* (see [`CURATORS.md`](CURATORS.md)) are expressed as queries
  over these fields. New curatorial lenses usually need new catalog fields, not new
  curator code.
- **All fields are observational.** `scene_description` is "a doorway, wet
  pavement, overcast," never "a lonely morning." The voice rules in
  [`CLAUDE.md`](../CLAUDE.md) bind the cataloguer as much as the curator.

## The pipeline, concretely

```
capture ─▶ archive.sqlite ─▶ [coordinator: enqueue] ─▶ jobs.sqlite
                                                            │
                        (MacBook runner pulls, runs local models, posts back)
                                                            │
                             [coordinator: ingest] ─▶ catalog.sqlite
                                                            │
                             [curate job] ─── claude -p + read-only MCP ───┐
                                                            │              │
                                                            ▼              │
                                                  collection/<id>/spec.md  │
                                                            │              │
                             [render job] ─▶ collection/<id>/index.html    │
                                                            │              │
                             exhibition ◀─ daily rotation ◀─ collection/   │
                                                            │              │
                             feedback.sqlite ─▶ (read by future curate jobs)
```

Cataloguing is **local and pull-based** — the coordinator publishes work and the
MacBook runner drains it whenever it is powered on. The full mechanism (job
lifecycle, leases, endpoints, resilience) is in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).

### Curation (`studio/curate`)

One run authors one exhibition:

1. Pick a curator at random from `studio/curators/*.md` (e.g. `architect@v1`).
2. Run headless Claude Code with the curator definition as the task and the
   read-only catalog MCP attached:

   ```
   CLAUDE_CODE_OAUTH_TOKEN=… \
   claude -p --mcp-config catalog/mcp/.mcp.json \
     < studio/curators/architect@v1.md
   ```

3. The agent queries the catalog **only through the MCP** and emits an
   **Exhibition Spec** — Markdown + frontmatter, per
   [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md) — to `collection/<id>/spec.md`.
   Nothing is ever overwritten; the collection only grows.

The agent produces **the spec and only the spec** — never HTML, never a font
choice, and it **never touches the archive** (see below).

### Rendering (`studio/render`)

A **deterministic, non-LLM** Deno program reads `spec.md`, applies a theme (a
fixed CSS/layout template chosen per spec), and writes `index.html` +
`meta.json`. No model runs here — this is what makes every spec re-renderable
forever (the durability principle).

### Exhibition (`exhibition/api`)

Each day it selects one already-rendered exhibition from `collection/` and serves
its `index.html` plus the clips it references, streamed read-only from `archive/`
to the visitor's browser. That media read is **byte-serving to a human, never
model input**, so it does not breach the curator firewall. It records **feedback**
(preference + integrity, kept separate) into `feedback.sqlite`.

## Agent execution model (and the firewall)

- **Runtime:** headless Claude Code (`claude -p`), one process per curate job.
- **Curator = data, not prompt.** The curator Markdown file *is* the task input,
  keeping curators first-class, editable, and versioned (`name@version`).
- **The firewall.** Curators run on Anthropic models, so they must never see raw
  captures. Their only interface to the material is the read-only catalog MCP,
  which exposes **text and structured data only**:

  ```
  query_catalog(filters)        # by place, time, motion, color, object …
  search_text(query)            # FTS over transcript / scene / ocr
  search_embeddings(text, k)    # "what else is like this?" (if enabled)
  get_specimen(id)              # the catalog record for one capture
  list_locations()              # facets for querying
  ```

  There is **no tool that returns media** (no frame, no clip, no audio) and **no
  write tool**. The MCP opens `catalog.sqlite` with a read-only handle. The agent
  therefore cannot reach the archive at all — the boundary is structural, not
  advisory. The MCP lives with the `catalog` part because it is the catalog's own
  read interface; `studio` is merely a consumer.
- **Output is a file.** The agent writes `spec.md`; the render job takes over.

## Open questions (stack-level)

- **Embeddings in v1** — include local text embeddings from the start, or ship
  metadata + FTS queries first and add vector search later.
- **Object/tag extraction** — whether the local vision model emits an `objects`
  list in addition to a scene sentence (useful for anthropologist-style lenses).
- **Reminder delivery** — how the capture PWA sends its gentle prompts on a
  tailnet-only, no-cloud setup (web push vs. a local notifier).

(Deployment and scheduling questions live in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).)

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — responsibilities and data contracts.
- [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) — where each part runs; the catalog
  job system.
- [`CURATORS.md`](CURATORS.md) — the curator layer the studio runs.
- [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md) — the artifact a curate job emits.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine all generated text obeys.
</content>
