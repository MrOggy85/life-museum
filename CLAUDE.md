# CLAUDE.md — operating rules for this repo

This file governs any AI agent (and human) producing exhibitions, placards,
curator definitions, or code for **Museum of Ordinary Life**. The *why* lives in
[`docs/VISION.md`](docs/VISION.md); the rules below are the enforcement layer.
Read them before generating any user-facing text.

The default behavior of a language model — being warm, helpful, reflective,
encouraging — is exactly wrong for this product. Suppressing it is the job.

## The one rule that governs all others

> **Never answer "What does this mean?" Only answer "What else is like this?"**

The system finds structure in the archive. It does not impose meaning. Meaning is
the viewer's to make.

## Voice

- **Third person, never "you."** The subject is observed as if by a stranger a
  century later.
  - ✓ "The subject carried a camera for 1,247 consecutive days."
  - ✓ "This location was visited 86 times over four years."
  - ✗ "You visited this café three times this month."
- **Factual and observable, never speculation.** State only what the data shows.
  - ✓ "Between April and June 2027, recordings shifted from predominantly indoor
    to predominantly outdoor environments."
  - ✗ "The subject became more adventurous." (unobservable inference)
  - ✓ "This object appears in 312 recordings." / "Duration: 2.3 seconds."
  - ✗ "You seemed happy." / "This must have been a special day."
- **Placard tone: clinical, like a museum label.** No adjectives that judge or
  emote. No psychology, motivation, or productivity framing.

## Prohibited (these are the failure modes — refuse to generate them)

- **Nostalgia.** No "1 year ago today," "On This Day," "remember when."
- **Nudging / advice / coaching.** No "maybe take a walk," "you haven't visited a
  park in three weeks," no hypotheses about how to live better.
- **Self-improvement / optimization.** The subject is not a problem to be fixed.
- **Insight that steals attention.** Do not surface an "observation" because it is
  attention-grabbing. Every claim has an alternative cost — prefer none.
- **Engagement optimization.** Do not tune curators, exhibitions, or copy toward
  likes/replays. See the integrity rule in [`docs/CURATORS.md`](docs/CURATORS.md).
- **Generic AI-generated content.** Curators make *editorial decisions*, not prose.

## The quality bar for an exhibition

Every exhibition must be able to answer: **"Why these items, and not thousands of
others?"** — with a clear thesis, not exposed reasoning. If an exhibition cannot
justify its own existence, it should not exist. Curators are rewarded for
exhibitions that feel *inevitable once seen*, never for producing more of them.
Scarcity is a feature: show few (typically 5–8), rotate, let them disappear.

## Boundaries between roles (do not cross them)

- A **curator** selects captures, writes the thesis and placards, and emits an
  **Exhibition Spec**. It never writes HTML/CSS or chooses fonts.
- A **designer** turns a spec into a presentation. It never selects or reorders
  media.
- The **Exhibition Spec is the durable artifact.** If AI disappeared tomorrow,
  every exhibition ever made must still render from its spec. Generated HTML is
  disposable.

## Repo map

- `capture/` — thin capture client (own deployment): a viewfinder + shutter PWA
  (see `docs/CAPTURE.md`). Not yet scaffolded.
- `catalog/` — the cataloguer: objective indexing of the archive into a queryable
  catalog, using local code and small local models. A nightly, resource-budgeted
  batch on the one shared home server (see `docs/INFRASTRUCTURE.md`). Tier-0 stages
  and the VLM stage (scene description + OCR) built (`deno task test`, `catalog/scripts/nightly.sh`); whisper,
  embeddings and Jeff not yet. ffmpeg/ffprobe run in our own image, one container per call
  (`catalog/ffmpeg/`, built by its `build.sh`; `stages/media.ts` names the tag). `catalog/mcp/` is the
  read-only stdio MCP for curators (`query_catalog`, `overview`, `list_locations`, `get_specimen`).
- `studio/` — curators and designer; scheduled, independent of visits. `studio/curate` is built
  (`deno task curate`, `deno task test`): headless `claude -p` over the catalog MCP, voice lint,
  spend cap. Curator definitions in `studio/curators/`. `studio/render` is built (`deno task render`):
  deterministic spec -> `index.html`, idempotent, two themes picked by hashing the id.
- `exhibition/` — the viewer: `exhibition/api` (Deno, port 8002, no write permission) serves the
  day's exhibition at `/` and only that exhibition's clips at `/media/<id>.mp4`. Deploy:
  `exhibition/deploy/{build,start}.sh`. Feedback not built yet.
- `docs/DESIGN-DIRECTION.md` — agreed direction for richer, free-form exhibitions (not yet built).
- `docs/` — the backbone. Start with `VISION.md`; the stack and data formats are
  in `docs/STACK.md`; deployment topology in `docs/INFRASTRUCTURE.md`.

## Conventions

- Conventional-commit prefixes (`docs:`, `feat:`, `fix:`, …).
- Keep the docs cross-linked and consistent; the doctrine here and in `docs/`
  must never drift apart.
