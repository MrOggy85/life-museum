import { assert, assertEquals } from '@std/assert';
import { backoffDelay } from './backoff.ts';
import { buildMetadata, coarseDevice, isoWithOffset, nextDuration } from './meta.ts';
import { MemoryStore, type QueueItem } from './queue.ts';
import { drain, type SendResult } from './uploader.ts';

function item(uuid: string, at: string): QueueItem {
  return {
    client_uuid: uuid,
    blob: new Blob(['x']),
    metadata: { client_uuid: uuid, captured_at: at, timezone: null, mode: 'clip', requested_seconds: 3 },
    attempts: 0,
    nextAttemptAt: 0,
  };
}

Deno.test('backoff grows exponentially and caps', () => {
  const none = () => 0;
  assertEquals(backoffDelay(1, undefined, none), 2000);
  assertEquals(backoffDelay(2, undefined, none), 4000);
  assertEquals(backoffDelay(3, undefined, none), 8000);
  assertEquals(backoffDelay(50, undefined, none), 300_000);
  assertEquals(backoffDelay(50, undefined, () => 1), 300_000);
  assert(backoffDelay(2, undefined, () => 1) <= 5000);
});

Deno.test('drain uploads everything and empties the queue', async () => {
  const store = new MemoryStore();
  await store.add(item('a', '2026-01-01T00:00:00Z'));
  await store.add(item('b', '2026-01-01T00:00:01Z'));
  const sent: string[] = [];
  const out = await drain(store, (i) => (sent.push(i.client_uuid), Promise.resolve('ok')));
  assertEquals(sent, ['a', 'b']);
  assertEquals(out, { uploaded: 2, nextAttemptAt: null });
  assertEquals((await store.list()).length, 0);
});

Deno.test('unreachable server: item kept, backoff set, rest of queue not attempted', async () => {
  const store = new MemoryStore();
  await store.add(item('a', '1'));
  await store.add(item('b', '2'));
  let calls = 0;
  const out = await drain(store, () => (calls++, Promise.resolve('unreachable')), () => 1000, () => 0);
  assertEquals(calls, 1);
  assertEquals(out.uploaded, 0);
  assertEquals(out.nextAttemptAt, 3000);
  const left = await store.list();
  assertEquals(left.length, 2);
  assertEquals(left[0].attempts, 1);
  assertEquals(left[0].nextAttemptAt, 3000);
});

Deno.test('items in backoff are skipped until due, then retried and eventually sent', async () => {
  const store = new MemoryStore();
  await store.add(item('a', '1'));
  let clock = 0;
  const results: SendResult[] = ['rejected', 'ok'];
  const send = () => Promise.resolve(results.shift()!);
  const first = await drain(store, send, () => clock, () => 0);
  assertEquals(first.nextAttemptAt, 2000);
  clock = 1999;
  assertEquals((await drain(store, send, () => clock, () => 0)).uploaded, 0);
  assertEquals(results.length, 1);
  clock = 2000;
  assertEquals((await drain(store, send, () => clock, () => 0)).uploaded, 1);
  assertEquals((await store.list()).length, 0);
});

Deno.test('a rejected item does not block later ones', async () => {
  const store = new MemoryStore();
  await store.add(item('bad', '1'));
  await store.add(item('good', '2'));
  const out = await drain(store, (i) => Promise.resolve(i.client_uuid === 'bad' ? 'rejected' : 'ok'));
  assertEquals(out.uploaded, 1);
  assertEquals((await store.list()).map((i) => i.client_uuid), ['bad']);
});

Deno.test('duration toggle cycles 3 -> 5 -> 10 -> 3', () => {
  assertEquals([3, 5, 10].map(nextDuration), [5, 10, 3]);
});

Deno.test('isoWithOffset renders local time with offset', () => {
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(isoWithOffset(new Date())));
});

Deno.test('coarse device info', () => {
  assertEquals(coarseDevice('Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A) Chrome/130'), {
    device_os: 'Android 15',
    device_model: 'Pixel 9',
  });
  assertEquals(coarseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)'), {
    device_os: 'iOS 18.1',
    device_model: 'iPhone',
  });
});

Deno.test('metadata omits position when absent and carries it when present', () => {
  const base = {
    uuid: 'u',
    now: new Date(0),
    timezone: 'UTC',
    mode: 'snap' as const,
    requestedSeconds: 1,
    userAgent: '',
  };
  assert(!('lat' in buildMetadata({ ...base, position: null })));
  const m = buildMetadata({ ...base, position: { lat: 1, lon: 2, accuracy: 3 } });
  assertEquals([m.lat, m.lon, m.accuracy_m], [1, 2, 3]);
});
