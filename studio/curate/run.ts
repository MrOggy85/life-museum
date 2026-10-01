import { Database } from '@db/sqlite';
import { formatViolations, lintSpec, type Violation } from '../lib/lint.ts';
import { assembleSpec, parseSpec } from '../lib/spec.ts';
import type { ClaudeFn, ClaudeResult } from './claude.ts';
import { readLedger, spentSince } from './ledger.ts';
import { buildPrompt, type Curator, DECLINE_PREFIX } from './prompt.ts';

export interface CurateDeps {
  dataRoot: string;
  claude: ClaudeFn;
  curators: Curator[];
  doctrine: string;
  curatorId?: string;
  now: Date;
  weeklyCapUsd: number;
  minSpecimens: number;
  maxTurns: number;
  rand?: () => number;
}

export type Outcome =
  | { status: 'created'; id: string; dir: string }
  | { status: 'declined'; id: string; reason: string }
  | { status: 'rejected'; id: string; violations: Violation[] }
  | { status: 'skipped'; reason: string };

const WEEK_MS = 7 * 24 * 3600_000;

function usageOf(attempts: ClaudeResult[]) {
  const sum = (k: string) => attempts.reduce((s, a) => s + Number(a.usage[k] ?? 0), 0);
  return {
    turns: attempts.reduce((s, a) => s + a.turns, 0),
    cost_usd: Math.round(attempts.reduce((s, a) => s + a.costUsd, 0) * 1e6) / 1e6,
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    cache_read_input_tokens: sum('cache_read_input_tokens'),
    cache_creation_input_tokens: sum('cache_creation_input_tokens'),
    attempts: attempts.length,
    subtypes: attempts.map((a) => a.subtype),
  };
}

const jst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function runCurate(d: CurateDeps): Promise<Outcome> {
  const collection = `${d.dataRoot}/collection`;
  const catalogPath = `${d.dataRoot}/catalog/catalog.sqlite`;
  try {
    await Deno.stat(catalogPath);
  } catch {
    return { status: 'skipped', reason: 'no catalog yet' };
  }
  const db = new Database(catalogPath, { readonly: true });
  try {
    const n = db.prepare('SELECT COUNT(*) n FROM specimen').get<{ n: number }>()!.n;
    if (n < d.minSpecimens) return { status: 'skipped', reason: `catalog has ${n} specimens, needs ${d.minSpecimens}` };

    await Deno.mkdir(collection, { recursive: true });
    const spent = spentSince(await readLedger(collection), new Date(d.now.getTime() - WEEK_MS));
    if (spent >= d.weeklyCapUsd) {
      return { status: 'skipped', reason: `weekly cap reached ($${spent.toFixed(2)} of $${d.weeklyCapUsd})` };
    }

    const rand = d.rand ?? Math.random;
    const curator = d.curatorId
      ? d.curators.find((c) => c.id === d.curatorId)
      : d.curators[Math.floor(rand() * d.curators.length)];
    if (!curator) return { status: 'skipped', reason: `unknown curator ${d.curatorId}` };

    const known = db.prepare('SELECT 1 FROM specimen WHERE capture_id = ?');
    const knownIds = (id: string) => known.get(id) !== undefined;
    const suffix = Math.floor(rand() * 0xffff).toString(16).padStart(4, '0');
    const id = `${jst(d.now).replaceAll('-', '')}-${curator.name}-${suffix}`;
    const created = jst(d.now);

    const attempts: ClaudeResult[] = [];
    let spec = '';
    let violations: Violation[] = [];
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await d.claude(buildPrompt(curator, d.doctrine, d.maxTurns, feedback));
      attempts.push(r);
      const decline = r.text.match(new RegExp(`^${DECLINE_PREFIX}\\s*(.*)$`, 'm'));
      if (decline) {
        await record(collection, id, 'declined', curator.id, d.now, attempts, '', [], decline[1]);
        return { status: 'declined', id, reason: decline[1] };
      }
      if (r.isError || !r.text.trim()) {
        violations = [{ rule: 'claude', where: 'run', detail: r.subtype || 'empty result' }];
        break; // not a voice failure, so no retry
      }
      try {
        spec = assembleSpec(r.text, curator.id, created);
      } catch (e) {
        spec = r.text;
        violations = [{ rule: 'parse', where: 'spec', detail: (e as Error).message }];
        feedback = formatViolations(violations);
        continue;
      }
      violations = lintSpec(spec, { knownIds });
      if (!violations.length) {
        const dir = await record(collection, id, 'accepted', curator.id, d.now, attempts, spec, [], undefined);
        return { status: 'created', id, dir };
      }
      feedback = formatViolations(violations);
    }
    await record(collection, id, 'rejected', curator.id, d.now, attempts, spec, violations, undefined);
    return { status: 'rejected', id, violations };
  } finally {
    db.close();
  }
}

async function record(
  collection: string,
  id: string,
  status: 'accepted' | 'rejected' | 'declined',
  curator: string,
  now: Date,
  attempts: ClaudeResult[],
  spec: string,
  violations: Violation[],
  reason: string | undefined,
): Promise<string> {
  const dir = status === 'accepted' ? `${collection}/${id}` : `${collection}/.rejected/${id}`;
  await Deno.mkdir(`${collection}/.rejected`, { recursive: true });
  await Deno.mkdir(dir); // never overwrite: fails if the id exists
  const last = attempts[attempts.length - 1];
  const meta = {
    exhibition_id: id,
    status,
    curator,
    created_at: now.toISOString(),
    specimens: status === 'accepted' ? parseSpec(spec).items.length : undefined,
    reason,
    violations: violations.length ? violations : undefined,
    usage: usageOf(attempts),
    model_usage: last?.modelUsage,
  };
  if (spec) await Deno.writeTextFile(`${dir}/${status === 'accepted' ? 'spec.md' : 'spec.draft.md'}`, spec);
  await Deno.writeTextFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2) + '\n');
  return dir;
}
