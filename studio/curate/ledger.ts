export interface LedgerEntry {
  created: string; // ISO timestamp
  cost_usd: number;
}

/** All recorded runs, accepted (collection/<id>/meta.json) and rejected (collection/.rejected/<id>/meta.json). */
export async function readLedger(collectionDir: string): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  const scan = async (dir: string) => {
    try {
      for await (const d of Deno.readDir(dir)) {
        if (!d.isDirectory || d.name.startsWith('.')) continue;
        try {
          const m = JSON.parse(await Deno.readTextFile(`${dir}/${d.name}/meta.json`));
          entries.push({ created: String(m.created_at), cost_usd: Number(m.usage?.cost_usd ?? 0) });
        } catch { /* a directory without readable meta.json is not a run */ }
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  };
  await scan(collectionDir);
  await scan(`${collectionDir}/.rejected`);
  return entries;
}

export function spentSince(entries: LedgerEntry[], since: Date): number {
  return entries.filter((e) => new Date(e.created) >= since).reduce((s, e) => s + e.cost_usd, 0);
}
