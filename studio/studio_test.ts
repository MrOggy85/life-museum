import { assertEquals, assertStringIncludes } from '@std/assert';
import { openCatalog } from '../catalog/db.ts';
import { assembleSpec, parseSpec } from './lib/spec.ts';
import { lintSpec } from './lib/lint.ts';
import { type ClaudeResult, parseClaudeJson } from './curate/claude.ts';
import { readLedger, spentSince } from './curate/ledger.ts';
import { buildPrompt, doctrineFrom } from './curate/prompt.ts';
import { runCurate } from './curate/run.ts';

const ids = ['a', 'b', 'c', 'd', 'e'];
const known = (id: string) => ids.includes(id);
const good = `---
title: Thresholds
thesis: Five specimens recorded at night after 23:00.
reveal_dates: after
---

![](capture_a)
Yokohama. Night. Silent.

![](capture_b)
Yokohama. Night. Quiet.

![](capture_c)
Tokyo. Night.

![](capture_d)
Tokyo. Midday.

![](capture_e)
Kanagawa. Morning.
`;

Deno.test('assembleSpec drops preamble, strips fences, stamps curator and created', () => {
  const raw = '💡 announcement\n\n```markdown\n' +
    good.replace('thesis:', 'curator: liar@v9\ncreated: 1999-01-01\nthesis:') + '```';
  const out = assembleSpec(raw, 'architect@v1', '2026-10-01');
  const p = parseSpec(out);
  assertEquals([p.front.curator, p.front.created], ['architect@v1', '2026-10-01']);
  assertEquals(Object.keys(p.front), ['title', 'thesis', 'curator', 'created', 'reveal_dates']);
  assertEquals(p.items.map((i) => i.id), ids);
  assertEquals(lintSpec(out, { knownIds: known }), []);
});

Deno.test('lint: voice, structure and unknown ids', () => {
  const bad = good
    .replace('Five specimens recorded at night after 23:00.', 'You will remember this journey!')
    .replace('Tokyo. Night.', 'The subject seemed lonely here.')
    .replace('capture_e', 'capture_zzz')
    .replace('Yokohama. Night. Quiet.', '');
  const rules = lintSpec(bad, { knownIds: known }).map((v) => v.rule);
  for (
    const r of [
      'second-person',
      'nostalgia',
      'punctuation',
      'speculation',
      'judgement-or-emotion',
      'unknown-id',
      'placard',
    ]
  ) {
    assertEquals(rules.includes(r), true, r);
  }
});

Deno.test('lint: counts, duplicates, sections, stray text, missing frontmatter', () => {
  const few = '---\ntitle: T\nthesis: X\n---\n\n![](capture_a)\nOne.\n\n![](capture_a)\nTwo.\n';
  const r = lintSpec(few, { knownIds: known }).map((v) => v.rule);
  assertEquals(r.includes('count') && r.includes('duplicate'), true);
  assertEquals(lintSpec(good + '\nrandom text\n', { knownIds: known }).some((v) => v.rule === 'stray-text'), true);
  assertEquals(
    lintSpec(good.replace('reveal_dates: after', 'sections:\n  - Night'), { knownIds: known }).some((v) =>
      v.rule === 'sections'
    ),
    true,
  );
  assertEquals(lintSpec('no frontmatter', { knownIds: known })[0].rule, 'parse');
});

Deno.test('lint accepts the facts CLAUDE.md itself calls valid', () => {
  const ok = good.replace('Yokohama. Night. Silent.', 'This object appears in 312 recordings. Duration: 2.3 seconds.');
  assertEquals(lintSpec(ok, { knownIds: known }), []);
});

Deno.test('prompt carries the doctrine, curator and correction feedback', async () => {
  const doctrine = doctrineFrom(await Deno.readTextFile(new URL('../CLAUDE.md', import.meta.url)));
  assertStringIncludes(doctrine, 'What does this mean?');
  assertEquals(doctrine.includes('Repo map'), false);
  const p = buildPrompt({ id: 'architect@v1', name: 'architect', text: 'STANCE-X' }, doctrine, 8, '- rule (x): y');
  for (
    const s of ['STANCE-X', 'What does this mean?', 'at most 8 turns', 'DECLINE:', 'Correction needed', '- rule (x): y']
  ) {
    assertStringIncludes(p, s);
  }
});

Deno.test('parseClaudeJson handles object and array output', () => {
  const r = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'hi',
    num_turns: 3,
    total_cost_usd: 0.12,
    usage: { input_tokens: 5 },
  };
  assertEquals(parseClaudeJson(JSON.stringify(r)).turns, 3);
  assertEquals(parseClaudeJson(JSON.stringify([{ type: 'system' }, r])).costUsd, 0.12);
});

// ---- runCurate end to end with a fake claude ----

