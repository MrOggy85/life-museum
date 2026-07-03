# Architecture

The system is one **archive** feeding three independently deployed parts. This
document describes responsibilities and data contracts only — no technology
choices. Stack decisions are deferred to a later planning session.

## Three parts

### 1. `capture/` — the thin client

A minimal webapp whose only job is to feed the archive. Separate deployment.

- Opens directly to the camera (`getUserMedia`).
- Records a short clip (target 2–5 seconds).
- Uploads immediately, with metadata: timestamp, GPS, and whatever the device
  provides (motion state, etc.).
- **No review, no browsing, no delete.** You cannot inspect today's captures. The
  separation of capturing from reviewing is the point — it encourages documenting
  life rather than curating it.
- Prefer real video (H.264/HEVC MP4). No GIF.

### 2. `studio/` — the creative agents

Where curation happens. Runs **on a schedule, independent of any user visit**,
and each agent runs **independently of the others**. Houses the indexer, the
curators, and the designer (see the pipeline below). Its output — exhibitions —
is written back for the exhibition webapp to pick up.

### 3. `exhibition/` — the viewer

The webapp a visitor opens. It picks up an already-produced exhibition and
showcases it. It does not curate or generate; it presents. It also collects
feedback (see [`CURATORS.md`](CURATORS.md)).

## The pipeline

The spine of the system. Each stage mirrors a role in a real museum, and the
boundaries between roles are strict.

```
Archive → Indexer → Curator → Exhibition Spec → Designer → Renderer
```

- **Archive** — the raw captures plus their metadata. Never fed directly to an
  LLM.
- **Indexer** — builds a queryable **index** over the archive: metadata,
  locations, weather, motion, time of day, dominant colors, audio events,
  embeddings, OCR, transcripts, scene descriptions. A curator queries this, just
  as a museum curator consults the catalog rather than walking through storage.
- **Curator** — an authored perspective (architect, filmmaker, anthropologist…).
  Queries the index and produces the exhibition's *content*: title, thesis,
  selected assets, ordering, and placards. **Never writes HTML or picks fonts.**
  See [`CURATORS.md`](CURATORS.md).
- **Exhibition Spec** — the structured, renderer-independent output (Markdown +
  frontmatter). See [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md).
- **Designer** — turns a spec into a presentation: layout, typography,
  transitions, color, interaction. **Never selects or reorders media.** May be a
  fixed theme or itself an LLM ("design a page inspired by Dieter Rams").
- **Renderer** — emits a concrete output from the designed spec: HTML, PDF,
  slideshow, video, print. HTML is just one renderer, not *the* output.

Why the separation: a curator doesn't choose fonts; a graphic designer doesn't
decide which artifacts belong in the show; a printer doesn't redesign the
catalog. Keeping these apart lets a new curator or a new theme appear later
without rewriting anything upstream.

## The durability principle

**The Exhibition Spec is the lasting artifact.** If AI disappeared tomorrow,
every exhibition ever created must still be renderable from its spec. Generated
HTML is disposable; the spec becomes part of the archive itself. This is why the
curator's output must be structured data, never HTML.

Corollary: do not give the renderer free rein to "build anything," or every
exhibition becomes a bespoke software project (React here, shaders there). The
spec is the stable contract; renderers are constrained consumers of it.

## Bootstrapping the archive

Capturing daily for years is the hardest part of any lifelog, and a thin archive
has little to curate. The system is seeded by a **controlled import job** over an
existing photo/video collection, so there is rich material to curate from day
one rather than after a year of discipline.

## Related

- [`VISION.md`](VISION.md) — why the system is shaped this way.
- [`CURATORS.md`](CURATORS.md) — the curator layer in detail.
- [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md) — the spec format.
- [`GLOSSARY.md`](GLOSSARY.md) — terms used above.
