import { ARRANGEMENTS, parseSpec, type SpecItem } from '../lib/spec.ts';
import { THEMES } from './themes.ts';

export const RENDERER_VERSION = 3;

export interface RenderInput {
  specText: string;
  theme: string;
  /** capture id -> YYYY-MM-DD; only consulted when the spec allows dates. */
  dates: Map<string, string>;
  /** capture id -> local hour of capture as a fraction (13.5 = 13:30); only the dial arrangement uses it. */
  hours?: Map<string, number>;
}

export type Arrangement = (typeof ARRANGEMENTS)[number];

const DEFAULT_PLAY: Record<Arrangement, string> = { list: 'press', wall: 'loop', corridor: 'loop', dial: 'loop' };

function arrangementOf(front: Record<string, unknown>): Arrangement {
  const a = String(front.arrangement ?? 'list');
  return (ARRANGEMENTS as readonly string[]).includes(a) ? a as Arrangement : 'list';
}

function jitter(id: string, salt: number): number {
  let h = salt;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

function figure(it: SpecItem, arr: Arrangement, dateHtml: string, extraAttrs = '', style = ''): string {
  const id = esc(it.id);
  const play = it.play ?? DEFAULT_PLAY[arr];
  const muted = play === 'press' || play === 'view' ? '' : ' muted';
  return `<figure class="specimen" id="s-${id}" data-play="${play}"${extraAttrs}${style ? ` style="${style}"` : ''}>` +
    `<video src="/media/${id}.mp4" controls${muted} loop playsinline preload="metadata"></video>` +
    `<figcaption><p class="placard">${esc(it.placard)}</p>${dateHtml}</figcaption>` +
    `<button class="sound" type="button" tabindex="-1" aria-hidden="true">tap for sound</button></figure>`;
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

  const arr0 = arrangementOf(f);
  const hours = i.hours ?? new Map<string, number>();
  const arr: Arrangement = arr0 === 'dial' && spec.items.some((it) => !hours.has(it.id)) ? 'wall' : arr0;

  const out: string[] = [];
  let section: string | null | undefined = undefined;
  const fig: string[] = [];
  spec.items.forEach((it, n) => {
    const d = dateBlock(mode, i.dates.get(it.id));
    if (arr === 'list') {
      if (it.section !== section) {
        section = it.section;
        if (section) out.push(`<h2>${esc(section)}</h2>`);
      }
      out.push(figure(it, arr, d));
    } else if (arr === 'dial') {
      const h = hours.get(it.id)!;
      const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
      const r = 31 + jitter(it.id, 3) * 13;
      const style = `left:${(50 + r * Math.cos(a)).toFixed(2)}%;top:${(50 + r * Math.sin(a)).toFixed(2)}%`;
      fig.push(figure(it, arr, d, '', style));
    } else {
      fig.push(figure(it, arr, d, ` data-n="${n % 5}"`));
    }
  });
  if (arr === 'wall') out.push(`<div class="grid">${fig.join('\n')}</div>`);
  if (arr === 'corridor') {
    out.push(`<div class="corridor"><div class="stick"><div class="track">${fig.join('\n')}</div></div></div>`);
  }
  if (arr === 'dial') {
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
      const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
      return `<span class="tick" style="left:${(50 + 54 * Math.cos(a)).toFixed(2)}%;top:${
        (50 + 54 * Math.sin(a)).toFixed(2)
      }%">${String(h).padStart(2, '0')}</span>`;
    }).join('');
    out.push(
      `<div class="dial"><div class="ring">${ticks}<p class="hub">24 hours, local time of capture</p>${
        fig.join('\n')
      }</div></div>`,
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
<body class="arr-${arr}">
<header>
<h1>${esc(String(f.title ?? ''))}</h1>
<p class="thesis">${esc(String(f.thesis ?? ''))}</p>
</header>
<main>
${out.join('\n')}
</main>
<footer><p>${esc(String(f.curator ?? ''))}</p></footer>
<script src="/_/player.js" defer></script>
</body>
</html>
`;
}
