import { Archive } from './archive.ts';
import { extensionFor, parseMetadata } from './validate.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export type HandlerOptions = {
  archive: Archive;
  clientDir: string;
  maxUploadBytes: number;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function serveStatic(clientDir: string, pathname: string): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const segments = rel.split('/').filter((s) => s !== '');
  const safe = !segments.some((s) => s === '..' || s === '.' || s.includes('\0'));
  const candidates = safe && segments.length > 0 ? [segments.join('/')] : [];
  candidates.push('index.html');

  for (const [i, name] of candidates.entries()) {
    try {
      const path = `${clientDir.replace(/\/+$/, '')}/${name}`;
      const stat = await Deno.stat(path);
      if (!stat.isFile) continue;
      const ext = name.slice(name.lastIndexOf('.'));
      return new Response((await Deno.open(path)).readable, {
        headers: {
          'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
          'content-length': String(stat.size),
          'cache-control': 'no-cache',
        },
      });
    } catch {
      if (i === candidates.length - 1) break;
    }
  }
  return new Response('Client not built', { status: 503 });
}

async function postCapture(req: Request, opts: HandlerOptions): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > opts.maxUploadBytes) return json({ error: 'upload too large' }, 413);

  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    return json({ error: 'expected multipart/form-data' }, 415);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'malformed multipart body' }, 400);
  }

  const meta = parseMetadata(form.get('metadata'));
  if (!meta.ok) return json({ error: meta.error }, 400);

  const recording = form.get('recording');
  if (!(recording instanceof File)) return json({ error: 'recording file is required' }, 400);
  if (recording.size === 0) return json({ error: 'recording is empty' }, 400);
  if (recording.size > opts.maxUploadBytes) return json({ error: 'upload too large' }, 413);
  const ext = extensionFor(recording.type);
  if (!ext) return json({ error: `unsupported recording type: ${recording.type || 'none'}` }, 415);

  try {
    const data = new Uint8Array(await recording.arrayBuffer());
    const result = await opts.archive.store(meta.value, recording.type, ext, data);
    return json({ capture_id: result.capture_id }, result.duplicate ? 200 : 201);
  } catch (e) {
    console.error('store failed', e);
    return json({ error: 'could not store capture' }, 500);
  }
}

export function createHandler(opts: HandlerOptions): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === '/api/health') {
      return req.method === 'GET' || req.method === 'HEAD'
        ? json({ status: 'ok' })
        : json({ error: 'method not allowed' }, 405);
    }
    if (pathname === '/api/captures') {
      return req.method === 'POST' ? await postCapture(req, opts) : json({ error: 'method not allowed' }, 405);
    }
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return await serveStatic(opts.clientDir, pathname);
  };
}

export async function init(host: string, port: number): Promise<Deno.HttpServer> {
  const { DATA_ROOT, CLIENT_DIR, MAX_UPLOAD_BYTES } = await import('./config.ts');
  const archive = new Archive(DATA_ROOT);
  const handler = createHandler({ archive, clientDir: CLIENT_DIR, maxUploadBytes: MAX_UPLOAD_BYTES });
  const server = Deno.serve({ hostname: host, port }, handler);
  Deno.addSignalListener('SIGTERM', () => server.shutdown().then(() => archive.close()));
  return server;
}