async function fixture(n: number) {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/catalog`);
  const db = openCatalog(`${root}/catalog/catalog.sqlite`);
  for (let i = 0; i < n; i++) {
    db.exec(
      `INSERT INTO specimen (capture_id, captured_at) VALUES ('${ids[i] ?? 'x' + i}', '2026-10-01T12:00:00+09:00')`,
    );
  }
  db.close();
  return root;
}
const reply = (text: string, cost = 0.1): ClaudeResult => ({
  text,
  isError: false,
  subtype: 'success',
  turns: 4,
  costUsd: cost,
  usage: { input_tokens: 100, output_tokens: 50 },
  modelUsage: {},
});
const base = (root: string, claude: (p: string) => Promise<ClaudeResult>) => ({
  dataRoot: root,
  claude,
  doctrine: 'D',
  now: new Date('2026-10-01T15:00:00Z'),
  weeklyCapUsd: 5,
  minSpecimens: 5,
  maxTurns: 8,
  curators: [{ id: 'architect@v1', name: 'architect', text: 'T' }],
  rand: () => 0.5,
});

Deno.test('curate: accepted spec is written with stamped metadata and usage', async () => {
  const root = await fixture(5);
  const o = await runCurate(base(root, () => Promise.resolve(reply(good))));
  if (o.status !== 'created') throw new Error(JSON.stringify(o));
  assertEquals(o.id, '20261002-architect-7fff'); // JST date: 15:00Z is already 10-02 in Tokyo
  const meta = JSON.parse(await Deno.readTextFile(`${o.dir}/meta.json`));
  assertEquals([meta.status, meta.specimens, meta.usage.cost_usd, meta.usage.attempts], ['accepted', 5, 0.1, 1]);
  assertStringIncludes(await Deno.readTextFile(`${o.dir}/spec.md`), 'curator: architect@v1');
});

Deno.test('curate: one retry with the violations fed back, then accepted; usage is summed', async () => {
  const root = await fixture(5);
  const prompts: string[] = [];
  let n = 0;
  const o = await runCurate(
    base(
      root,
      (
        p,
      ) => (prompts.push(p),
        Promise.resolve(reply(n++ ? good : good.replace('Night. Silent.', 'You seemed happy.'), 0.2))),
    ),
  );
  assertEquals(o.status, 'created');
  assertEquals(prompts.length, 2);
  assertStringIncludes(prompts[1], 'second-person');
  const meta = JSON.parse(await Deno.readTextFile(`${(o as { dir: string }).dir}/meta.json`));
  assertEquals([meta.usage.attempts, meta.usage.cost_usd], [2, 0.4]);
});

Deno.test('curate: second failure is discarded to .rejected and still counts toward spend', async () => {
  const root = await fixture(5);
  const o = await runCurate(base(root, () => Promise.resolve(reply(good.replace('Silent.', 'Beautiful!'), 0.3))));
  assertEquals(o.status, 'rejected');
  const id = (o as { id: string }).id;
  assertEquals((await Deno.stat(`${root}/collection/.rejected/${id}/spec.draft.md`)).isFile, true);
  assertEquals((await readLedger(`${root}/collection`)).length, 1);
  assertEquals(spentSince(await readLedger(`${root}/collection`), new Date(0)), 0.6);
  assertEquals(await Deno.stat(`${root}/collection/${id}`).then(() => true, () => false), false);
});

Deno.test('curate: DECLINE is recorded, not retried', async () => {
  const root = await fixture(5);
  let calls = 0;
  const o = await runCurate(
    base(root, () => (calls++, Promise.resolve(reply('💡 note\nDECLINE: no recurring motif.')))),
  );
  assertEquals([o.status, calls], ['declined', 1]);
});

Deno.test('curate: claude error is rejected without retry', async () => {
  const root = await fixture(5);
  let calls = 0;
  const o = await runCurate(
    base(root, () => (calls++, Promise.resolve({ ...reply(''), isError: true, subtype: 'error_max_turns' }))),
  );
  assertEquals([o.status, calls], ['rejected', 1]);
});

Deno.test('curate: skips on thin catalog and on spend cap, without calling claude', async () => {
  const never = () => Promise.reject(new Error('should not be called'));
  assertEquals((await runCurate(base(await fixture(2), never))).status, 'skipped');
  const root = await fixture(5);
  await runCurate({ ...base(root, () => Promise.resolve(reply(good, 5))) });
  const o = await runCurate({ ...base(root, never), curators: [{ id: 'architect@v1', name: 'architect', text: 'T' }] });
  assertEquals(o.status, 'skipped');
  assertStringIncludes((o as { reason: string }).reason, 'cap');
});

Deno.test('lint: arrangement and playback vocabulary is validated', () => {
  const body = (arr: string, play: string) =>
    `---\ntitle: T\nthesis: One line.\narrangement: ${arr}\n---\n\n` +
    ['a', 'b', 'c', 'd'].map((i) => `![${i === 'a' ? play : ''}](capture_${i})\nFact ${i}.\n`).join('\n');
  const o = { knownIds: () => true };
  assertEquals(lintSpec(body('wall', 'loop'), o), []);
  assertEquals(lintSpec(body('dial', 'hover'), o), []);
  assertEquals(lintSpec(body('carousel', ''), o).map((v) => v.rule), ['frontmatter']);
  assertEquals(lintSpec(body('wall', 'spin'), o).map((v) => v.rule), ['playback']);
});
