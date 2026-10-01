import { Database } from '@db/sqlite';
import { parseSpec } from '../lib/spec.ts';
import { RENDERER_VERSION, renderHtml, themeFor } from './html.ts';

export interface RenderResult {
  rendered: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
}

function loadDates(catalogPath: string, ids: string[]): Map<string, string> {
  const dates = new Map<string, string>();
  try {
    const db = new Database(catalogPath, { readonly: true });
    try {
      const q = db.prepare('SELECT substr(captured_at,1,10) AS d FROM specimen WHERE capture_id = ?');
      for (const id of ids) {
        const row = q.get(id) as { d: string } | undefined;
        if (row?.d) dates.set(id, row.d);
      }
    } finally {
      db.close();
    }
  } catch {
    // no catalog: render without dates
  }
  return dates;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {};
  }
}

/** Render every collection/<id>/spec.md whose index.html is missing or stale. Never touches spec.md. */
export async function renderCollection(dataRoot: string, force = false): Promise<RenderResult> {
  const collection = `${dataRoot}/collection`;
  const res: RenderResult = { rendered: [], unchanged: [], failed: [] };
  const ids: string[] = [];
  for await (const e of Deno.readDir(collection)) {
    if (e.isDirectory && !e.name.startsWith('.')) ids.push(e.name);
  }
  ids.sort();

  for (const id of ids) {
    const dir = `${collection}/${id}`;
    try {
      const specText = await Deno.readTextFile(`${dir}/spec.md`).catch(() => null);
      if (specText === null) continue;
      const meta = await readJson(`${dir}/meta.json`);
      const theme = themeFor(id);
      const prev = meta.render as { version?: number; theme?: string } | undefined;
      const htmlStat = await Deno.stat(`${dir}/index.html`).catch(() => null);
      const specStat = await Deno.stat(`${dir}/spec.md`);
      const fresh = htmlStat !== null && prev?.version === RENDERER_VERSION && prev?.theme === theme &&
        (htmlStat.mtime?.getTime() ?? 0) >= (specStat.mtime?.getTime() ?? 0);
      if (fresh && !force) {
        res.unchanged.push(id);
        continue;
      }

      const parsed = parseSpec(specText);
      const dates = loadDates(`${dataRoot}/catalog/catalog.sqlite`, parsed.items.map((i) => i.id));
      const html = renderHtml({ specText, theme, dates });
      await Deno.writeTextFile(`${dir}/index.html.tmp`, html);
      await Deno.rename(`${dir}/index.html.tmp`, `${dir}/index.html`);
      meta.theme = theme;
      meta.render = { version: RENDERER_VERSION, theme, rendered_at: new Date().toISOString() };
      await Deno.writeTextFile(`${dir}/meta.json`, JSON.stringify(meta, null, 2) + '\n');
      res.rendered.push(id);
    } catch (err) {
      res.failed.push({ id, error: String(err instanceof Error ? err.message : err) });
    }
  }
  return res;
}
