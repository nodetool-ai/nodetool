import type { StorageAdapter } from "./storage-adapter.js";
import { normalizeStorageKey } from "./storage-keys.js";

/**
 * In-memory storage adapter useful for tests and single-process ephemeral runs.
 *
 * URI scheme: `memory://<key>`.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private _store = new Map<string, Uint8Array>();

  async store(
    key: string,
    data: Uint8Array,
    _contentType?: string
  ): Promise<string> {
    const normalized = normalizeStorageKey(key);
    this._store.set(normalized, new Uint8Array(data));
    return `memory://${normalized}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const value = this._store.get(key);
    return value ? new Uint8Array(value) : null;
  }

  async exists(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    const key = uri.slice("memory://".length);
    return this._store.has(key);
  }

  uriForKey(key: string): string {
    return `memory://${normalizeStorageKey(key)}`;
  }
}
