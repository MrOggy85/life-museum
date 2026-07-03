# Architecture

The system is one **archive** feeding three independently deployed parts. This
document describes responsibilities and data contracts only — no technology
choices. Stack decisions are deferred to a later planning session.

## The system at a glance

The parts are deliberately separate, mirroring a real museum: the workshop and
storage (`studio`) are off-limits to the public; the gallery floor (`exhibition`)
shows only a fraction at any time.

```
capture ──▶ ARCHIVE ──▶ studio ──▶ COLLECTION ──▶ exhibition ──▶ visitor
(subject)   + index     (curators,  (rendered      (gallery       │
                         designer)   exhibitions,   floor, daily   │
                             ▲        permanent)     rotation)     │
                             │                                     │
                             └──────────── feedback ◀──────────────┘
              (informs which curator to surface / whether to author a new version)
```

UPPERCASE = shared stores; lowercase = the three deployed parts (plus the
subject/visitor). Two things never happen: the archive is never fed directly to an
LLM (the index sits between), and produced exhibitions are never deleted (the
collection only grows; scarcity lives on the floor, not in storage).

## Three parts

### 1. `capture/` — the thin client

A minimal webapp whose only job is to feed the archive. Separate deployment.

- Opens directly to the camera (`getUserMedia`).
- Records a short clip (target 2–5 seconds).
- Uploads immediately, with metadata: timestamp, GPS, and whatever the device
  provides (motion state, etc.).
- **Freeform capture.** The subject records whenever they like, as often as they
  like — several times a day is welcome. There is no quota and no fixed schedule.
- **Reminders, not obligations.** The client sends gentle notifications across the
  day (morning, lunch, afternoon, evening) to prompt capture. They encourage; they
  never nag or require.
- **No review, no browsing, no delete.** Today's captures cannot be inspected. The
  separation of capturing from reviewing is the point — it encourages documenting
  life rather than curating it.
- Prefer real video (H.264/HEVC MP4). No GIF.

### 2. `studio/` — the creative agents and the collection

Where curation happens, and where finished work is kept. Runs **on a schedule,
independent of any user visit**, and each agent runs **independently of the
others**. Houses the indexer, the curators, and the designer (see the pipeline
below).

Each production run selects a curator (at random) to author an exhibition, which
is then designed, rendered, and **saved permanently** to the **collection**. Like
a museum's storage, the collection is off-limits to visitors and only grows —
nothing is ever discarded. The exhibition webapp draws from it but cannot alter
it.

### 3. `exhibition/` — the viewer (the gallery floor)

The webapp a visitor opens. Each day it selects, **at random**, one
already-rendered exhibition from the studio's collection and puts it on display.
The visitor sees a deliberately limited experience that **rotates daily** —
scarcity by presentation, not by deletion; the permanent collection behind it
stays vast. It does not curate or generate; it presents. It also collects
feedback (see [`CURATORS.md`](CURATORS.md)).

The exact rotation and selection mechanism (how many are shown, how "random" is
weighted, whether a visitor can revisit yesterday's) is left to flesh out later.

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
  selected captures, ordering, and placards. **Never writes HTML or picks fonts.**
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

## The shared store

The three parts never talk to each other directly; they meet at shared storage.
Conceptually there are two stores (their concrete shape — files, database, object
storage — is a later decision):

- **Archive + index** — raw captures, their metadata, and the derived index.
- **Collection** — the finished, rendered exhibitions and their specs.

The read/write contract between the parts is deliberately narrow and one-way where
possible:

| Part         | Reads                        | Writes                                   |
| ------------ | ---------------------------- | ---------------------------------------- |
| `capture`    | —                            | captures + metadata → **archive** (append-only) |
| `studio`     | archive, index, feedback     | index; exhibitions → **collection** (append-only) |
| `exhibition` | collection                   | feedback                                 |

Two invariants fall out of this: `capture` and `studio` only ever *add* to their
stores (nothing is deleted), and `exhibition` can *read* the collection but never
change it — the gallery floor cannot edit the vault.

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
