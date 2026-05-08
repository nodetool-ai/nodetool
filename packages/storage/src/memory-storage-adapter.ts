import type {
  StorageAdapter,
  StorageEntry,
  StorageListResult,
  StorageStat
} from "./storage-adapter.js";
import { normalizeStorageKey } from "./storage-keys.js";

interface MemoryEntry {
  data: Uint8Array;
  contentType: string | undefined;
  modifiedAt: number;
}

/**
 * In-memory storage adapter useful for tests and single-process ephemeral runs.
 *
 * URI scheme: `memory://<key>`.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private _store = new Map<string, MemoryEntry>();

  async store(
    key: string,
    data: Uint8Array,
    contentType?: string
  ): Promise<string> {
    const normalized = normalizeStorageKey(key);
    this._store.set(normalized, {
      data: new Uint8Array(data),
      contentType,
      modifiedAt: Date.now()
    });
    return `memory://${normalized}`;
  }

  async retrieve(uri: string): Promise<Uint8Array | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const value = this._store.get(key);
    return value ? new Uint8Array(value.data) : null;
  }

  async exists(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    const key = uri.slice("memory://".length);
    return this._store.has(key);
  }

  uriForKey(key: string): string {
    return `memory://${normalizeStorageKey(key)}`;
  }

  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    const delimiter = opts.delimiter ?? null;
    let normalizedPrefix = "";
    if (prefix && prefix !== "" && prefix !== "/") {
      try {
        normalizedPrefix = normalizeStorageKey(prefix);
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
    }
    const matchPrefix = normalizedPrefix ? `${normalizedPrefix}/` : "";

    const entries: StorageEntry[] = [];
    const commonPrefixes = new Set<string>();

    for (const [key, entry] of this._store.entries()) {
      if (matchPrefix && !key.startsWith(matchPrefix) && key !== normalizedPrefix) {
        continue;
      }
      if (matchPrefix === "" || key.startsWith(matchPrefix)) {
        const rest = matchPrefix ? key.slice(matchPrefix.length) : key;
        if (delimiter === "/") {
          const idx = rest.indexOf("/");
          if (idx >= 0) {
            commonPrefixes.add(`${matchPrefix}${rest.slice(0, idx + 1)}`);
            continue;
          }
        }
        entries.push({
          key,
          uri: `memory://${key}`,
          size: entry.data.byteLength,
          modifiedAt: entry.modifiedAt,
          ...(entry.contentType ? { contentType: entry.contentType } : {})
        });
      }
    }

    return {
      entries: entries.sort((a, b) => a.key.localeCompare(b.key)),
      commonPrefixes: [...commonPrefixes].sort()
    };
  }

  async delete(uri: string): Promise<boolean> {
    if (!uri.startsWith("memory://")) return false;
    const key = uri.slice("memory://".length);
    return this._store.delete(key);
  }

  async stat(uri: string): Promise<StorageStat | null> {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const entry = this._store.get(key);
    if (!entry) return null;
    return {
      key,
      size: entry.data.byteLength,
      modifiedAt: entry.modifiedAt,
      ...(entry.contentType ? { contentType: entry.contentType } : {})
    };
  }
}
