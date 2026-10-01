import { dirname, resolve } from 'node:path';

/**
 * The data root lives on a nofail USB mount: if the disk is absent, the mountpoint is just an empty directory on the
 * root filesystem and captures would silently land there. A real mount has a different st_dev than its parent.
 */
export async function assertDataRootReady(
  dataRoot: string,
  allowUnmounted = false,
  mountPoint = dataRoot,
): Promise<void> {
  const root = resolve(dataRoot);
  let rootStat: Deno.FileInfo;
  try {
    rootStat = await Deno.stat(root);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    throw new Error(`DATA_ROOT ${root} does not exist (is the disk mounted?)`);
  }
  if (!rootStat.isDirectory) throw new Error(`DATA_ROOT ${root} is not a directory`);
  if (allowUnmounted) return;
  const mount = resolve(mountPoint);
  const [mountStat, parentStat] = await Promise.all([Deno.stat(mount), Deno.stat(dirname(mount))]);
  if (rootStat.dev !== mountStat.dev || mountStat.dev === parentStat.dev) {
    throw new Error(
      `DATA_ROOT ${root} is not on a mounted filesystem at ${mount}, so the disk does not look mounted. ` +
        'Refusing to start. Set ALLOW_UNMOUNTED_DATA_ROOT=1 to override (temp/test runs only).',
    );
  }
}
