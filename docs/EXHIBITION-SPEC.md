# Exhibition Spec

The Exhibition Spec is the **durable artifact** of the system. A curator emits a
spec; a designer and renderer consume it. If AI disappeared tomorrow, every
exhibition ever created must still render from its spec. It therefore holds
*content only* — no HTML, no styling, no layout.

Format: **Markdown with YAML frontmatter.** Human-readable, easy to diff, debug,
hand-edit, and regenerate.

## Worked example

```markdown
---
title: Thresholds
thesis: A study of transitions between spaces.
curator: architect@v1
created: 2026-07-03
reveal_dates: after            # withhold capture dates until after viewing
---

![](capture_182)
Apartment entrance. Tokyo. Morning.

![](capture_912)
Train platform. Dusk.

![](capture_288)
Café doorway. Overcast.

![](capture_777)
Forest trailhead. Midday.

![](capture_040)
Ferry gangway. Wind.
```

Each specimen is an image/clip reference (`capture_<id>`) followed by its
**placard** — a factual, third-person label (see the voice rules in
[`../CLAUDE.md`](../CLAUDE.md)). Order in the file is the exhibition order.

## Frontmatter fields

| Field          | Required | Meaning                                                          |
| -------------- | -------- | ---------------------------------------------------------------- |
| `title`        | yes      | The exhibition's name — often the only stated commonality.       |
| `thesis`       | yes      | Why these specimens belong together. One line; not exposed reasoning. |
| `curator`      | yes      | `name@version` of the authoring curator (e.g. `architect@v1`).   |
| `created`      | yes      | Date the exhibition was produced.                                |
| `sections`     | no       | Optional grouping (see below) when a flat list is insufficient.  |
| `reveal_dates` | no       | `never` \| `after` \| `always` — when capture dates are shown.   |

## Sections (optional)

When a curator wants named groups rather than a flat sequence, declare sections
in frontmatter and tag each item. Prefer the flat form above unless grouping
carries meaning.

```markdown
---
title: Thresholds
thesis: A study of transitions between spaces.
curator: architect@v1
created: 2026-07-03
sections:
  - Entering
  - Leaving
---

## Entering

![](capture_182)
Apartment entrance. Tokyo. Morning.

## Leaving

![](capture_288)
Office lobby. Evening.
```

## Rules

- The curator writes the spec and **only** the spec — never HTML, CSS, or layout.
- Capture references point into the archive by ID; the spec never embeds media.
- Placards obey the global voice rules: third person, factual, no interpretation.
- A spec must carry enough to be re-rendered by any designer/renderer years later
  with no model involved.

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — where the spec sits in the pipeline.
- [`CURATORS.md`](CURATORS.md) — who produces it.
- [`GLOSSARY.md`](GLOSSARY.md) — term definitions.
