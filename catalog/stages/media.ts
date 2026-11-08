// ffmpeg and ffprobe are not host packages: they run in our own image (catalog/ffmpeg/Dockerfile),
// one short-lived container per call, on the rootless daemon. Build it with catalog/ffmpeg/build.sh.
const FFMPEG_IMAGE = Deno.env.get('FFMPEG_IMAGE') ?? 'life-museum-ffmpeg:2026-11-08';
const IN_CONTAINER = new Set(['ffmpeg', 'ffprobe']);

/**
 * The container sees only the directories of the existing files named in `args`, read-only, at the
 * same paths (symlinks resolved first). Output goes to stdout only, so nothing is writable: no
 * network, no capabilities, read-only root. Priority is set inside, because a nice on the docker
 * client never reaches a process the daemon starts.
 */
function containerArgs(cmd: string, args: string[], name: string): string[] {
  const mounts = new Set<string>();
  const inner = args.map((a) => {
    if (!a.startsWith('/')) return a;
    try {
      if (!Deno.statSync(a).isFile) return a;
    } catch {
      return a;
    }
    const real = Deno.realPathSync(a);
    mounts.add(real.slice(0, real.lastIndexOf('/')) || '/');
    return real;
  });
  // deno-fmt-ignore
  return [
    '-c', 'rootless', 'run', '--rm', '--init', '--name', name,
    '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
    '--log-driver', 'none',
    ...[...mounts].flatMap((d) => ['-v', `${d}:${d}:ro`]),
    FFMPEG_IMAGE,
    'nice', '-n', '19', 'ionice', '-c3', cmd, ...inner,
  ];
}

export async function run(
  cmd: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ stdout: Uint8Array; stderr: string }> {
  const name = `life-museum-${cmd}-${crypto.randomUUID().slice(0, 8)}`;
  const contained = IN_CONTAINER.has(cmd);
  const signal = AbortSignal.timeout(timeoutMs);
  const p = new Deno.Command(contained ? 'docker' : 'nice', {
    args: contained ? containerArgs(cmd, args, name) : ['-n', '19', cmd, ...args],
    stdout: 'piped',
    stderr: 'piped',
    signal,
  });
  let out: Deno.CommandOutput;
  try {
    out = await p.output();
  } finally {
    // Killing the docker client on timeout does not reliably stop the container; remove it by name.
    if (contained && signal.aborted) {
      await new Deno.Command('docker', { args: ['-c', 'rootless', 'rm', '-f', name], stdout: 'null', stderr: 'null' })
        .output().catch(() => {});
    }
  }
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
