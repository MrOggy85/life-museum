import { parseSpec } from '../lib/spec.ts';
import { THEMES } from './themes.ts';

export const RENDERER_VERSION = 1;

export interface RenderInput {
  specText: string;
  theme: string;
  /** capture id -> YYYY-MM-DD; only consulted when the spec allows dates. */
  dates: Map<string, string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function themeFor(exhibitionId: string): string {
  let h = 0;
  for (const c of exhibitionId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const names = Object.keys(THEMES);
  return names[h % names.length];
}

function dateBlock(mode: string, date: string | undefined): string {
  if (!date || mode === 'never') return '';
  if (mode === 'always') return `<p class="date">${esc(date)}</p>`;
  return `<details class="date"><summary>Date</summary>${esc(date)}</details>`;
}

export function renderHtml(i: RenderInput): string {
  const spec = parseSpec(i.specText);
  const f = spec.front;
  const mode = typeof f.reveal_dates === 'string' ? f.reveal_dates : 'never';
  const css = THEMES[i.theme];
  if (css === undefined) throw new Error(`unknown theme: ${i.theme}`);

  const out: string[] = [];
  let section: string | null | undefined = undefined;
  for (const it of spec.items) {
    if (it.section !== section) {
      section = it.section;
      if (section) out.push(`<h2>${esc(section)}</h2>`);
    }
    const id = esc(it.id);
    out.push(
      `<figure class="specimen" id="s-${id}">` +
        `<video src="/media/${id}.mp4" controls muted loop playsinline preload="metadata"></video>` +
        `<figcaption><p class="placard">${esc(it.placard)}</p>${dateBlock(mode, i.dates.get(it.id))}</figcaption>` +
        `</figure>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(String(f.title ?? ''))}</title>
<style>${css}</style>
</head>
<body>
<header>
<h1>${esc(String(f.title ?? ''))}</h1>
<p class="thesis">${esc(String(f.thesis ?? ''))}</p>
</header>
<main>
${out.join('\n')}
</main>
<footer><p>${esc(String(f.curator ?? ''))}</p></footer>
</body>
</html>
`;
}
