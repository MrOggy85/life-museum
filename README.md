# life-museum

**Museum of Ordinary Life**

A self-hosted archive of an ordinary life, presented like a museum.

You capture a few seconds of video now and then. You never review or curate what
you shot. Over months and years the clips accumulate into an archive. AI
**curators** — each with a distinct methodology — periodically produce rotating
**exhibitions** drawn from that archive: a handful of clips arranged around a
thesis, presented with factual placards and no commentary. The viewer decides
what it means.

> This is not *me*. This is a person who lived a life. Almost as if it's a museum
> showing images, data, and facts about someone who lived 100 years ago.

## What it is / is not

- **Is:** an archive, curated like a natural-history museum — factual,
  third-person, arrangement over explanation.
- **Is not:** a nostalgia app, a journal, a life coach, a self-improvement tool,
  or another photo gallery.

The guiding constraint: the system never answers *"What does this mean?"* — only
*"What else is like this?"*

## Repository layout

The project is one archive feeding three independently deployed parts. Only the
documentation exists today; the components below are the intended structure, not
yet scaffolded.

| Path          | Role                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `capture/`    | Thin capture client — records a short clip and uploads it. Own deploy. |
| `studio/`     | The creative agents (indexer, curators, designer) + the permanent collection of exhibitions. Run on a schedule. |
| `exhibition/` | The viewer webapp — shows one exhibition from the collection, rotating daily. |

## Documentation

Read these in order; they are the backbone of the project.

1. [`docs/VISION.md`](docs/VISION.md) — the philosophy and its boundaries.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the parts and the pipeline.
3. [`docs/CURATORS.md`](docs/CURATORS.md) — the curator system (the novel core).
4. [`docs/EXHIBITION-SPEC.md`](docs/EXHIBITION-SPEC.md) — the durable artifact format.
5. [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — canonical vocabulary.

`chatgpt-session.txt` is the original ideation transcript the vision was
distilled from, kept for provenance.

Contributors and AI agents working in this repo must also follow
[`CLAUDE.md`](CLAUDE.md), which restates the doctrine as hard rules.
