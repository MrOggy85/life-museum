import { backoffDelay } from './backoff.ts';
import type { QueueStore } from './queue.ts';
import type { QueueItem } from './queue.ts';

/** 'ok' = server has it (including duplicates); 'rejected' = server answered with an error; 'unreachable' = no answer. */
export type SendResult = 'ok' | 'rejected' | 'unreachable';

export type DrainOutcome = { uploaded: number; nextAttemptAt: number | null };

export async function drain(
  store: QueueStore,
  send: (item: QueueItem) => Promise<SendResult>,
  now: () => number = Date.now,
  random = Math.random,
): Promise<DrainOutcome> {
  let uploaded = 0;
  let nextAttemptAt: number | null = null;
  const consider = (t: number) => nextAttemptAt = nextAttemptAt === null ? t : Math.min(nextAttemptAt, t);

  for (const item of await store.list()) {
    if (item.nextAttemptAt > now()) {
      consider(item.nextAttemptAt);
      continue;
    }
    const result = await send(item);
    if (result === 'ok') {
      await store.remove(item.client_uuid);
      uploaded++;
      continue;
    }
    const attempts = item.attempts + 1;
    const next = now() + backoffDelay(attempts, undefined, random);
    await store.update(item.client_uuid, { attempts, nextAttemptAt: next });
    consider(next);
    if (result === 'unreachable') {
      // the server is down for everyone; do not hammer it with the rest of the queue
      break;
    }
  }
  return { uploaded, nextAttemptAt };
}

export async function sendCapture(item: QueueItem, fetchFn: typeof fetch = fetch): Promise<SendResult> {
  const form = new FormData();
  form.set('metadata', JSON.stringify(item.metadata));
  form.set('recording', item.blob, `${item.client_uuid}`);
  try {
    const res = await fetchFn('/api/captures', { method: 'POST', body: form });
    await res.body?.cancel();
    return res.ok ? 'ok' : 'rejected';
  } catch {
    return 'unreachable';
  }
}
