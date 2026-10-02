# Design direction: experience, not a list

Decided 2026-10-02 with the owner, after seeing the first rendered exhibition ("Loud Cut, Silent Cut").
Status: **direction agreed, not yet built.** Related: [`EXHIBITION-SPEC.md`](EXHIBITION-SPEC.md),
[`CURATORS.md`](CURATORS.md), [`GLOSSARY.md`](GLOSSARY.md) (Designer, Renderer).

## The problem
The renderer emits one shape: title, thesis, then clip, text, clip, text, all vertical. That is fine for some
exhibitions (press-play clips suit the first one) but is far too narrow. An exhibition should be able to be an
*experience*, free-form and surprising, not only a column.

## Decisions
- **Target viewer: a laptop in Brave/Chrome.** It has the most canvas for expression. Phones are secondary.
- **Playback is a per-specimen choice**, not a global rule: press-play, silent loop, starts when scrolled into view,
  play on hover, with or without sound. Press-play stays valid where it fits.
- **Autoplay with sound is possible but trust-gated.** Chrome and Brave allow it once the site has built up media
  engagement or the owner sets the site's Autoplay/Sound to Allow. (An earlier claim that only muted autoplay works
  was wrong.) A page cannot grant itself that trust, so the player must try with sound and, on `NotAllowedError`,
  fall back to muted playback with a click-for-sound affordance. Never assume sound will start.
- **Sound is optional.** Many specimens are fine silent.
- **GIF-like loops are welcome, but not as real GIFs.** A muted, looping, inline `<video>` looks identical and is
  smaller, with more than 256 colours. Derived loops (trimmed segment, forward-and-back "boomerang") may be generated
  with ffmpeg as *copies*; the archive original is never touched.
- **The designer is open-ended** (the owner prefers surprise). Each exhibition may get its own layout, motion and
  styling instead of a pick from a fixed menu.

## Shape (how it fits the doctrine)
The role boundaries in `CLAUDE.md` stay: a curator selects and writes; a designer never selects or reorders media;
the spec is the durable artifact.

1. **Richer spec vocabulary** (deterministic renderer): arrangement (grid, filmstrip, wall of loops, full-bleed focus,
   scatter, data-positioned), per-specimen playback mode, pacing, scale, emphasis. Cheap, and every exhibition benefits.
2. **A designer step** (AI, open-ended): reads the finished spec plus catalog text, never the media, and writes a
   *design artifact* stored beside `spec.md`: constrained CSS and a little script, linted, no network, under the
   existing CSP. The page is rendered from spec + design. If the designer disappears, exhibitions still render from
   the spec with the default design.

Build order: vocabulary and playback modes first, then the designer step once we can see what the vocabulary
leaves unsaid.

## Open
- Concept examples for the owner to review (placeholders, no personal media): see `docs/design-concepts.html`.
- How the designer's output is linted (allowed CSS/JS surface) and how a bad design degrades to the default.
- Whether the voice rules apply to the designer's text (they should: no added copy beyond the placards).
