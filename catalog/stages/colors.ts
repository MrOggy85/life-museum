import { rawFrames } from './media.ts';
import type { Stage } from './mod.ts';

/** Dominant colors: sample frames, bucket pixels to 4 levels per channel, report the heaviest buckets' mean colors. */
export function dominantColors(frames: Uint8Array[], top = 5): { hex: string; weight: number }[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (const f of frames) {
    for (let i = 0; i + 2 < f.length; i += 3) {
      const key = ((f[i] >> 6) << 4) | ((f[i + 1] >> 6) << 2) | (f[i + 2] >> 6);
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += f[i];
      b.g += f[i + 1];
      b.b += f[i + 2];
      buckets.set(key, b);
      total++;
    }
  }
  const hex = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, top)
    .map((b) => ({
      hex: `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`,
      weight: Math.round((b.n / total) * 1000) / 1000,
    }));
}

export const colors: Stage = {
  name: 'colors',
  version: '1',
  columns: ['dominant_colors'],
  peakMiB: 80,
  async run(c) {
    const frames = await rawFrames(c.file, 3, 32, 18, 'rgb24');
    if (!frames.length) throw new Error('no frames decoded');
    return { dominant_colors: JSON.stringify(dominantColors(frames)) };
  },
};
