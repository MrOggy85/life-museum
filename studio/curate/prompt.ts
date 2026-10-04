export interface Curator {
  id: string; // name@vN
  name: string;
  text: string; // the definition file, verbatim
}

/** The doctrine sections of the repo CLAUDE.md the curator must obey. */
export function doctrineFrom(claudeMd: string): string {
  const a = claudeMd.indexOf('## The one rule');
  const b = claudeMd.indexOf('## Boundaries between roles');
  if (a < 0 || b < 0 || b < a) throw new Error('CLAUDE.md doctrine sections not found');
  return claudeMd.slice(a, b).trim();
}

export const DECLINE_PREFIX = 'DECLINE:';

export function buildPrompt(curator: Curator, doctrine: string, maxTurns: number, feedback?: string): string {
  return `You are the curator "${curator.id}" of the Museum of Ordinary Life. Produce one Exhibition Spec from the catalog.

# Doctrine (binding)

${doctrine}

# Your definition

${curator.text.trim()}

# How to work

- Query the catalog only through the tools provided. Call overview() first. You have at most ${maxTurns} turns in total, so use few, well-chosen queries.
- Use only specimen ids returned by the tools, copied exactly. Never invent an id.
- Use only fields the catalog actually holds (overview() lists what is not there yet). Describe only what the data shows.
- If the catalog cannot support an exhibition that answers "Why these items, and not thousands of others?" for your method, do not force one. Reply with a single line: ${DECLINE_PREFIX} <one-sentence reason>.

# Output format

Output the spec and nothing else: no commentary, no code fence. Do not write curator or created; they are added for you.

---
title: <short name, under 80 characters, no punctuation like ! or ?>
thesis: <one line, under 200 characters: why these specimens belong together>
reveal_dates: never | after | always   # optional
arrangement: list | wall | corridor | dial   # optional, default list; see "Arrangement" below
sections:                               # optional; only if grouping carries meaning
  - <name>
---

![](capture_<id>)
<placard: factual, third person, one or two short sentences>

![](capture_<id>)
<placard>

Arrangement (optional, a presentation choice only; the specimens and their order stay yours):
- list: one clip after another, press play. The default.
- wall: all clips shown together as silent loops; suits many short clips sharing one property. Up to 24 specimens.
- corridor: clips in a row walked through by scrolling; suits an order in time or place.
- dial: clips placed on a 24-hour ring by local time of capture; suits a theme that varies by hour. Not for exhibitions about place only.
A specimen may carry a playback mode as the image text, e.g. ![loop](capture_<id>): press (controls, default for list), loop (silent loop while in view),
view (loop with sound while in view), hover (plays on pointer or tap). Use it sparingly; most specimens need none. Never write layout, CSS or HTML.

Rules: specimens appear in exhibition order; each reference is followed by its placard on the next line; blank line between specimens; if you declare sections, use each as a "## <name>" heading. Placards state observable facts only (place, time of day, motion, audio, colors, counts, dates). The subject is never "you".
${
    feedback
      ? `\n# Correction needed\n\nYour previous spec was rejected by the voice and structure checks:\n${feedback}\n\nProduce a corrected, complete spec. Fix every item above.\n`
      : ''
  }`;
}
