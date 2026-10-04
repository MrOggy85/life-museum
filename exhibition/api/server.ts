import { assertDataRootReady } from './guard.ts';
import { captureIdsOf, listRendered } from './collection.ts';
import { type MediaSource, openMediaSource, serveClip } from './media.ts';
import { PLAYER_JS } from './player.ts';
import { jstDate, pickForDay } from './rotation.ts';

export type HandlerOptions = {
  collectionDir: string;
  media: MediaSource;
  now?: () => Date;
};

const SECURITY = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; media-src 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const EMPTY = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
  '<title>Museum of Ordinary Life</title><p style="font-family:serif;margin:3rem">Nothing is on display.</p>';

export function makeHandler(opts: HandlerOptions): (req: Request) => Promise<Response> {
  const now = opts.now ?? (() => new Date());

  async function today(): Promise<string | null> {
    const day = jstDate(now());
    const midnight = new Date(Date.parse(`${day}T00:00:00+09:00`));
    return pickForDay(await listRendered(opts.collectionDir, midnight), day);
  }

  return async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const { pathname } = new URL(req.url);

    if (pathname === '/api/health') return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });

    if (pathname === '/') {
      const id = await today();
      if (id === null) {
        return new Response(EMPTY, { headers: { ...SECURITY, 'content-type': 'text/html; charset=utf-8' } });
      }
      const html = await Deno.readFile(`${opts.collectionDir}/${id}/index.html`);
      return new Response(html, {
        headers: { ...SECURITY, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
      });
    }

    if (pathname === '/_/player.js') {
      return new Response(PLAYER_JS, {
        headers: { ...SECURITY, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' },
      });
    }

    const m = pathname.match(/^\/media\/([A-Za-z0-9_-]+)\.mp4$/);
    if (m) {
      const exhibition = await today();
      if (exhibition === null || !(await captureIdsOf(opts.collectionDir, exhibition)).has(m[1])) {
        return new Response('Not found', { status: 404 });
      }
      const clip = opts.media.find(m[1]);
      if (!clip) return new Response('Not found', { status: 404 });
      return serveClip(clip.path, clip.mime, req.headers.get('range'));
    }

    return new Response('Not found', { status: 404 });
  };
}

export async function init(host: string, port: number): Promise<Deno.HttpServer> {
  const dataRoot = Deno.env.get('DATA_ROOT');
  if (!dataRoot) throw new Error('Missing required environment variable DATA_ROOT');
  await assertDataRootReady(
    dataRoot,
    Deno.env.get('ALLOW_UNMOUNTED_DATA_ROOT') === '1',
    Deno.env.get('MOUNT_POINT') ?? dataRoot,
  );
  const media = openMediaSource(`${dataRoot.replace(/\/+$/, '')}/archive`);
  const handler = makeHandler({ collectionDir: `${dataRoot.replace(/\/+$/, '')}/collection`, media });
  return Deno.serve({ hostname: host, port }, handler);
}
