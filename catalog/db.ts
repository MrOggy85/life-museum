import { Database } from '@db/sqlite';
import type { Capture, FieldValue, Stage } from './stages/mod.ts';

export const MAX_ATTEMPTS = 3;

/** Columns added after the first release; ALTERed in for catalogs created before them. */
const ADDED_COLUMNS = ['scene_description', 'ocr_text', 'vlm_note'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS specimen (
  capture_id        TEXT PRIMARY KEY,
  captured_at       TEXT NOT NULL,
  lat               REAL,
  lon               REAL,
  place_name        TEXT,
  duration_seconds  REAL,
  width             INTEGER,
  height            INTEGER,
  video_codec       TEXT,
  audio_codec       TEXT,
  time_of_day       TEXT,
  dominant_colors   TEXT,
  motion_score      REAL,
  motion_state      TEXT,
  audio_mean_db     REAL,
  audio_peak_db     REAL,
  audio_state       TEXT,
  scene_description TEXT,
  ocr_text          TEXT,
  vlm_note          TEXT
);
CREATE TABLE IF NOT EXISTS stage_runs (
  capture_id    TEXT NOT NULL,
  stage         TEXT NOT NULL,
  version       TEXT NOT NULL,
  catalogued_at TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  attempts      INTEGER NOT NULL DEFAULT 1,
  error         TEXT,
  PRIMARY KEY (capture_id, stage)
);
`;

export function openCatalog(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const have = new Set(db.prepare('PRAGMA table_info(specimen)').all<{ name: string }>().map((r) => r.name));
  for (const col of ADDED_COLUMNS) if (!have.has(col)) db.exec(`ALTER TABLE specimen ADD COLUMN ${col} TEXT`);
  return db;
}

/** Read-only view of the capture registry. The cataloguer never writes the archive. */
export function readCaptures(archiveDb: string, archiveDir: string): Capture[] {
  const db = new Database(archiveDb, { readonly: true });
  try {
    return db.prepare('SELECT capture_id, captured_at, lat, lon, file_path FROM captures ORDER BY received_at').all<
      { capture_id: string; captured_at: string; lat: number | null; lon: number | null; file_path: string }
    >().map((r) => ({
      capture_id: r.capture_id,
      captured_at: r.captured_at,
      lat: r.lat,
      lon: r.lon,
      file: `${archiveDir}/${r.file_path}`,
    }));
  } finally {
    db.close();
  }
}

export function syncSpecimens(db: Database, captures: Capture[]): void {
  const ins = db.prepare('INSERT OR IGNORE INTO specimen (capture_id, captured_at, lat, lon) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const c of captures) ins.run(c.capture_id, c.captured_at, c.lat, c.lon);
  })();
}

/** Pending work is derived from the catalog itself: captures with no ok run at this stage's version. */
export function pending(db: Database, stage: Stage, captures: Capture[]): Capture[] {
  const rows = db.prepare('SELECT capture_id, version, status, attempts FROM stage_runs WHERE stage = ?').all<
    { capture_id: string; version: string; status: string; attempts: number }
  >(stage.name);
  const settled = new Set<string>();
  for (const r of rows) {
    if (r.version !== stage.version) continue;
    if (r.status === 'ok' || r.attempts >= MAX_ATTEMPTS) settled.add(r.capture_id);
  }
  return captures.filter((c) => !settled.has(c.capture_id));
}

export function recordOk(db: Database, stage: Stage, id: string, fields: Record<string, FieldValue>): void {
  const cols = Object.keys(fields);
  for (const col of cols) if (!stage.columns.includes(col)) throw new Error(`stage ${stage.name} may not write ${col}`);
  db.transaction(() => {
    if (cols.length) {
      db.prepare(`UPDATE specimen SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE capture_id = ?`).run(
        ...cols.map((c) => fields[c]),
        id,
      );
    }
    db.prepare(
      `INSERT INTO stage_runs (capture_id, stage, version, catalogued_at, status, attempts, error)
       VALUES (?, ?, ?, ?, 'ok', 1, NULL)
       ON CONFLICT (capture_id, stage) DO UPDATE SET version = excluded.version,
         catalogued_at = excluded.catalogued_at, status = 'ok', attempts = 1, error = NULL`,
    ).run(id, stage.name, stage.version, new Date().toISOString());
  })();
}

export function recordError(db: Database, stage: Stage, id: string, error: string): void {
  db.prepare(
    `INSERT INTO stage_runs (capture_id, stage, version, catalogued_at, status, attempts, error)
     VALUES (?, ?, ?, ?, 'error', 1, ?)
     ON CONFLICT (capture_id, stage) DO UPDATE SET
       attempts = CASE WHEN version = excluded.version THEN attempts + 1 ELSE 1 END,
       version = excluded.version, catalogued_at = excluded.catalogued_at, status = 'error', error = excluded.error`,
  ).run(id, stage.name, stage.version, new Date().toISOString(), error.slice(0, 500));
}
