import { assertDataRootReady } from '../../capture/api/guard.ts';

export const MEMORY_MARGIN_MIB = 2048;

export function memoryOk(peakMiB: number): { ok: boolean; availableMiB: number } {
  const availableMiB = Math.floor(Deno.systemMemoryInfo().available / 1048576);
  return { ok: availableMiB >= peakMiB + MEMORY_MARGIN_MIB, availableMiB };
}

export async function diskReady(dataRoot: string, mountPoint: string, allowUnmounted: boolean): Promise<void> {
  await assertDataRootReady(dataRoot, allowUnmounted, mountPoint);
}

/** Advisory kernel lock: released automatically if the process dies, so there is no stale-lock case. */
export async function acquireLock(path: string): Promise<(() => Promise<void>) | null> {
  const f = await Deno.open(path, { create: true, write: true });
  if (!await f.tryLock(true)) {
    f.close();
    return null;
  }
  return async () => {
    await f.unlock();
    f.close();
  };
}

/** Deadline for the batch window: "HH:MM" today in Asia/Tokyo, or null for no limit. */
export function parseDeadline(until: string | undefined, now = new Date()): Date | null {
  if (!until) return null;
  const m = until.match(/^(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`--until must be HH:MM (JST), got ${until}`);
  const jstNow = new Date(now.getTime() + 9 * 3600_000);
  const d = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate(), Number(m[1]), Number(m[2]));
  return new Date(d - 9 * 3600_000);
}
