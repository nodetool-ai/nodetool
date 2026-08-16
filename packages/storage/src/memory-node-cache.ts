export interface AbstractNodeCache<TValue> {
  get(key: string): Promise<TValue | undefined>;
  set(key: string, value: TValue, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface CacheEntry<TValue> {
  value: TValue;
  expiresAt: number | null;
}

export class MemoryNodeCache<TValue> implements AbstractNodeCache<TValue> {
  private _store = new Map<string, CacheEntry<TValue>>();

  async get(key: string): Promise<TValue | undefined> {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: TValue, ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null;
    this._store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }

  async clear(): Promise<void> {
    this._store.clear();
  }
}
