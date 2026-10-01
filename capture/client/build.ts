import * as esbuild from 'esbuild';

const root = new URL('.', import.meta.url).pathname;
const dist = `${root}dist`;

await Deno.remove(dist, { recursive: true }).catch(() => {});
await Deno.mkdir(dist, { recursive: true });

try {
  await esbuild.build({
    entryPoints: [`${root}src/main.tsx`, `${root}src/styles.css`],
    entryNames: 'app',
    outdir: dist,
    bundle: true,
    minify: true,
    target: ['chrome100', 'safari15'],
    jsx: 'automatic',
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"production"' },
    absWorkingDir: root,
  });
} finally {
  await esbuild.stop();
}

for (const entry of Deno.readDirSync(`${root}public`)) {
  if (entry.name !== 'sw.js') await Deno.copyFile(`${root}public/${entry.name}`, `${dist}/${entry.name}`);
}

const shell = ['/', '/index.html', '/app.js', '/app.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
const hash = async (path: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await Deno.readFile(path))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
const version = (await hash(`${dist}/app.js`)).slice(0, 8) + (await hash(`${dist}/app.css`)).slice(0, 8) +
  (await hash(`${dist}/index.html`)).slice(0, 8);
const sw = (await Deno.readTextFile(`${root}public/sw.js`))
  .replace('__VERSION__', version)
  .replace('__SHELL__', JSON.stringify(shell));
await Deno.writeTextFile(`${dist}/sw.js`, sw);

console.log(`built ${dist} (version ${version})`);
