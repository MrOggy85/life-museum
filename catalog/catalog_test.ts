import { assertEquals, assertNotEquals } from '@std/assert';
import { Database } from '@db/sqlite';
import { MAX_ATTEMPTS, openCatalog, pending, recordError, recordOk } from './db.ts';
import { acquireLock, parseDeadline } from './batch/preflight.ts';
import { runBatch } from './batch/run.ts';
import { formatPlace, parseGazetteer } from './stages/gazetteer.ts';
import { dominantColors } from './stages/colors.ts';
import { motionScore, motionState } from './stages/motion.ts';
import { audioState, parseVolumedetect } from './stages/audio.ts';
import { timeOfDay } from './stages/solar.ts';
import type { Capture, Stage } from './stages/mod.ts';

Deno.test('time_of_day in Tokyo across a day (JST = UTC+9)', () => {
  const at = (iso: string) => timeOfDay(new Date(iso), 35.68, 139.76);
  assertEquals(at('2026-07-01T00:00:00+09:00'), 'night');
  assertEquals(at('2026-07-01T04:30:00+09:00'), 'dawn');
  assertEquals(at('2026-07-01T08:00:00+09:00'), 'morning');
  assertEquals(at('2026-07-01T12:00:00+09:00'), 'midday');
  assertEquals(at('2026-07-01T16:00:00+09:00'), 'afternoon');
  assertEquals(at('2026-07-01T19:00:00+09:00'), 'evening');
  assertEquals(at('2026-07-01T23:23:00+09:00'), 'night');
});

Deno.test('gazetteer picks the nearest place and respects the radius', () => {
  const cities = [
    '1\tYokohama\tYokohama\t\t35.44778\t139.6425\tP\tPPLA\tJP\t\t14\t\t\t\t3574000',
    '2\tTokyo\tTokyo\t\t35.6895\t139.69171\tP\tPPLC\tJP\t\t40\t\t\t\t8336599',
  ].join('\n');
  const g = parseGazetteer(
    cities,
    'JP.14\tKanagawa\tKanagawa\t1\nJP.40\tTokyo\tTokyo\t2',
    '#c\nJP\tJPN\t392\tJA\tJapan',
  );
  const hit = g.nearest(35.47, 139.6196, 30)!;
  assertEquals(formatPlace(hit.place), 'Yokohama, Kanagawa, Japan');
  assertEquals(formatPlace(g.nearest(35.6895, 139.69, 30)!.place), 'Tokyo, Japan');
  assertEquals(g.nearest(10, 10, 30), null);
});

Deno.test('dominant colors report weights and hex', () => {
  const red = new Uint8Array([250, 5, 5, 250, 5, 5, 250, 5, 5]);
  const blue = new Uint8Array([5, 5, 250]);
  const out = dominantColors([red, blue]);
  assertEquals(out[0], { hex: '#fa0505', weight: 0.75 });
  assertEquals(out[1], { hex: '#0505fa', weight: 0.25 });
});

Deno.test('motion score and state', () => {
  const a = new Uint8Array(100).fill(100);
  assertEquals(motionScore([a]), null);
  assertEquals(motionScore([a, a]), 0);
  assertEquals(motionState(0), 'still');
  assertEquals(motionState(motionScore([a, new Uint8Array(100).fill(200)])!), 'high');
});

Deno.test('volumedetect parsing and audio state', () => {
  const v = parseVolumedetect(
    '[Parsed_volumedetect_0] mean_volume: -38.2 dB\n[Parsed_volumedetect_0] max_volume: -9.1 dB',
  );
  assertEquals(v, { mean: -38.2, max: -9.1 });
  assertEquals(parseVolumedetect('no audio'), null);
  assertEquals(audioState(-38.2), 'quiet');
});

Deno.test('preflight helpers', async () => {
  const d = parseDeadline('04:30', new Date('2026-10-01T16:00:00Z'))!; // 01:00 JST on 10-02
  assertEquals(d.toISOString(), '2026-10-01T19:30:00.000Z');
  const path = await Deno.makeTempFile();
  await Deno.remove(path);
  const release = await acquireLock(path);
  assertNotEquals(release, null);
  assertEquals(await acquireLock(path), null);
  await release!();
  const again = await acquireLock(path); // released lock can be retaken
  assertNotEquals(again, null);
  await again!();
});

const cap = (id: string): Capture => ({
  capture_id: id,
  captured_at: '2026-10-01T12:00:00+09:00',
  lat: null,
  lon: null,
  file: '/x',
});
const stage = (version: string, fn: () => Promise<Record<string, string | number | null>>): Stage => ({
  name: 'time_of_day',
  version,
  columns: ['time_of_day'],
  peakMiB: 1,
  run: fn,
});

Deno.test('pending: ok settles, errors retry up to MAX_ATTEMPTS, a version bump reopens everything', () => {
  const db = openCatalog(':memory:');
  const caps = [cap('a'), cap('b')];
  db.exec(`INSERT INTO specimen (capture_id, captured_at) VALUES ('a','t'),('b','t')`);
  const s1 = stage('1', () => Promise.resolve({}));
  assertEquals(pending(db, s1, caps).length, 2);
  recordOk(db, s1, 'a', { time_of_day: 'night' });
  assertEquals(pending(db, s1, caps).map((c) => c.capture_id), ['b']);
  for (let i = 0; i < MAX_ATTEMPTS; i++) recordError(db, s1, 'b', 'boom');
  assertEquals(pending(db, s1, caps), []);
  assertEquals(pending(db, stage('2', () => Promise.resolve({})), caps).length, 2);
  assertEquals(db.prepare(`SELECT time_of_day FROM specimen WHERE capture_id='a'`).get(), { time_of_day: 'night' });
  db.close();
});

Deno.test('recordOk refuses columns the stage does not own', () => {
  const db = openCatalog(':memory:');
  let threw = false;
  try {
    recordOk(db, stage('1', () => Promise.resolve({})), 'a', { place_name: 'x' });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  db.close();
});

Deno.test('runBatch is idempotent and honours a closed window', async () => {
  const dir = await Deno.makeTempDir();
  const arch = new Database(`${dir}/archive.sqlite`);
  arch.exec(
    `CREATE TABLE captures (capture_id TEXT, captured_at TEXT, lat REAL, lon REAL, file_path TEXT, received_at TEXT)`,
  );
  arch.exec(
    `INSERT INTO captures VALUES ('a','2026-10-01T12:00:00+09:00',NULL,NULL,'a.mp4','1'),('b','2026-10-01T12:00:00+09:00',NULL,NULL,'b.mp4','2')`,
  );
  arch.close();
  const catalog = openCatalog(':memory:');
  let calls = 0;
  const s = stage('1', () => (calls++, Promise.resolve({ time_of_day: 'midday' })));
  const base = {
    catalog,
    archiveDb: `${dir}/archive.sqlite`,
    archiveDir: dir,
    stages: [s],
    ctx: { gazetteer: () => Promise.reject() },
  };
  const closed = await runBatch({ ...base, deadline: new Date(0) });
  assertEquals([calls, closed[0].skipped], [0, 'window closed']);
  const first = await runBatch({ ...base, deadline: null });
  assertEquals([first[0].ok, calls], [2, 2]);
  await runBatch({ ...base, deadline: null });
  assertEquals(calls, 2);
  catalog.close();
});
