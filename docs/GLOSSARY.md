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
- **Index** — the queryable derived layer over the archive (metadata, locations,
  weather, motion, colors, audio events, embeddings, OCR, transcripts, scene
  descriptions). Curators query the index, not the raw archive.
- **Indexer** — the agent that builds and maintains the index.
- **Curator** — a first-class, editable, versioned authored perspective (e.g.
  `architect@v1`) that queries the index and produces exhibitions. Defined by
  methodology, not personality. See [`CURATORS.md`](CURATORS.md).
- **Exhibition** — a small, thesis-driven arrangement of specimens (typically
  5–8) produced by one curator. Rotates; not permanent.
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
