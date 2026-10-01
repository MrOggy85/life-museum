import { assert, assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { openCatalog } from '../db.ts';
import { handle } from './server.ts';
import { MAX_ROWS, queryCatalog } from './tools.ts';

function seeded() {
  const db = openCatalog(':memory:');
  const ins = db.prepare(
    `INSERT INTO specimen (capture_id, captured_at, lat, lon, place_name, duration_seconds, time_of_day, motion_state, audio_state, dominant_colors)
     VALUES (?, ?, ?, ?, ?, 3, ?, ?, ?, ?)`,
  );
  ins.run(
    'a',
    '2026-10-01T08:00:00+09:00',
    35,
    139,
    'Yokohama, Kanagawa, Japan',
    'morning',
    'still',
    'quiet',
    '[{"hex":"#ff0000","weight":0.6}]',
  );
  ins.run('b', '2026-10-02T23:00:00+09:00', null, null, null, null, 'high', 'loud', '[{"hex":"#0000ff","weight":0.9}]');
  for (let i = 0; i < 60; i++) {
    ins.run(
      `n${i}`,
      `2026-11-01T12:${String(i).padStart(2, '0')}:00+09:00`,
      null,
      null,
      null,
      null,
      'still',
      'quiet',
      null,
    );
  }
  return db;
}

Deno.test('query filters combine and are terse', () => {
  const db = seeded();
  const out = queryCatalog(db, { time_of_day: 'morning', place: 'Kanagawa' });
  assertStringIncludes(
    out,
    'a | 2026-10-01 08:00 | Yokohama, Kanagawa, Japan | morning | still | quiet | 3.0 | #ff0000',
  );
  assertStringIncludes(out, '1 of 1 matching shown');
  assertStringIncludes(queryCatalog(db, { date_from: '2026-10-02', date_to: '2026-10-02' }), 'b | 2026-10-02 23:00');
  assertStringIncludes(queryCatalog(db, { has_location: false, color_hex: '#0a0aee' }), '1 of 1');
  db.close();
});

Deno.test('results are capped and say so', () => {
  const db = seeded();
  const out = queryCatalog(db, { limit: 1000 });
  assertEquals(out.split('\n').length, MAX_ROWS + 2);
  assertStringIncludes(out, `${MAX_ROWS} of 62 matching shown (narrow`);
  db.close();
});

Deno.test('place filter treats LIKE wildcards literally; bad input is rejected', () => {
  const db = seeded();
  assertStringIncludes(queryCatalog(db, { place: '%' }), '0 of 0');
  assertThrows(() => queryCatalog(db, { date_from: 'yesterday' }));
  assertThrows(() => queryCatalog(db, { color_hex: 'red' }));
  db.close();
});

Deno.test('JSON-RPC: initialize, list, call, errors, notifications', () => {
  const db = seeded();
  const call = (id: number, method: string, params?: Record<string, unknown>) =>
    handle(db, { jsonrpc: '2.0', id, method, params }) as any;
  assertEquals(call(1, 'initialize', { protocolVersion: 'x' }).result.protocolVersion, 'x');
  const names = call(2, 'tools/list').result.tools.map((t: { name: string }) => t.name);
  assertEquals(names, ['overview', 'query_catalog', 'list_locations', 'get_specimen']);
  assertStringIncludes(call(3, 'tools/call', { name: 'overview' }).result.content[0].text, 'specimens: 62');
  assertEquals(call(4, 'tools/call', { name: 'get_specimen', arguments: { id: 'zzz' } }).result.isError, true);
  assertEquals(call(5, 'tools/call', { name: 'nope' }).error.code, -32602);
  assertEquals(call(6, 'bogus').error.code, -32601);
  assertEquals(handle(db, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  db.close();
});

Deno.test('no tool exposes media or writes', () => {
  const db = seeded();
  const tools = (handle(db, { jsonrpc: '2.0', id: 1, method: 'tools/list' }) as any).result.tools;
  for (const t of tools) assert(!/clip|frame|video|file|write|delete/i.test(t.name), t.name);
  db.close();
});
