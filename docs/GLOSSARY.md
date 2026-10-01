# Glossary

Canonical vocabulary. Code, docs, curator definitions, and agents should use
these terms consistently.

- **Archive** — the complete collection of raw captures and their metadata. The
  material never changes; only the way it is arranged does.
- **Capture / Clip** — a single short recording (target 2–5 seconds) produced by
  the capture client, uploaded immediately and never reviewed by the subject.
- **Specimen** — a capture as presented in an exhibition: shown with factual
  metadata as evidence, not as a "memory."
- **Subject** — the person whose life the archive documents. Referred to in the
  third person, never as "you."
- **Catalog** — the queryable, objective, **text-and-structured-only** layer
  derived from the archive (metadata, locations, weather, motion, colors, audio
  events, embeddings, OCR, transcripts, scene descriptions — never media). The
  point where pixels and sound become words and numbers. Curators query the
  catalog, not the raw archive. See [`STACK.md`](STACK.md#what-the-catalog-contains).
- **Cataloguer** — the part that builds and maintains the catalog. Objective, not
  creative: it records what is observably present, using plain code and **local
  models** so raw media never leaves the machine. It may use a model only to observe,
  transcribe and label, never to interpret or arrange. Runs as one **nightly batch**
  on the single shared server and is the sole writer of the catalog. See
  [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).
- **Tier** — the cost class of a piece of work, always chosen cheapest-first:
  0 plain code, 1 small perception models (speech, vision, embeddings), 2 **Jeff**,
  3 Claude (curation only).
- **Jeff** — a small local zero-shot *text* classifier. Answers closed-vocabulary
  questions (choice, yes/no, score) over text the perception tier already produced;
  never sees media. A shared, lease-managed service (`~/jeff`, port 8781; poker-ai is another client): started on demand inside the batch window, one request at a time, and stopped by the service itself when no client holds a lease.
- **Stage** — one step of the batch (e.g. whisper, VLM, embeddings, Jeff). Pending work
  is "the captures lacking that stage's output"; each stage records model + version
  per field, so it can be re-run selectively.
- **Batch window** — the time-boxed overnight slot when models may run. Starts only if
  pre-flight finds enough free memory and no competing workload; a skipped night just
  means the catalog lags.
- **Curator** — a first-class, editable, versioned authored perspective (e.g.
  `architect@v1`) that queries the catalog and produces exhibitions. Defined by
  methodology, not personality. See [`CURATORS.md`](CURATORS.md).
- **Exhibition** — a small, thesis-driven arrangement of specimens (typically
  5–8) produced by one curator. Once rendered it is kept permanently; what
  rotates is which exhibition the gallery floor *displays*, not the exhibition
  itself.
- **Collection** — the permanent, ever-growing store of finished (rendered)
  exhibitions held by the studio. Off-limits to visitors, like a museum's
  storage; the exhibition webapp draws from it but never alters it.
- **Thesis** — the reason an exhibition's specimens belong together. The answer to
  "why these items, and not thousands of others?" Stated as a title/short line,
  never as exposed reasoning.
- **Placard** — the factual, third-person label shown with a specimen. Museum
  tone; no interpretation.
- **Exhibition Spec** — the durable, renderer-independent representation of an
  exhibition (Markdown + frontmatter). The lasting artifact. See
  [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md).
- **Designer** — turns an Exhibition Spec into a presentation (layout,
  typography, transitions). Never selects or reorders media.
- **Renderer** — emits a concrete output (HTML, PDF, slideshow, video, print)
  from a designed spec. One of several possible outputs.
- **Feedback** — signals from the viewer, split into **preference** ("I like this
  curator/exhibition") and **integrity** ("this curator stays true to itself").
  Preference must never override integrity. See [`CURATORS.md`](CURATORS.md).
