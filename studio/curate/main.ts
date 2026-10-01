import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDataRootReady } from '../../capture/api/guard.ts';
import { acquireLock } from '../../catalog/batch/preflight.ts';
import { splitFrontmatter } from '../lib/spec.ts';
import { claudeRunner } from './claude.ts';
import { type Curator, doctrineFrom } from './prompt.ts';
import { runCurate } from './run.ts';

const STUDIO = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(STUDIO);
const env = (k: string, d: string) => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => Number(env(k, String(d)));

const DATA_ROOT = env('DATA_ROOT', '/mnt/usbssd/museum-data');
const MOUNT_POINT = env('MOUNT_POINT', '/mnt/usbssd');
const curatorArg = Deno.args.find((a) => a.startsWith('--curator='))?.slice(10);
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function loadCurators(): Promise<Curator[]> {
  const out: Curator[] = [];
  for await (const f of Deno.readDir(`${STUDIO}/curators`)) {
    if (!f.isFile || !f.name.endsWith('.md')) continue;
    const text = await Deno.readTextFile(`${STUDIO}/curators/${f.name}`);
    out.push({ id: f.name.slice(0, -3), name: String(splitFrontmatter(text).front.name), text });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

try {
  await assertDataRootReady(DATA_ROOT, env('ALLOW_UNMOUNTED_DATA_ROOT', '') === '1', MOUNT_POINT);
} catch (e) {
  log(`skip: ${(e as Error).message}`);
  Deno.exit(0);
}

await Deno.mkdir(`${DATA_ROOT}/collection`, { recursive: true });
const release = await acquireLock(`${DATA_ROOT}/collection/.curate.lock`);
if (!release) {
  log('skip: another curate run holds the lock');
  Deno.exit(0);
}

const scratch = await Deno.makeTempDir({ prefix: 'museum-curate-' });
let exit = 0;
try {
  const denoDir = Deno.env.get('DENO_DIR') ?? `${Deno.env.get('HOME')}/.cache/deno`;
  const mcpConfig = `${scratch}/mcp.json`;
  await Deno.writeTextFile(
    mcpConfig,
    JSON.stringify({
      mcpServers: {
        catalog: {
          command: Deno.execPath(),
          args: [
            'run',
            `--allow-read=${DATA_ROOT}/catalog,${denoDir}/plug`,
            `--allow-write=${DATA_ROOT}/catalog`,
            '--allow-ffi',
            '--allow-env',
            `${REPO}/catalog/mcp/main.ts`,
          ],
          env: { DATA_ROOT },
        },
      },
    }),
  );
  const maxTurns = num('CURATE_MAX_TURNS', 8);
  const outcome = await runCurate({
    dataRoot: DATA_ROOT,
    claude: claudeRunner({
      bin: env('CLAUDE_BIN', 'claude'),
      mcpConfig,
      cwd: scratch,
      maxTurns,
      maxBudgetUsd: num('CURATE_MAX_RUN_USD', 1),
      model: Deno.env.get('CURATE_MODEL'),
    }),
    curators: await loadCurators(),
    doctrine: doctrineFrom(await Deno.readTextFile(`${REPO}/CLAUDE.md`)),
    curatorId: curatorArg,
    now: new Date(),
    weeklyCapUsd: num('CURATE_WEEKLY_CAP_USD', 5),
    minSpecimens: num('CURATE_MIN_SPECIMENS', 30),
    maxTurns,
  });
  log(JSON.stringify(outcome));
  if (outcome.status === 'rejected') exit = 1;
} catch (e) {
  log(`error: ${(e as Error).message}`);
  exit = 1;
} finally {
  await release();
  await Deno.remove(scratch, { recursive: true }).catch(() => {});
}
Deno.exit(exit);
