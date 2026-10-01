/** Calendar date in Asia/Tokyo, YYYY-MM-DD. */
export function jstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function mix(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Stateless daily pick over the sorted ids: a pure function of (ids, day), so it is stable all day and needs no
 * history. Each day steps by a nonzero hashed offset from the previous day's index, so with more than one
 * exhibition consecutive days never show the same one.
 */
export function pickForDay(ids: string[], day: string): string | null {
  const n = ids.length;
  if (n === 0) return null;
  const sorted = [...ids].sort();
  if (n === 1) return sorted[0];
  const days = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  let i = mix(0) % n;
  for (let d = 1; d <= days; d++) i = (i + 1 + (mix(d) % (n - 1))) % n;
  return sorted[i];
}
