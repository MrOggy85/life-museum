import type { CaptureMetadata } from './meta.ts';

export type QueueItem = {
  client_uuid: string;
  blob: Blob;
  metadata: CaptureMetadata;
  attempts: number;
  nextAttemptAt: number;
};

export interface QueueStore {
  add(item: QueueItem): Promise<void>;
  list(): Promise<QueueItem[]>;
  update(clientUuid: string, patch: Partial<Pick<QueueItem, 'attempts' | 'nextAttemptAt'>>): Promise<void>;
  remove(clientUuid: string): Promise<void>;
}

export class MemoryStore implements QueueStore {
  #items = new Map<string, QueueItem>();
  add(item: QueueItem) {
    this.#items.set(item.client_uuid, item);
    return Promise.resolve();
  }
  list() {
    return Promise.resolve([...this.#items.values()]);
  }
  update(clientUuid: string, patch: Partial<QueueItem>) {
    const cur = this.#items.get(clientUuid);
    if (cur) this.#items.set(clientUuid, { ...cur, ...patch });
    return Promise.resolve();
  }
  remove(clientUuid: string) {
    this.#items.delete(clientUuid);
    return Promise.resolve();
  }
}

const DB_NAME = 'capture-queue';
const STORE = 'items';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbStore implements QueueStore {
  #db: Promise<IDBDatabase>;

  constructor() {
    this.#db = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'client_uuid' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }

  async #store(mode: IDBTransactionMode) {
    return (await this.#db).transaction(STORE, mode).objectStore(STORE);
  }

  async add(item: QueueItem) {
    const store = await this.#store('readwrite');
    await request(store.put(item));
    // put() resolving before commit is not durable; wait for the transaction itself
    await new Promise<void>((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async list() {
    const items: QueueItem[] = await request((await this.#store('readonly')).getAll());
    return items.sort((a, b) => a.metadata.captured_at.localeCompare(b.metadata.captured_at));
  }

  async update(clientUuid: string, patch: Partial<QueueItem>) {
    const store = await this.#store('readwrite');
    const cur: QueueItem | undefined = await request(store.get(clientUuid));
    if (cur) await request(store.put({ ...cur, ...patch }));
  }

  async remove(clientUuid: string) {
    await request((await this.#store('readwrite')).delete(clientUuid));
  }
}
