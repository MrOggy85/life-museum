import { assertRejects } from '@std/assert';
import { assertDataRootReady } from './guard.ts';

Deno.test('refuses a data root on the same device as its parent', async () => {
  const dir = await Deno.makeTempDir();
  await assertRejects(() => assertDataRootReady(dir), Error, 'does not look mounted');
  await Deno.remove(dir);
});

Deno.test('refuses a missing data root, even when unmounted roots are allowed', async () => {
  await assertRejects(() => assertDataRootReady('/nonexistent/data-root', true), Error, 'does not exist');
});

Deno.test('explicit override skips only the mount check', async () => {
  const dir = await Deno.makeTempDir();
  await assertDataRootReady(dir, true);
  await Deno.remove(dir);
});

Deno.test({
  name: 'accepts a root on a different device than its parent',
  ignore: !(await Deno.stat('/mnt/usbssd').then(() => true, () => false)),
  fn: async () => {
    // the real mountpoint of the external SSD on the production machine
    await assertDataRootReady('/mnt/usbssd');
  },
});
