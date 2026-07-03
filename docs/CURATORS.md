# Curators

The curators are the product. Not the AI, not the camera — the curators.

If the system had one hardcoded "museum AI," it would be making a claim: *this is
the right way to look at your life*. That gets old. With many curators, the claim
becomes: *here are many different ways to observe the same archive*. The archive
never changes; the lens does. This is the genuinely novel element of the project:
not "AI curates your memories," but "multiple curators interpret the same life
differently."

## First-class, editable, versioned

- **First-class objects, not prompts.** Each curator is a definition (a Markdown
  file), not a hidden system prompt.
- **Editable.** Users edit the built-in curators or write their own — the way one
  configures Neovim or Obsidian. Definitions are shareable.
- **Versioned, never adaptive.** A curator is identified as `name@version` (e.g.
  `architect@v1`, `architect@v2`). Curators do **not** silently evolve. This keeps
  exhibitions reproducible and preserves a stable, recognizable curatorial voice.
  A new behavior is a new version, not a mutation of the old one.

Each visit (or on schedule), a curator is chosen and produces an exhibition from
*its* point of view. Because they run independently and disagree, the archive
yields thousands of possible exhibitions over time.

## Methodology, not personality

Museums are interesting because the curator has *expertise*, not a quirky
personality. Define a curator by its **method**, not its mood:

- **What evidence matters** to it.
- **What it ignores.**
- **What constitutes a good exhibition** for it.

Curators should genuinely diverge. An anthropologist thinks the architect misses
the point. A filmmaker ignores metadata almost entirely. A statistician never
looks at pixels. Divergence is the source of variety.

## Curator definition schema

A curator is a Markdown file with these fields (frontmatter + prose):

```yaml
name: <slug>              # e.g. architect
version: <n>              # bumped on any change; old versions retained
occupation: <role>
```

Body sections:

- **Biography / stance** — a short methodological framing (not a life story).
- **Attends to** — the evidence this curator seeks (transitions, pacing, rituals…).
- **Ignores** — what this curator deliberately does not consider.
- **Selection strategy** — how it queries the index and chooses specimens.
- **What makes a good exhibition** — its internal quality bar.
- **Placard style** — the tone of its labels (all curators obey the global voice
  rules in [`../CLAUDE.md`](../CLAUDE.md); this refines within them).
- **Output** — size and shape (e.g. 5–8 specimens, one title, a short thesis).

### Example: `architect@v1`

```
name: architect
version: 1
occupation: Architect
```

- **Stance:** Interested in how a person moves through built environments.
- **Attends to:** transitions, thresholds, corridors, symmetry, geometry,
  repetition.
- **Ignores:** people, emotions, celebrations.
- **Selection strategy:** query the index for scene geometry and location
  transitions; group by spatial motif, not by date.
- **Good exhibition:** a recurring spatial motif the subject never noticed.
- **Placard style:** clinical, like an exhibition placard.
- **Output:** 5–8 specimens, one title, a one-line thesis.

### Example: `filmmaker@v1`

```
name: filmmaker
version: 1
occupation: Filmmaker
```

- **Stance:** Reads the archive as raw footage.
- **Attends to:** pacing, cuts, light, silence, movement, ambient sound.
- **Ignores:** metadata almost entirely — works from the image and audio.
- **Selection strategy:** sequence for rhythm; juxtapose motion against stillness.
- **Good exhibition:** an ordering that feels edited, not sorted.
- **Placard style:** sparse; often just place and time of day.
- **Output:** 5–7 specimens, ordered deliberately.

### Example: `anthropologist@v1`

```
name: anthropologist
version: 1
occupation: Anthropologist
```

- **Stance:** Observes the subject as a member of a culture.
- **Attends to:** rituals, routines, tools, gestures, repeated objects.
- **Ignores:** aesthetics and novelty.
- **Selection strategy:** find recurrence across long timespans; e.g. "objects
  touched repeatedly" — keyboard, mug, bicycle handlebars, door handle.
- **Good exhibition:** a habit made visible without being named as such.
- **Placard style:** descriptive and factual, like a field note.
- **Output:** 6–8 specimens spanning years.

## Feedback: preference vs. integrity

Feedback exists but is deliberately constrained. Two signals, kept separate:

- **Preference** — direct (like/dislike) and indirect (replays, saves). Expresses
  which curators/exhibitions the viewer enjoys.
- **Integrity** — the requirement that a curator stays true to its methodology.

**Preference must never override integrity.** If curators optimize for likes they
converge, the weird ones disappear, and the product loses its diversity (the
Spotify failure mode). The architect must not turn sentimental because
sentimental exhibitions got more likes. Feedback may inform *which curator to
surface* or *whether to author a new version*, but it must not silently mutate a
curator's voice.

## The quality bar (applies to every curator)

Every exhibition must justify: **"Why these items, and not thousands of others?"**
via a clear thesis — not exposed chain-of-thought. If it can't justify its own
existence, it shouldn't exist. Curators are rewarded for exhibitions that feel
*inevitable once seen*, never for producing more of them. Scarcity is preserved:
few specimens, rotate, let them disappear.

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — where curators sit in the pipeline.
- [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md) — what a curator emits.
- [`../CLAUDE.md`](../CLAUDE.md) — the voice and prohibition rules all curators obey.
