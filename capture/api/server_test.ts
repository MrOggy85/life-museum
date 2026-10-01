import { Database } from '@db/sqlite';
import { assert, assertEquals, assertMatch } from '@std/assert';
import { Archive } from './archive.ts';
import { createHandler } from './server.ts';
import { parseMetadata } from './validate.ts';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function meta(overrides: Record<string, unknown> = {}) {
  return {
    client_uuid: UUID_A,
    captured_at: '2026-10-01T08:30:00.000+09:00',
    timezone: 'Asia/Tokyo',
    mode: 'clip',
    requested_seconds: 3,
    lat: 35.68,
    lon: 139.76,
    accuracy_m: 12,
    device_model: 'Pixel',
    device_os: 'Android 15',
    ...overrides,
  };
}

function upload(
  m: unknown,
  opts: { type?: string; bytes?: Uint8Array<ArrayBuffer> | null; raw?: string } = {},
): Request {
  const form = new FormData();
  form.set('metadata', opts.raw ?? JSON.stringify(m));
  if (opts.bytes !== null) {
    const bytes = opts.bytes ?? new Uint8Array([1, 2, 3, 4, 5]);
    form.set('recording', new File([bytes], 'rec', { type: opts.type ?? 'video/webm;codecs=vp9,opus' }));
  }
  return new Request('http://x/api/captures', { method: 'POST', body: form });
}

async function setup(deps: ConstructorParameters<typeof Archive>[1] = {}) {
  const root = await Deno.makeTempDir({ prefix: 'museum-test-' });
  const clientDir = `${root}/client`;
  await Deno.mkdir(clientDir);
  await Deno.writeTextFile(`${clientDir}/index.html`, '<html>app</html>');
  await Deno.writeTextFile(`${clientDir}/app.js`, 'x');
  const archive = new Archive(root, deps);
  const handler = createHandler({ archive, clientDir, maxUploadBytes: 1024 });
  return {
    root,
    archive,
    handler,
    cleanup: () => {
      archive.close();
      return Deno.remove(root, { recursive: true });
    },
  };
}

function* walk(dir: string): Generator<string> {
  for (const e of Deno.readDirSync(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* walk(p);
    else yield p;
  }
}

Deno.test('health', async () => {
  const t = await setup();
  const res = await t.handler(new Request('http://x/api/health'));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: 'ok' });
  await t.cleanup();
});

Deno.test('upload stores clip file and row with native extension', async () => {
  const t = await setup();
  const res = await t.handler(upload(meta()));
  assertEquals(res.status, 201);
  const { capture_id } = await res.json();
  assertMatch(capture_id, /^[0-9a-f-]{36}$/);
  const files = [...walk(`${t.root}/archive`)].filter((f) => f.endsWith('.webm'));
  assertEquals(files.length, 1);
  assert(files[0].endsWith(`/${capture_id}.webm`));
  assertEquals([...await Deno.readFile(files[0])], [1, 2, 3, 4, 5]);
  assertEquals(t.archive.count(), 1);
  await t.cleanup();
});

Deno.test('upload is idempotent on client_uuid', async () => {
  const t = await setup();
  const first = await (await t.handler(upload(meta()))).json();
  const again = await t.handler(upload(meta()));
  assertEquals(again.status, 200);
  assertEquals((await again.json()).capture_id, first.capture_id);
  assertEquals(t.archive.count(), 1);
  assertEquals([...walk(`${t.root}/archive`)].filter((f) => f.endsWith('.webm')).length, 1);

  const other = await (await t.handler(upload(meta({ client_uuid: UUID_B })))).json();
  assert(other.capture_id !== first.capture_id);
  await t.cleanup();
});

Deno.test('concurrent duplicates yield one capture', async () => {
  const t = await setup();
  const [a, b] = await Promise.all([t.handler(upload(meta())), t.handler(upload(meta()))]);
  assertEquals((await a.json()).capture_id, (await b.json()).capture_id);
  assertEquals(t.archive.count(), 1);
  await t.cleanup();
});

