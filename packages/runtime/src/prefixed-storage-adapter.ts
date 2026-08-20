import {
  normalizeStorageKey,
  type StorageAdapter,
  type StorageListResult,
  type StorageStat
} from "./context.js";

/**
 * A `StorageAdapter` that carves a key prefix out of another one.
 *
 * Cloud deployments keep one bucket. Giving each user a workspace inside it
 * means their keys have to be namespaced, and the namespacing has to be
 * invisible to whatever holds the adapter — a caller that stores `notes.md`
 * must read it back as `notes.md`, not as `workspaces/u1/notes.md`. Every key
 * going in gains the prefix and every key coming out loses it again.
 *
 * The prefix is applied to *keys*, never to URIs: a URI is opaque and already
 * carries the full key, so it passes through untouched.
 */
export class PrefixedStorageAdapter implements StorageAdapter {
  /** Normalized prefix with no trailing slash. */
  readonly prefix: string;

  constructor(
    private readonly inner: StorageAdapter,
    prefix: string
  ) {
    this.prefix = normalizeStorageKey(prefix);
  }

  private scope(key: string): string {
    return `${this.prefix}/${normalizeStorageKey(key)}`;
  }

  /** Strip the prefix from a key the inner adapter reported. */
  private unscope(key: string): string | null {
    const head = `${this.prefix}/`;
    return key.startsWith(head) ? key.slice(head.length) : null;
  }

  store(key: string, data: Uint8Array, contentType?: string): Promise<string> {
    return this.inner.store(this.scope(key), data, contentType);
  }

  retrieve(uri: string): Promise<Uint8Array | null> {
    return this.inner.retrieve(uri);
  }

  exists(uri: string): Promise<boolean> {
    return this.inner.exists(uri);
  }

  uriForKey(key: string): string {
    return this.inner.uriForKey(this.scope(key));
  }

  async list(
    prefix: string,
    opts: { delimiter?: string } = {}
  ): Promise<StorageListResult> {
    // An empty prefix means "everything in the workspace", which is the
    // adapter's own prefix rather than the bucket root.
    const scoped = prefix ? this.scope(prefix) : this.prefix;
    const result = await this.inner.list(scoped, opts);
    const head = `${this.prefix}/`;
    return {
      entries: result.entries.flatMap((entry) => {
        const key = this.unscope(entry.key);
        return key ? [{ ...entry, key }] : [];
      }),
      commonPrefixes: result.commonPrefixes.flatMap((p) =>
        p.startsWith(head) ? [p.slice(head.length)] : []
      )
    };
  }

  delete(uri: string): Promise<boolean> {
    return this.inner.delete(uri);
  }

  async stat(uri: string): Promise<StorageStat | null> {
    const st = await this.inner.stat(uri);
    if (!st) return null;
    const key = this.unscope(st.key);
    return key ? { ...st, key } : st;
  }

}
