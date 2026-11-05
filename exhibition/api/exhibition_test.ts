import { assertEquals, assertNotEquals } from '@std/assert';
import { jstDate, pickForDay, previousDay } from './rotation.ts';
import { makeHandler, withIcons } from './server.ts';

Deno.test('rotation: stable per day, never repeats yesterday, handles 0 and 1', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assertEquals(pickForDay(ids, '2026-10-01'), pickForDay([...ids].reverse(), '2026-10-01'));
  assertEquals(pickForDay([], '2026-10-01'), null);
  assertEquals(pickForDay(['only'], '2026-10-01'), 'only');
  let day = '2026-01-01';
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = pickForDay(ids, day)!;
    seen.add(p);
    assertNotEquals(p, pickForDay(ids, previousDay(day)));
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  assertEquals(seen.size, 4);
});

Deno.test('jstDate rolls over at 15:00 UTC', () => {
  assertEquals(jstDate(new Date('2026-10-01T14:59:00Z')), '2026-10-01');
  assertEquals(jstDate(new Date('2026-10-01T15:00:00Z')), '2026-10-02');
});

async function fixture() {
  const root = await Deno.makeTempDir();
  const col = `${root}/collection`;
  const put = async (id: string, spec: string, html: string | null) => {
    await Deno.mkdir(`${col}/${id}`, { recursive: true });
    await Deno.writeTextFile(`${col}/${id}/spec.md`, spec);
    if (html !== null) await Deno.writeTextFile(`${col}/${id}/index.html`, html);
  };
  await put('shown', '---\ntitle: T\n---\n\n![](capture_c1)\nX.\n', '<p>SHOWN</p>');
  await Deno.mkdir(`${col}/.rejected/r`, { recursive: true });
  await Deno.writeTextFile(`${col}/.rejected/r/index.html`, '<p>NO</p>');
  const bytes = new Uint8Array(100).map((_, i) => i);
  const files: Record<string, { path: string; mime: string }> = {};
  for (const id of ['c1', 'c2']) {
    await Deno.writeFile(`${root}/${id}.mp4`, bytes);
    files[id] = { path: `${root}/${id}.mp4`, mime: 'video/mp4; codecs=avc1.42000a' };
  }
  const handler = makeHandler({
    collectionDir: col,
    media: { find: (id) => files[id] ?? null, close() {} },
    now: () => new Date('2026-10-01T03:00:00Z'),
  });
  return { root, handler, put };
}
const get = (h: (r: Request) => Promise<Response>, path: string, headers?: HeadersInit) =>
  h(new Request(`http://x${path}`, { headers }));

Deno.test('serves only the rendered exhibition; never .rejected or unrendered', async () => {
  const { handler, put } = await fixture();
  await put('unrendered', '---\ntitle: U\n---\n', null);
  const r = await get(handler, '/');
  assertEquals([r.status, await r.text()], [200, withIcons('<p>SHOWN</p>')]);
  assertEquals(r.headers.get('content-security-policy')?.includes("default-src 'none'"), true);
});

Deno.test('empty collection shows a placeholder', async () => {
  const root = await Deno.makeTempDir();
  const h = makeHandler({ collectionDir: `${root}/collection`, media: { find: () => null, close() {} } });
  const r = await get(h, '/');
  assertEquals(r.status, 200);
  assertEquals((await r.text()).includes('Nothing is on display'), true);
});

Deno.test('media: only clips of the displayed exhibition, with range support', async () => {
  const { handler } = await fixture();
  const ok = await get(handler, '/media/c1.mp4');
  assertEquals([ok.status, ok.headers.get('content-type'), (await ok.bytes()).length], [200, 'video/mp4', 100]);
  assertEquals((await get(handler, '/media/c2.mp4')).status, 404); // in the archive, not in today's spec
  assertEquals((await get(handler, '/media/..%2Fx.mp4')).status, 404);
  assertEquals((await get(handler, '/media/c1.mov')).status, 404);

  const part = await get(handler, '/media/c1.mp4', { range: 'bytes=10-19' });
  assertEquals([part.status, part.headers.get('content-range')], [206, 'bytes 10-19/100']);
  assertEquals((await part.bytes())[0], 10);
  const tail = await get(handler, '/media/c1.mp4', { range: 'bytes=-5' });
  assertEquals(tail.headers.get('content-range'), 'bytes 95-99/100');
  await tail.body?.cancel();
  const bad = await get(handler, '/media/c1.mp4', { range: 'bytes=500-' });
  assertEquals(bad.status, 416);
  await bad.body?.cancel();
});

Deno.test('writes and unknown paths are refused', async () => {
  const { handler } = await fixture();
  assertEquals((await handler(new Request('http://x/', { method: 'POST' }))).status, 405);
  assertEquals((await get(handler, '/api/captures')).status, 404);
  assertEquals((await get(handler, '/api/health')).status, 200);
});

Deno.test('an exhibition created today is held back until tomorrow, unless it is the only one', async () => {
  const { root, handler, put } = await fixture();
  await Deno.writeTextFile(
    `${root}/collection/shown/meta.json`,
    JSON.stringify({ created_at: '2026-09-20T00:00:00Z' }),
  );
  await put('fresh', '---\ntitle: F\n---\n', '<p>FRESH</p>');
  await Deno.writeTextFile(
    `${root}/collection/fresh/meta.json`,
    JSON.stringify({ created_at: '2026-10-01T02:00:00Z' }),
  );
  assertEquals(await (await get(handler, '/')).text(), withIcons('<p>SHOWN</p>'));
});

Deno.test('player script is served with a CSP that allows only same-origin scripts', async () => {
  const { handler } = await fixture();
  const r = await get(handler, '/_/player.js');
  assertEquals([r.status, r.headers.get('content-type')], [200, 'text/javascript; charset=utf-8']);
  assertEquals((await r.text()).includes('IntersectionObserver'), true);
  const page = await get(handler, '/');
  assertEquals(page.headers.get('content-security-policy')?.includes("script-src 'self'"), true);
});

Deno.test('home-screen icon: served by exact name, linked from the page, allowed by the CSP', async () => {
  const handler = makeHandler({ collectionDir: await Deno.makeTempDir(), media: { find: () => null } as never });
  const png = await handler(new Request('http://x/icon/icon-180.png'));
  assertEquals(png.status, 200);
  assertEquals(png.headers.get('content-type'), 'image/png');
  await png.body?.cancel();
  for (const bad of ['/icon/head.html', '/icon/../server.ts', '/icon/icon.svg', '/icon/']) {
    const r = await handler(new Request('http://x' + bad));
    assertEquals(r.status, 404, bad);
    await r.body?.cancel();
  }
  const page = await handler(new Request('http://x/'));
  const html = await page.text();
  assertEquals(html.includes('<link rel="apple-touch-icon" href="/icon/icon-180.png">'), true);
  assertEquals(html.indexOf('apple-touch-icon') < html.indexOf('<title>'), true);
  const csp = page.headers.get('content-security-policy') ?? '';
  assertEquals(csp.includes("img-src 'self'") && csp.includes("manifest-src 'self'"), true);
});