Deno.test('failed write leaves no file, no temp, no row', async () => {
  const t = await setup({
    writeFile: async (path, data) => {
      await Deno.writeFile(path, data.subarray(0, 2));
      throw new Error('disk full');
    },
  });
  const res = await t.handler(upload(meta()));
  assertEquals(res.status, 500);
  assertEquals([...walk(`${t.root}/archive`)].filter((f) => !f.includes('archive.sqlite')), []);
  assertEquals(t.archive.count(), 0);
  await t.cleanup();
});

Deno.test('clip is invisible at final path until complete; no temp left after success', async () => {
  let seenDuringWrite: string[] = [];
  const t = await setup({
    writeFile: async (path, data) => {
      await Deno.writeFile(path, data);
      seenDuringWrite = [...walk(`${path.slice(0, path.lastIndexOf('/.tmp'))}`)].filter((f) => f.endsWith('.webm'));
    },
  });
  await t.handler(upload(meta()));
  assertEquals(seenDuringWrite, []);
  assertEquals([...walk(`${t.root}/archive`)].filter((f) => f.endsWith('.part')), []);
  await t.cleanup();
});

Deno.test('failed row insert removes the clip', async () => {
  const t = await setup();
  const other = new Database(`${t.root}/archive/archive.sqlite`);
  other.exec(`CREATE TRIGGER no_insert BEFORE INSERT ON captures BEGIN SELECT RAISE(ABORT, 'nope'); END`);
  other.close();
  const res = await t.handler(upload(meta()));
  assertEquals(res.status, 500);
  assertEquals([...walk(`${t.root}/archive`)].filter((f) => f.endsWith('.webm') || f.endsWith('.part')), []);
  await t.cleanup();
});

Deno.test('rejects malformed requests', async () => {
  const t = await setup();
  const cases: [string, Request, number][] = [
    ['not multipart', new Request('http://x/api/captures', { method: 'POST', body: '{}' }), 415],
    ['bad json', upload(null, { raw: '{nope' }), 400],
    ['missing recording', upload(meta(), { bytes: null }), 400],
    ['empty recording', upload(meta(), { bytes: new Uint8Array() }), 400],
    ['bad type', upload(meta(), { type: 'text/html' }), 415],
    ['too large', upload(meta(), { bytes: new Uint8Array(2048) }), 413],
    ['bad uuid', upload(meta({ client_uuid: 'abc' })), 400],
    ['bad date', upload(meta({ captured_at: 'yesterday' })), 400],
    ['bad mode', upload(meta({ mode: 'photo' })), 400],
    ['bad seconds', upload(meta({ requested_seconds: 0 })), 400],
    ['bad lat', upload(meta({ lat: 91 })), 400],
    ['lat without lon', upload(meta({ lon: null })), 400],
    ['wrong method', new Request('http://x/api/captures'), 405],
  ];
  for (const [name, req, status] of cases) {
    assertEquals((await t.handler(req)).status, status, name);
  }
  assertEquals(t.archive.count(), 0);
  await t.cleanup();
});

Deno.test('optional fields may be absent', () => {
  const r = parseMetadata({
    client_uuid: UUID_A,
    captured_at: '2026-10-01T08:30:00Z',
    mode: 'snap',
    requested_seconds: 1,
  });
  assert(r.ok);
  assertEquals(r.value.lat, null);
  assertEquals(r.value.device_os, null);
});

Deno.test('serves the app with SPA fallback, never the archive', async () => {
  const t = await setup();
  await t.handler(upload(meta()));
  assertEquals(await (await t.handler(new Request('http://x/'))).text(), '<html>app</html>');
  assertEquals(await (await t.handler(new Request('http://x/app.js'))).text(), 'x');
  assertEquals(await (await t.handler(new Request('http://x/some/route'))).text(), '<html>app</html>');
  const trav = await t.handler(new Request('http://x/%2e%2e/archive/archive.sqlite'));
  assertEquals(await trav.text(), '<html>app</html>');
  assertEquals((await t.handler(new Request('http://x/api/nope'))).status, 404);
  await t.cleanup();
});
