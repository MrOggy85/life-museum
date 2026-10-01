const REF = /^!\[\]\(capture_([^)\s]+)\)\s*$/gm;

/**
 * Exhibitions that are rendered and visible: collection/<id>/index.html exists; dot-directories are skipped.
 * With `createdBefore`, exhibitions made since then are held back, so the pool (and therefore the day's pick)
 * does not change when a nightly job lands one mid-day. If that leaves nothing, everything rendered is eligible.
 */
export async function listRendered(collectionDir: string, createdBefore?: Date): Promise<string[]> {
  const ids: string[] = [];
  try {
    for await (const e of Deno.readDir(collectionDir)) {
      if (!e.isDirectory || e.name.startsWith('.')) continue;
      const html = await Deno.stat(`${collectionDir}/${e.name}/index.html`).catch(() => null);
      if (html?.isFile) ids.push(e.name);
    }
    if (createdBefore) {
      const settled: string[] = [];
      for (const id of ids) {
        const meta = await Deno.readTextFile(`${collectionDir}/${id}/meta.json`).then(JSON.parse, () => ({}));
        const at = Date.parse(meta.created_at ?? '');
        if (Number.isNaN(at) || at < createdBefore.getTime()) settled.push(id);
      }
      if (settled.length > 0) return settled;
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  return ids;
}

export async function captureIdsOf(collectionDir: string, exhibitionId: string): Promise<Set<string>> {
  const spec = await Deno.readTextFile(`${collectionDir}/${exhibitionId}/spec.md`);
  return new Set([...spec.matchAll(REF)].map((m) => m[1]));
}
