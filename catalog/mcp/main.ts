import { Database } from '@db/sqlite';
import { handle } from './server.ts';

const DATA_ROOT = Deno.env.get('DATA_ROOT') ?? '/mnt/usbssd/museum-data';

// The only handle this process ever opens is read-only: the agent behind it cannot write or reach the archive.
const db = new Database(`${DATA_ROOT}/catalog/catalog.sqlite`, { readonly: true });

const decoder = new TextDecoder();
let buf = '';
for await (const chunk of Deno.stdin.readable) {
  buf += decoder.decode(chunk, { stream: true });
  let nl: number;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let out: Record<string, unknown> | null;
    try {
      out = handle(db, JSON.parse(line));
    } catch {
      out = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } };
    }
    if (out) console.log(JSON.stringify(out));
  }
}
db.close();
