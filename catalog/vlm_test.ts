import { assertEquals } from '@std/assert';
import { Database } from '@db/sqlite';
import { openCatalog } from './db.ts';
import { runBatch } from './batch/run.ts';
import { makeVlmStage } from './stages/vlm.ts';
import { cleanOcr, interpretiveWords, isDegenerate } from './stages/vlm_text.ts';
import type { Stage } from './stages/mod.ts';

Deno.test('interpretive lexicon flags mood words and passes plain description', () => {
  assertEquals(interpretiveWords('A cozy kitchen with a peaceful feeling.'), ['cozy', 'peaceful', 'feeling']);
  assertEquals(interpretiveWords('A red bicycle leans against a white wall.'), []);
  assertEquals(interpretiveWords('The woman seems happy'), ['seems', 'happy']);
});

Deno.test('OCR cleaning: NONE, empty, loops and single-class noise are no text', () => {
  assertEquals(cleanOcr('NONE'), null);
  assertEquals(cleanOcr('none.\n'), null);
  assertEquals(cleanOcr(''), null);
  assertEquals(cleanOcr('EXIT\nEXIT\nEXIT\nEXIT\nEXIT'), null);
  assertEquals(cleanOcr('open open open open open'), null);
  assertEquals(cleanOcr('||||||||||||||||'), null);
  assertEquals(cleanOcr('営業中\nOPEN 10:00-18:00'), '営業中\nOPEN 10:00-18:00');
  assertEquals(isDegenerate('one\ntwo\nthree'), false);
});

interface Reply {
  describe: string[];
  ocr: string;
}

async function withFakeServer(reply: Reply, fn: (url: string, seen: string[]) => Promise<void>) {
  const seen: string[] = [];
  let d = 0;
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (req) => {
    const body = await req.json();
    const parts = body.messages[0].content;
    assertEquals(parts[0].type, 'image_url');
    assertEquals(body.temperature, 0);
    assertEquals(body.repeat_penalty, 1.1);
    const text: string = parts[1].text;
    seen.push(text);
    const content = text.startsWith('Transcribe')
      ? reply.ocr
      : reply.describe[Math.min(d++, reply.describe.length - 1)];
    return Response.json({ choices: [{ message: { content } }] });
  });
  try {
    await fn(`http://127.0.0.1:${server.addr.port}`, seen);
  } finally {
    await server.shutdown();
  }
}

const cap = { capture_id: 'a', captured_at: 'x', lat: null, lon: null, file: 'a.mp4' };
const keyframe = () => Promise.resolve(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

Deno.test('vlm stage stores a plain description and OCR text', async () => {
  await withFakeServer({ describe: ['A red bicycle against a wall.'], ocr: 'NONE' }, async (baseUrl) => {
    const out = await makeVlmStage({ baseUrl, keyframe }).run(cap, { gazetteer: () => Promise.reject() });
    assertEquals(out, { scene_description: 'A red bicycle against a wall.', ocr_text: null, vlm_note: null });
  });
});

Deno.test('vlm stage retries once with the strict prompt, then withholds an interpretive description', async () => {
  await withFakeServer({ describe: ['A cozy room.', 'A cozy room.'], ocr: 'EXIT' }, async (baseUrl, seen) => {
    const out = await makeVlmStage({ baseUrl, keyframe }).run(cap, { gazetteer: () => Promise.reject() });
    assertEquals(out.scene_description, null);
    assertEquals(out.ocr_text, 'EXIT');
    assertEquals(String(out.vlm_note).startsWith('description withheld: interpretive wording (cozy)'), true);
    assertEquals(seen.length, 3);
    assertEquals(seen[1].includes('plain nouns'), true);
  });
  await withFakeServer({ describe: ['A cozy room.', 'A room with a sofa.'], ocr: 'NONE' }, async (baseUrl) => {
    const out = await makeVlmStage({ baseUrl, keyframe }).run(cap, { gazetteer: () => Promise.reject() });
    assertEquals(out.scene_description, 'A room with a sofa.');
  });
});

Deno.test('runBatch calls setup/teardown around the backlog, and skips when setup throws', async () => {
  const dir = await Deno.makeTempDir();
  const arch = new Database(`${dir}/archive.sqlite`);
  arch.exec(
    `CREATE TABLE captures (capture_id TEXT, captured_at TEXT, lat REAL, lon REAL, file_path TEXT, received_at TEXT)`,
  );
  arch.exec(`INSERT INTO captures VALUES ('a','2026-10-01T12:00:00+09:00',NULL,NULL,'a.mp4','1')`);
  arch.close();
  const catalog = openCatalog(':memory:');
  const events: string[] = [];
  const mk = (setupFails: boolean, runFails: boolean): Stage => ({
    name: 's',
    version: '1',
    columns: ['time_of_day'],
    peakMiB: 1,
    setup: () => (events.push('setup'), setupFails ? Promise.reject(new Error('no docker')) : Promise.resolve()),
    teardown: () => (events.push('teardown'), Promise.resolve()),
    run:
      () => (events.push('run'),
        runFails ? Promise.reject(new Error('boom')) : Promise.resolve({ time_of_day: 'night' })),
  });
  const base = {
    catalog,
    archiveDb: `${dir}/archive.sqlite`,
    archiveDir: dir,
    ctx: { gazetteer: () => Promise.reject() },
    deadline: null,
  };
  const bad = await runBatch({ ...base, stages: [mk(true, false)] });
  assertEquals(events, ['setup', 'teardown']);
  assertEquals(bad[0].skipped, 'setup failed (no docker)');
  events.length = 0;
  const failed = await runBatch({ ...base, stages: [mk(false, true)] });
  assertEquals(events, ['setup', 'run', 'teardown']);
  assertEquals(failed[0].failed, 1);
  catalog.close();
});

Deno.test('openCatalog adds the VLM columns to a pre-existing catalog', async () => {
  const dir = await Deno.makeTempDir();
  const old = new Database(`${dir}/c.sqlite`);
  old.exec(
    `CREATE TABLE specimen (capture_id TEXT PRIMARY KEY, captured_at TEXT NOT NULL, lat REAL, lon REAL, audio_state TEXT)`,
  );
  old.close();
  const db = openCatalog(`${dir}/c.sqlite`);
  const cols = db.prepare('PRAGMA table_info(specimen)').all<{ name: string }>().map((r) => r.name);
  for (const c of ['scene_description', 'ocr_text', 'vlm_note']) assertEquals(cols.includes(c), true);
  db.close();
});
