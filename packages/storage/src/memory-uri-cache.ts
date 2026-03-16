/**
 * MemoryUriCache — T-ST-9.
 *
 * Simple in-memory TTL cache for signed URLs and other URI strings.
 */

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 3_600_000; // 1 hour

export class MemoryUriCache {
  private readonly _store = new Map<string, CacheEntry>();
  private readonly _defaultTtlMs: number;

  constructor(defaultTtlMs: number = DEFAULT_TTL_MS) {
    this._defaultTtlMs = defaultTtlMs > 0 ? defaultTtlMs : DEFAULT_TTL_MS;
  }

  get size(): number {
    return this._store.size;
  }

  get(key: string): string | null {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.url;
  }

  set(key: string, url: string, ttlMs?: number): void {
    const ttl = ttlMs != null && ttlMs > 0 ? ttlMs : this._defaultTtlMs;
    this._store.set(key, {
      url,
      expiresAt: Date.now() + ttl,
    });
  }

  delete(key: string): void {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }
}
