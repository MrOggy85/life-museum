import { Database } from '@db/sqlite';

export interface MediaSource {
  find(captureId: string): { path: string; mime: string } | null;
  close(): void;
}

/** Read-only view of the archive registry: capture id -> file. */
export function openMediaSource(archiveDir: string): MediaSource {
  const db = new Database(`${archiveDir}/archive.sqlite`, { readonly: true });
  const q = db.prepare('SELECT file_path, mime_type FROM captures WHERE capture_id = ?');
  return {
    find(id) {
      const row = q.get(id) as { file_path: string; mime_type: string } | undefined;
      if (!row || row.file_path.split('/').includes('..')) return null;
      return { path: `${archiveDir}/${row.file_path}`, mime: row.mime_type };
    },
    close: () => db.close(),
  };
}

function parseRange(header: string, size: number): [number, number] | 'invalid' {
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number, end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : [start, end];
}

/** Clips are a few MiB at most, so they are read whole; ranges are needed because iOS Safari insists on them. */
export async function serveClip(path: string, mime: string, rangeHeader: string | null): Promise<Response> {
  let data: Uint8Array<ArrayBuffer>;
  try {
    data = await Deno.readFile(path);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers: Record<string, string> = {
    'content-type': mime.split(';')[0],
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  };
  if (rangeHeader === null) return new Response(data, { headers });
  const r = parseRange(rangeHeader, data.length);
  if (r === 'invalid') {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
  }
  const [start, end] = r;
  return new Response(data.subarray(start, end + 1), {
    status: 206,
    headers: { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}` },
  });
}
