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

// img-src and manifest-src are for the home-screen icon and manifest only:
// everything an exhibition shows is video or inline style.
const SECURITY = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; media-src 'self'; img-src 'self'; manifest-src 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const EMPTY = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
  '<title>Museum of Ordinary Life</title><p style="font-family:serif;margin:3rem">Nothing is on display.</p>';

// Home-screen icon, favicon and manifest, drawn by claude_harness/icons/make.mjs
// on odin. Read once at start; served by exact name, never by path.
const ICON_DIR = new URL('./icon/', import.meta.url);
const ICON_TYPES: Record<string, string> = {
  'icon-180.png': 'image/png',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png',
  'favicon.svg': 'image/svg+xml',
  'manifest.webmanifest': 'application/manifest+json',
};
const ICONS = new Map(Object.keys(ICON_TYPES).map((n) => [n, Deno.readFileSync(new URL(n, ICON_DIR))]));
const ICON_HEAD = Deno.readTextFileSync(new URL('head.html', ICON_DIR));

/** The exhibitions are rendered without icon links; they are added on the way out. */
export function withIcons(html: string): string {
  const at = html.search(/<title[\s>]/i);
  if (at >= 0) return html.slice(0, at) + ICON_HEAD + html.slice(at);
  const head = html.match(/<head[^>]*>/i);
  if (head?.index !== undefined) {
    const end = head.index + head[0].length;
    return html.slice(0, end) + ICON_HEAD + html.slice(end);
  }
  return ICON_HEAD + html;
}

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

    if (pathname.startsWith('/icon/')) {
      const name = pathname.slice('/icon/'.length);
      const data = Object.hasOwn(ICON_TYPES, name) ? ICONS.get(name) : undefined;
      if (!data) return new Response('Not found', { status: 404 });
      return new Response(data, {
        headers: { ...SECURITY, 'content-type': ICON_TYPES[name], 'cache-control': 'max-age=86400' },
      });
    }

    if (pathname === '/') {
      const id = await today();
      if (id === null) {
        return new Response(withIcons(EMPTY), { headers: { ...SECURITY, 'content-type': 'text/html; charset=utf-8' } });
      }
      const html = withIcons(await Deno.readTextFile(`${opts.collectionDir}/${id}/index.html`));
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
