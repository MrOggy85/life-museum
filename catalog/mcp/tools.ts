import type { Database } from '@db/sqlite';

export const MAX_ROWS = 40;
export const DEFAULT_ROWS = 20;

interface Row {
  capture_id: string;
  captured_at: string;
  place_name: string | null;
  duration_seconds: number | null;
  time_of_day: string | null;
  motion_state: string | null;
  audio_state: string | null;
  dominant_colors: string | null;
}

export interface Filters {
  date_from?: string;
  date_to?: string;
  time_of_day?: string;
  place?: string;
  motion_state?: string;
  audio_state?: string;
  has_location?: boolean;
  color_hex?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function nearColor(colorsJson: string | null, target: string, maxDist = 60): boolean {
  if (!colorsJson) return false;
  const t = rgb(target);
  return (JSON.parse(colorsJson) as { hex: string; weight: number }[]).some((c) => {
    const p = rgb(c.hex);
    return c.weight >= 0.1 && Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]) <= maxDist;
  });
}

function topColors(json: string | null, n = 2): string {
  if (!json) return '-';
  return (JSON.parse(json) as { hex: string }[]).slice(0, n).map((c) => c.hex).join(',');
}

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

/** Capped, terse listing. Dates compare against the device-local date in captured_at (the part before "T"). */
export function queryCatalog(db: Database, f: Filters): string {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.date_from !== undefined) {
    if (!DATE.test(f.date_from)) throw new Error('date_from must be YYYY-MM-DD');
    where.push('substr(captured_at, 1, 10) >= ?');
    args.push(f.date_from);
  }
  if (f.date_to !== undefined) {
    if (!DATE.test(f.date_to)) throw new Error('date_to must be YYYY-MM-DD');
    where.push('substr(captured_at, 1, 10) <= ?');
    args.push(f.date_to);
  }
  for (const col of ['time_of_day', 'motion_state', 'audio_state'] as const) {
    if (f[col] !== undefined) {
      where.push(`${col} = ?`);
      args.push(String(f[col]));
    }
  }
  if (f.place !== undefined) {
    where.push(`place_name LIKE ? ESCAPE '\\'`);
    args.push(`%${String(f.place).replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (f.has_location !== undefined) where.push(f.has_location ? 'lat IS NOT NULL' : 'lat IS NULL');
  if (f.color_hex !== undefined && !HEX.test(f.color_hex)) throw new Error('color_hex must be #rrggbb');

  const limit = Math.min(Math.max(Math.floor(f.limit ?? DEFAULT_ROWS), 1), MAX_ROWS);
  const order = f.order === 'desc' ? 'DESC' : 'ASC';
  const rows = db.prepare(
    `SELECT capture_id, captured_at, place_name, duration_seconds, time_of_day, motion_state, audio_state, dominant_colors
     FROM specimen ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY captured_at ${order}`,
  ).all<Row>(...args);
  const matched = f.color_hex ? rows.filter((r) => nearColor(r.dominant_colors, f.color_hex!)) : rows;
  const shown = matched.slice(0, limit);

  const lines = ['id | local_time | place | tod | motion | audio | sec | colors'];
  for (const r of shown) {
    lines.push([
      r.capture_id,
      r.captured_at.slice(0, 16).replace('T', ' '),
      dash(r.place_name),
      dash(r.time_of_day),
      dash(r.motion_state),
      dash(r.audio_state),
      r.duration_seconds === null ? '-' : r.duration_seconds.toFixed(1),
      topColors(r.dominant_colors),
    ].join(' | '));
  }
  lines.push(
    `${shown.length} of ${matched.length} matching shown${
      matched.length > shown.length ? ' (narrow the filters or raise limit, max ' + MAX_ROWS + ')' : ''
    }`,
  );
  return lines.join('\n');
}

function counts(db: Database, col: string, limit = 15): string {
  const rows = db.prepare(
    `SELECT ${col} v, COUNT(*) n FROM specimen WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC, v LIMIT ?`,
  ).all<{ v: string; n: number }>(limit);
  return rows.length ? rows.map((r) => `${r.v}=${r.n}`).join(', ') : '(none)';
}

/** The catalog's shape in one call, so the agent does not spend turns discovering it. */
export function overview(db: Database): string {
  const total = db.prepare('SELECT COUNT(*) n FROM specimen').get<{ n: number }>()!.n;
  if (total === 0) return 'The catalog is empty.';
  const span = db.prepare('SELECT MIN(substr(captured_at,1,10)) a, MAX(substr(captured_at,1,10)) b FROM specimen').get<
    { a: string; b: string }
  >()!;
  const located = db.prepare('SELECT COUNT(*) n FROM specimen WHERE lat IS NOT NULL').get<{ n: number }>()!.n;
  const dur = db.prepare('SELECT SUM(duration_seconds) s FROM specimen').get<{ s: number | null }>()!.s ?? 0;
  const hours = db.prepare(
    `SELECT CAST(substr(captured_at,12,2) AS INTEGER) h, COUNT(*) n FROM specimen GROUP BY h ORDER BY h`,
  ).all<{ h: number; n: number }>();
  return [
    `specimens: ${total} (${located} with location), total duration ${dur.toFixed(0)} s`,
    `dates: ${span.a} to ${span.b} (device-local)`,
    `by month: ${counts(db, 'substr(captured_at,1,7)', 36)}`,
    `by local hour: ${hours.map((r) => `${r.h}h=${r.n}`).join(', ')}`,
    `time_of_day: ${counts(db, 'time_of_day')}`,
    `motion_state: ${counts(db, 'motion_state')}`,
    `audio_state: ${counts(db, 'audio_state')}`,
    `places: ${counts(db, 'place_name')}`,
    'not yet in the catalog: transcripts, scene descriptions, OCR, tags, embeddings',
  ].join('\n');
}

export function listLocations(db: Database): string {
  const rows = db.prepare(
    `SELECT place_name p, COUNT(*) n, MIN(substr(captured_at,1,10)) a, MAX(substr(captured_at,1,10)) b
     FROM specimen WHERE place_name IS NOT NULL GROUP BY place_name ORDER BY n DESC, p LIMIT ?`,
  ).all<{ p: string; n: number; a: string; b: string }>(MAX_ROWS);
  const none = db.prepare('SELECT COUNT(*) n FROM specimen WHERE place_name IS NULL').get<{ n: number }>()!.n;
  return [...rows.map((r) => `${r.p} | ${r.n} | ${r.a}..${r.b}`), `${none} specimens without a place`].join('\n');
}

/** Every field the catalog holds for one specimen. */
export function getSpecimen(db: Database, id: string): string {
  const r = db.prepare('SELECT * FROM specimen WHERE capture_id = ?').get<Record<string, unknown>>(id);
  if (!r) throw new Error(`no specimen ${id}`);
  return Object.entries(r).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('\n');
}
