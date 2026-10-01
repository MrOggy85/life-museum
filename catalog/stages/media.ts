export async function run(
  cmd: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ stdout: Uint8Array; stderr: string }> {
  const p = new Deno.Command('nice', {
    args: ['-n', '19', cmd, ...args],
    stdout: 'piped',
    stderr: 'piped',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const out = await p.output();
  if (!out.success) {
    throw new Error(`${cmd} exited ${out.code}: ${new TextDecoder().decode(out.stderr).slice(-300)}`);
  }
  return { stdout: out.stdout, stderr: new TextDecoder().decode(out.stderr) };
}

/** Raw decoded frames: `fps` frames/s scaled to w×h in the given pix_fmt, concatenated. */
export async function rawFrames(file: string, fps: number, w: number, h: number, pixFmt: 'rgb24' | 'gray') {
  const { stdout } = await run('ffmpeg', [
    '-v',
    'error',
    '-threads',
    '1',
    '-i',
    file,
    '-an',
    '-vf',
    `fps=${fps},scale=${w}:${h}`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    pixFmt,
    '-',
  ]);
  const frameBytes = w * h * (pixFmt === 'rgb24' ? 3 : 1);
  const frames: Uint8Array[] = [];
  for (let o = 0; o + frameBytes <= stdout.length; o += frameBytes) frames.push(stdout.subarray(o, o + frameBytes));
  return frames;
}
