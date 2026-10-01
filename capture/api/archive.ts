import { Database } from '@db/sqlite';
import type { CaptureMetadata } from './validate.ts';

export type StoreResult = { capture_id: string; duplicate: boolean };

export type ArchiveDeps = {
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS captures (
  capture_id        TEXT PRIMARY KEY,
  client_uuid       TEXT NOT NULL UNIQUE,
  received_at       TEXT NOT NULL,
  captured_at       TEXT NOT NULL,
  timezone          TEXT,
  mode              TEXT NOT NULL CHECK (mode IN ('clip', 'snap')),
  requested_seconds INTEGER NOT NULL,
  lat               REAL,
  lon               REAL,
  accuracy_m        REAL,
  device_model      TEXT,
  device_os         TEXT,
  mime_type         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS captures_captured_at ON captures (captured_at);
`;

async function durableWrite(path: string, data: Uint8Array): Promise<void> {
  const file = await Deno.open(path, { write: true, create: true, truncate: true });
  try {
    let written = 0;
    while (written < data.length) written += await file.write(data.subarray(written));
    await file.syncData();
  } finally {
    file.close();
  }
}

export class Archive {
  readonly dir: string;
  #db: Database;
  #tmpDir: string;
  #deps: ArchiveDeps;
  #inflight = new Map<string, Promise<StoreResult>>();

  constructor(dataRoot: string, deps: Partial<ArchiveDeps> = {}) {
    this.dir = `${dataRoot.replace(/\/+$/, '')}/archive`;
    this.#tmpDir = `${this.dir}/.tmp`;
    this.#deps = { writeFile: deps.writeFile ?? durableWrite };
    Deno.mkdirSync(this.#tmpDir, { recursive: true });
    this.#db = new Database(`${this.dir}/archive.sqlite`);
    this.#db.exec('PRAGMA journal_mode = WAL');
    this.#db.exec('PRAGMA synchronous = FULL');
    this.#db.exec(SCHEMA);
    for (const entry of Deno.readDirSync(this.#tmpDir)) {
      Deno.removeSync(`${this.#tmpDir}/${entry.name}`);
    }
  }

  close(): void {
    this.#db.close();
  }

  #find(clientUuid: string): string | null {
    const row = this.#db.prepare('SELECT capture_id FROM captures WHERE client_uuid = ?').get<{ capture_id: string }>(
      clientUuid,
    );
    return row?.capture_id ?? null;
  }

  count(): number {
    return this.#db.prepare('SELECT COUNT(*) AS n FROM captures').get<{ n: number }>()!.n;
  }

  store(meta: CaptureMetadata, mimeType: string, ext: string, data: Uint8Array): Promise<StoreResult> {
    const pending = this.#inflight.get(meta.client_uuid);
    if (pending) return pending.then((r) => ({ ...r, duplicate: true }));
    const run = this.#store(meta, mimeType, ext, data).finally(() => this.#inflight.delete(meta.client_uuid));
    this.#inflight.set(meta.client_uuid, run);
    return run;
  }

  async #store(meta: CaptureMetadata, mimeType: string, ext: string, data: Uint8Array): Promise<StoreResult> {
    const existing = this.#find(meta.client_uuid);
    if (existing) return { capture_id: existing, duplicate: true };

    const captureId = crypto.randomUUID();
    const now = new Date();
    const sub = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const relPath = `${sub}/${captureId}.${ext}`;
    const finalPath = `${this.dir}/${relPath}`;
    const tmpPath = `${this.#tmpDir}/${captureId}.part`;

    try {
      await this.#deps.writeFile(tmpPath, data);
      await Deno.mkdir(`${this.dir}/${sub}`, { recursive: true });
      await Deno.rename(tmpPath, finalPath);
    } catch (e) {
      await Deno.remove(tmpPath).catch(() => {});
      throw e;
    }

    try {
      this.#db.prepare(
        `INSERT INTO captures (capture_id, client_uuid, received_at, captured_at, timezone, mode, requested_seconds,
           lat, lon, accuracy_m, device_model, device_os, mime_type, file_path, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        captureId,
        meta.client_uuid,
        now.toISOString(),
        meta.captured_at,
        meta.timezone,
        meta.mode,
        meta.requested_seconds,
        meta.lat,
        meta.lon,
        meta.accuracy_m,
        meta.device_model,
        meta.device_os,
        mimeType,
        relPath,
        data.length,
      );
    } catch (e) {
      await Deno.remove(finalPath).catch(() => {});
      throw e;
    }
    return { capture_id: captureId, duplicate: false };
  }
}
