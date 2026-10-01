import { renderCollection } from './run.ts';

const dataRoot = Deno.env.get('DATA_ROOT') ?? '/mnt/usbssd/museum-data';
const force = Deno.args.includes('--force');

const r = await renderCollection(dataRoot, force);
console.log(
  new Date().toISOString(),
  JSON.stringify({ rendered: r.rendered, unchanged: r.unchanged.length, failed: r.failed }),
);
if (r.failed.length) Deno.exit(1);
