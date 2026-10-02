import { assertEquals, assertStringIncludes } from '@std/assert';
import { RENDERER_VERSION, renderHtml, themeFor } from './html.ts';
import { renderCollection } from './run.ts';
import { THEMES } from './themes.ts';

const spec = (extra = '') =>
  `---
title: Thresholds <b>
thesis: Five "doorways" & more.
curator: architect@v1
created: 2026-10-01
${extra}---

## Entering

![](capture_a)
Entrance. <script>x</script>

## Leaving

![](capture_b)
Lobby.
`;
const dates = new Map([['a', '2026-09-03'], ['b', '2026-09-04']]);

Deno.test('html: deterministic, escaped, sectioned, media by id', () => {
  const a = renderHtml({ specText: spec(), theme: 'gallery', dates });
  assertEquals(a, renderHtml({ specText: spec(), theme: 'gallery', dates }));
  assertStringIncludes(a, 'Thresholds &lt;b&gt;');
  assertStringIncludes(a, '&lt;script&gt;');
  assertEquals(a.includes('<script>'), false);
  assertStringIncludes(a, '<h2>Entering</h2>');
  assertStringIncludes(a, 'src="/media/a.mp4"');
  assertEquals(a.indexOf('/media/a.mp4') < a.indexOf('/media/b.mp4'), true);
});

Deno.test('html: reveal_dates never (default), after, always', () => {
  const never = renderHtml({ specText: spec(), theme: 'gallery', dates });
  assertEquals(never.includes('2026-09-03'), false);
  const after = renderHtml({ specText: spec('reveal_dates: after\n'), theme: 'gallery', dates });
  assertStringIncludes(after, '<details class="date"><summary>Date</summary>2026-09-03');
  const always = renderHtml({ specText: spec('reveal_dates: always\n'), theme: 'gallery', dates });
  assertStringIncludes(always, '<p class="date">2026-09-04</p>');
});

Deno.test('themeFor is stable and always a known theme', () => {
  assertEquals(themeFor('20261001-architect-2d95'), themeFor('20261001-architect-2d95'));
  for (const id of ['x', 'y', 'z', '20261001-filmmaker-0000']) assertEquals(themeFor(id) in THEMES, true);
});

Deno.test('collection: renders missing, skips fresh, re-renders on edit, skips .rejected, keeps meta', async () => {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/collection/e1`, { recursive: true });
  await Deno.mkdir(`${root}/collection/.rejected/r1`, { recursive: true });
  await Deno.writeTextFile(`${root}/collection/.rejected/r1/spec.draft.md`, 'x');
  await Deno.writeTextFile(`${root}/collection/e1/spec.md`, spec());
  await Deno.writeTextFile(
    `${root}/collection/e1/meta.json`,
    JSON.stringify({ exhibition_id: 'e1', usage: { cost_usd: 0.1 } }),
  );

  const r1 = await renderCollection(root);
  assertEquals([r1.rendered, r1.unchanged.length, r1.failed], [['e1'], 0, []]);
  const meta = JSON.parse(await Deno.readTextFile(`${root}/collection/e1/meta.json`));
  assertEquals([meta.exhibition_id, meta.usage.cost_usd, meta.render.version], ['e1', 0.1, RENDERER_VERSION]);
  assertEquals(await Deno.stat(`${root}/collection/.rejected/r1/index.html`).then(() => true, () => false), false);

  const html = await Deno.readTextFile(`${root}/collection/e1/index.html`);
  assertEquals((await renderCollection(root)).unchanged, ['e1']);

  await new Promise((r) => setTimeout(r, 20));
  await Deno.writeTextFile(`${root}/collection/e1/spec.md`, spec().replace('Lobby.', 'Hall.'));
  assertEquals((await renderCollection(root)).rendered, ['e1']);
  assertStringIncludes(await Deno.readTextFile(`${root}/collection/e1/index.html`), 'Hall.');
  assertEquals(html.includes('Hall.'), false);
  assertEquals((await renderCollection(root, true)).rendered, ['e1']);
});

Deno.test('collection: a broken spec is reported, others still render', async () => {
  const root = await Deno.makeTempDir();
  for (const id of ['bad', 'good']) await Deno.mkdir(`${root}/collection/${id}`, { recursive: true });
  await Deno.writeTextFile(`${root}/collection/bad/spec.md`, 'no frontmatter');
  await Deno.writeTextFile(`${root}/collection/good/spec.md`, spec());
  const r = await renderCollection(root);
  assertEquals([r.rendered, r.failed.map((f) => f.id)], [['good'], ['bad']]);
});
