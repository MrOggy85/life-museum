# Stack & Data

The concrete realization of [`ARCHITECTURE.md`](ARCHITECTURE.md): runtimes, code
layout, on-disk data formats, and **what the catalog is made of**. It stays
machine-agnostic — *where* each part runs, the **resource budget**, and the nightly
cataloguing batch live in [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).

The guiding constraint is the product's: **keep it simple**. Few dependencies, no
cloud services beyond curation, and every exhibition re-renderable years later
without a model. Two budgets shape every choice: the shared machine's memory/CPU, and
Claude spend.

## Constraints that shape the stack

- **Deno** on the server, **React** on the client, **minimal npm**. Prefer the
  standard library and a bare `Deno.serve` over frameworks.
- **Curators/designer are headless Claude Code** (`claude -p`), authenticated with
  a `CLAUDE_CODE_OAUTH_TOKEN`. They see the catalog and nothing else.
- **The cataloguer is local and tiered, cheapest first:** plain code (ffprobe,
  arithmetic) → small perception models (whisper.cpp, a small vision model,
  embeddings) → **Jeff**, a small zero-shot *text* classifier → Claude only for
  curation. Raw media never leaves the machine, and the curator's firewall from the
  archive is absolute. See [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#where-each-kind-of-work-goes).
- **Models are guests on a shared machine.** Nothing model-shaped stays resident
  when idle; they run as stage-by-stage containers inside a nightly window.
- **Claude spend scales with exhibitions, never with captures.**

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
| Enrichment        | **Tiered local**: code → whisper.cpp / small VLM / embeddings → Jeff (text tags) — no cloud |
| Curators/designer | Headless Claude Code (`claude -p`)                                        |
| Agent ↔ catalog   | Read-only Deno **MCP server** over the catalog (text/structured only)    |
| Deployment        | **One shared machine** (odin) over Tailscale — see [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) |

## The four parts (logical shapes)

Placement and lifecycle are in [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md); here is
what each part *is* in code.

| Part         | Shape                          | Notes                                        |
| ------------ | ------------------------------ | -------------------------------------------- |
| `capture`    | Deno HTTP server + React PWA   | receives uploads → archive                   |
| `catalog`    | cron-invoked Deno batch (+ model containers it starts and stops) and a read-only MCP | sole writer of the catalog |
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
catalog/          # the cataloguer — objective, local indexing
  batch/          # nightly batch: pre-flight, then stage by stage (code → whisper →
                  #   VLM → embeddings → Jeff); sole writer of catalog.sqlite
  stages/         # one module per stage: what a row lacks, how to fill it, which
                  #   model container it needs
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

All durable state lives under a single data root (written `/data` below; the real path
is `/mnt/usbssd/museum-data` — see [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#storage--backups)).
Temp frames/audio go to a scratch dir and are deleted per item. Each SQLite file has
**one writer**, which keeps the append-only and one-way invariants from
`ARCHITECTURE.md` structural rather than conventional.

```
/data
  archive/
    2026/07/<capture_id>.mp4       # raw clips, content-addressed
    archive.sqlite                 # raw capture registry     [capture writes]
  catalog/
    catalog.sqlite                 # derived, text/structured [catalog batch writes]
  collection/
    <exhibition_id>/
      spec.md                      # the durable artifact      [studio writes]
      index.html                   # pre-rendered output        [studio writes]
      meta.json                    # curator, created, theme    [studio writes]
  feedback/
    feedback.sqlite                # preference + integrity     [exhibition writes]
```

There are **no images or audio in the catalog** — the batch extracts frames and
audio to temp files while it works and discards them; only text and numbers are
written. Writer/reader map:

| Store             | Writer                | Readers                          |
| ----------------- | --------------------- | -------------------------------- |
| `archive.sqlite`  | `capture`             | `catalog` batch                  |
| clip files        | `capture`             | `catalog` batch, `exhibition`    |
| `catalog.sqlite`  | `catalog` batch       | `studio` (agents, via MCP)       |
| `collection/`     | `studio`              | `exhibition`                     |
| `feedback.sqlite` | `exhibition`          | `studio`                         |

There is no job queue: **pending work is derived from the catalog itself** (the captures
that lack a stage's output). Backups: the archive, collection and feedback are
irreplaceable and append-only; the catalog is rebuildable from the archive. All of it
must be added to the machine's existing borg/rclone jobs.

## What the catalog contains

The catalog is the point where **pixels and sound become words and numbers.** The
cataloguer (local code and models) is the only thing that ever sees media; it reduces
each capture to an objective, queryable record, and the curator reasons purely over
that reduction. Nothing in the catalog is media, and nothing is interpretive.

One row per capture, roughly. The comment names the **tier** that produces each field
(0 = plain code, 1 = small perception model, 2 = Jeff; see
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#where-each-kind-of-work-goes)) — always the
cheapest tier that can answer:

```
specimen
  capture_id            # → archive
  captured_at           # timestamp + timezone                       (from the client)
  lat, lon              # coordinates                                (from the client)
  place_name            # offline gazetteer, coarse, fully local (tier 0)
  duration_seconds      # ffprobe                                    (tier 0)
  motion_state          # still | walking | vehicle … GPS speed / frame difference (tier 0)
  time_of_day           # dawn | morning | midday | evening | night — solar position (tier 0)
  weather_temp_c        # NOT in v1 (no local source; would need cloud egress)
  weather_conditions    # NOT in v1 — same
  dominant_colors       # [{hex, weight}, …]                         (tier 0)
  audio_events          # [traffic, birds, speech, music, silence, …] — loudness/silence
                        #   by code (tier 0); labelled events need a model (open)
  transcript            # whisper.cpp, only if speech was detected   (tier 1)
  scene_description     # one factual sentence from the small VLM    (tier 1)
  ocr_text              # any legible text in frame                  (tier 1)
  tags                  # closed-vocabulary labels over the derived text,
                        #   e.g. [doorway, threshold, hands]; NULL when unsure (tier 2, Jeff)
  objects               # [mug, bicycle, door, keyboard, …] — optional; via tags or the VLM
```

Plus two cross-cutting structures:

- **Full-text search** (SQLite FTS5) over `scene_description`, `ocr_text`,
  `transcript`, `place_name`.
- **Embeddings** — a vector per capture computed locally over the concatenated
  derived text, for similarity search ("what else is like this?"). **Assumed in v1**
  (a small text-embedding model is cheap next to the VLM); still the first thing to
  drop if memory is tight, since FTS and tags cover most queries.

And **provenance per stage** on every record — which model + version produced each
field and `catalogued_at` — so the catalog is reproducible and can be selectively
rebuilt (one new Jeff question or one upgraded model re-runs only that stage over only
the affected rows).

**Absent is a valid value.** Jeff's near-zero confidence means "no opinion"; the
catalog stores NULL, not a guess. Every Jeff question is tuned against a small
hand-labelled fixture before its tag is trusted.

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
capture ─▶ archive.sqlite
                │
                │   nightly window: pre-flight, then stage by stage
                │   (code → whisper → VLM → embeddings → Jeff)
                ▼
          [catalog batch] ─▶ catalog.sqlite
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

Cataloguing is **local, batched and stage-major**: one process loads one model, works
through the whole backlog, stops it, then moves on — inside a time-boxed overnight
window, and only if the machine has the memory to spare. If a night is skipped the
catalog merely lags. The mechanism, resource budget and failure modes are in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#cataloguing-is-one-nightly-batch).

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

Curation is the only metered step, so each run is bounded (`--max-turns`, capped MCP
results), its usage is recorded in `meta.json`, the spec is voice-linted locally with a
one-retry cap, and a spend cap stops runs. Cadence (initially ~3 a week) is decoupled
from the gallery's daily rotation. Details in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md#claude-spend).

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
  overview()                    # shape of the catalog in one call: counts, facets, date range
  ```

  Results are **row-capped and terse** (a few dozen rows, short columns): each extra
  turn re-reads the whole context, so cheap, small answers are what keep a run cheap.

  There is **no tool that returns media** (no frame, no clip, no audio) and **no
  write tool**. The MCP opens `catalog.sqlite` with a read-only handle. The agent
  therefore cannot reach the archive at all — the boundary is structural, not
  advisory. The MCP lives with the `catalog` part because it is the catalog's own
  read interface; `studio` is merely a consumer.
- **Output is a file.** The agent writes `spec.md`; the render job takes over.

## Open questions (stack-level)

- **Embeddings in v1** — assumed in; drop first if memory is tight (FTS + tags
  cover most queries). Needs a benchmark.
- **Which small VLM**, and whether it emits an `objects` list in addition to a scene
  sentence. Its quality is the ceiling of what any curator can see; unbenchmarked.
- **The tag vocabulary** Jeff answers (≤ 26 options per question) — derived from what
  curators actually ask for.
- **Reminder delivery** — how the capture PWA sends its gentle prompts on a
  tailnet-only, no-cloud setup (web push vs. a local notifier).

(Deployment and scheduling questions live in
[`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).)

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — responsibilities and data contracts.
- [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) — where each part runs; the resource
  budget, nightly cataloguing batch and Claude cost controls.
- [`CAPTURE.md`](CAPTURE.md) — the capture client design.
- [`CURATORS.md`](CURATORS.md) — the curator layer the studio runs.
- [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md) — the artifact a curate job emits.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine all generated text obeys.
</content>
