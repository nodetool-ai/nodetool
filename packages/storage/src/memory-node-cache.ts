/**
 * Node cache — T-ST-6/T-ST-7.
 *
 * Abstract cache interface and in-memory implementation with TTL support.
 */

export interface AbstractNodeCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
}

export class MemoryNodeCache implements AbstractNodeCache {
  private _store = new Map<string, CacheEntry>();

  async get(key: string): Promise<unknown | undefined> {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds != null ? Date.now() + ttlSeconds * 1000 : null;
    this._store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }

  async clear(): Promise<void> {
    this._store.clear();
  }
}
