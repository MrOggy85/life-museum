import type { Database } from '@db/sqlite';
import { pending, readCaptures, recordError, recordOk, syncSpecimens } from '../db.ts';
import type { Stage, StageContext } from '../stages/mod.ts';
import { memoryOk } from './preflight.ts';

export interface RunOptions {
  catalog: Database;
  archiveDb: string;
  archiveDir: string;
  stages: Stage[];
  ctx: StageContext;
  deadline: Date | null;
  log?: (msg: string) => void;
}

export interface StageResult {
  stage: string;
  skipped?: string;
  ok: number;
  failed: number;
}

/** Stage-major: each stage runs over its whole backlog before the next starts. Skip rather than squeeze. */
export async function runBatch(o: RunOptions): Promise<StageResult[]> {
  const log = o.log ?? (() => {});
  const captures = readCaptures(o.archiveDb, o.archiveDir);
  syncSpecimens(o.catalog, captures);
  const results: StageResult[] = [];
  for (const stage of o.stages) {
    const todo = pending(o.catalog, stage, captures);
    const r: StageResult = { stage: stage.name, ok: 0, failed: 0 };
    results.push(r);
    if (!todo.length) continue;
    const mem = memoryOk(stage.peakMiB);
    if (!mem.ok) {
      r.skipped = `low memory (${mem.availableMiB} MiB available)`;
      log(`${stage.name}: skipped, ${r.skipped}`);
      continue;
    }
    log(`${stage.name}: ${todo.length} pending`);
    for (const c of todo) {
      if (o.deadline && Date.now() >= o.deadline.getTime()) {
        r.skipped = 'window closed';
        break;
      }
      try {
        recordOk(o.catalog, stage, c.capture_id, await stage.run(c, o.ctx));
        r.ok++;
      } catch (e) {
        recordError(o.catalog, stage, c.capture_id, e instanceof Error ? e.message : String(e));
        r.failed++;
      }
    }
    log(`${stage.name}: ${r.ok} ok, ${r.failed} failed${r.skipped ? `, ${r.skipped}` : ''}`);
    if (r.skipped === 'window closed') break;
  }
  return results;
}
