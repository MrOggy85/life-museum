import { openCatalog } from '../db.ts';
import { loadGazetteer } from '../stages/gazetteer.ts';
import { STAGES } from '../stages/registry.ts';
import { acquireLock, diskReady, parseDeadline } from './preflight.ts';
import { runBatch } from './run.ts';

const DATA_ROOT = Deno.env.get('DATA_ROOT') ?? '/mnt/usbssd/museum-data';
const MOUNT_POINT = Deno.env.get('MOUNT_POINT') ?? '/mnt/usbssd';
const untilArg = Deno.args.find((a) => a.startsWith('--until='))?.slice(8);

const stamp = () => new Date().toISOString();
const log = (m: string) => console.log(`${stamp()} ${m}`);

try {
  await diskReady(DATA_ROOT, MOUNT_POINT, Deno.env.get('ALLOW_UNMOUNTED_DATA_ROOT') === '1');
} catch (e) {
  log(`skip: ${(e as Error).message}`);
  Deno.exit(0); // a skipped night costs nothing
}

await Deno.mkdir(`${DATA_ROOT}/catalog`, { recursive: true });
const release = await acquireLock(`${DATA_ROOT}/catalog/.batch.lock`);
if (!release) {
  log('skip: another batch holds the lock');
  Deno.exit(0);
}

try {
  const catalog = openCatalog(`${DATA_ROOT}/catalog/catalog.sqlite`);
  let gaz: ReturnType<typeof loadGazetteer> | undefined;
  const results = await runBatch({
    catalog,
    archiveDb: `${DATA_ROOT}/archive/archive.sqlite`,
    archiveDir: `${DATA_ROOT}/archive`,
    stages: STAGES,
    ctx: { gazetteer: () => (gaz ??= loadGazetteer(`${DATA_ROOT}/catalog/gazetteer`)) },
    deadline: parseDeadline(untilArg),
    log,
  });
  catalog.close();
  log(`done: ${results.map((r) => `${r.stage}=${r.ok}/${r.failed}${r.skipped ? '(skipped)' : ''}`).join(' ')}`);
} finally {
  await release();
}
