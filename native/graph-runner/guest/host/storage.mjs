// @nodetool-ai/storage for the guest: the storage adapters the guest context
// uses. InMemoryStorageAdapter is the run's temp store, as in the
// TypeScript reference (packages/storage/src/memory-storage-adapter.ts).
// HostAssetStorage is the asset store on the `assets` host capability
// (src/host/assets.cpp), addressed as `/api/storage/<key>` like the
// server's FileStorageAdapter. Key rules come from the real package.
import { compareStorageKeys, normalizeStorageKey } from "guest-real:@nodetool-ai/storage/storage-keys";

export { normalizeStorageKey, joinStorageKey } from "guest-real:@nodetool-ai/storage/storage-keys";

function listResult(stored, prefix, opts, uriFor) {
  const delimiter = opts?.delimiter ?? null;
  let normalizedPrefix = "";
  if (prefix && prefix !== "" && prefix !== "/") {
    try {
      normalizedPrefix = normalizeStorageKey(prefix);
    } catch {
      return { entries: [], commonPrefixes: [] };
    }
  }
  const matchPrefix = normalizedPrefix ? `${normalizedPrefix}/` : "";
  const entries = [];
  const commonPrefixes = new Set();
  for (const { key, size, modifiedAt, contentType } of stored) {
    if (matchPrefix && !key.startsWith(matchPrefix) && key !== normalizedPrefix) continue;
    if (matchPrefix === "" || key.startsWith(matchPrefix)) {
      const rest = matchPrefix ? key.slice(matchPrefix.length) : key;
      if (delimiter === "/") {
        const idx = rest.indexOf("/");
        if (idx >= 0) {
          commonPrefixes.add(`${matchPrefix}${rest.slice(0, idx + 1)}`);
          continue;
        }
      }
      const listed = { key, uri: uriFor(key), size, modifiedAt };
      if (contentType) listed.contentType = contentType;
      entries.push(listed);
    }
  }
  return {
    entries: entries.sort((a, b) => compareStorageKeys(a.key, b.key)),
    commonPrefixes: [...commonPrefixes].sort()
  };
}

export class InMemoryStorageAdapter {
  constructor() {
    this._store = new Map();
  }

  async store(key, data, contentType) {
    const normalized = normalizeStorageKey(key);
    this._store.set(normalized, { data: new Uint8Array(data), contentType, modifiedAt: Date.now() });
    return `memory://${normalized}`;
  }

  async retrieve(uri) {
    const key=uri.startsWith("memory://") ? uri.slice("memory://".length) : uri.startsWith("/api/storage/") ? keyFromUri(uri) : null;
    if(key===null)return null;
    const value = this._store.get(key);
    return value ? new Uint8Array(value.data) : null;
  }

  async exists(uri) {
    const key=uri.startsWith("memory://")?uri.slice("memory://".length):uri.startsWith("/api/storage/")?keyFromUri(uri):null;
    return key!==null && this._store.has(key);
  }

  uriForKey(key) {
    return `memory://${normalizeStorageKey(key)}`;
  }

  async list(prefix, opts = {}) {
    const stored = [...this._store.entries()].map(([key, e]) => ({
      key,
      size: e.data.byteLength,
      modifiedAt: e.modifiedAt,
      contentType: e.contentType
    }));
    return listResult(stored, prefix, opts, (key) => `memory://${key}`);
  }

  async delete(uri) {
    if (!uri.startsWith("memory://")) return false;
    return this._store.delete(uri.slice("memory://".length));
  }

  async stat(uri) {
    if (!uri.startsWith("memory://")) return null;
    const key = uri.slice("memory://".length);
    const entry = this._store.get(key);
    if (!entry) return null;
    const stat = { key, size: entry.data.byteLength, modifiedAt: entry.modifiedAt };
    if (entry.contentType) stat.contentType = entry.contentType;
    return stat;
  }

  async localPath() {
    return null;
  }
}

const assets = () => globalThis.__host?.assets;
// During a run the adapter uses the host's asynchronous functions, which run
// on the I/O lane. Writes and removals then commit in call order through the
// process destination queue. Outside a run it uses the synchronous ones.
const bound = () => !!assets()?.bound?.();

/** The key a `/api/storage/<key>` URI (or an http URL to one) names, or null. */
function keyFromUri(uri) {
  let path = null;
  if (uri.startsWith("/api/storage/") || uri.startsWith("api/storage/")) {
    path = uri.replace(/^\/?api\/storage\//, "");
  } else {
    const m = /^https?:\/\/[^/]+\/api\/storage\/(.*)$/.exec(uri);
    if (m) path = m[1];
  }
  if (path === null) return null;
  const cut = path.search(/[?#]/);
  if (cut >= 0) path = path.slice(0, cut);
  try {
    path = decodeURIComponent(path);
  } catch {
    // a malformed escape stays as it is
  }
  try {
    return normalizeStorageKey(path);
  } catch {
    return null;
  }
}

/** The host's stat JSON of `key`. */
async function statText(key) {
  return bound() ? await assets().statAsync(key) : assets().stat(key);
}

/** The asset store the embedder granted (HostOptions::assetDir), or null. */
export function hostAssetStorage() {
  return assets()?.available() ? new HostAssetStorage() : null;
}

export class HostAssetStorage {
  async store(key, data) {
    const normalized = normalizeStorageKey(key);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bound()) await assets().writeAsync(normalized, bytes);
    else assets().write(normalized, bytes);
    return this.uriForKey(normalized);
  }

  async retrieve(uri) {
    const key = keyFromUri(uri);
    if (!key) return null;
    return bound() ? await assets().readAsync(key) : assets().read(key);
  }

  async exists(uri) {
    const key = keyFromUri(uri);
    return key ? JSON.parse(await statText(key)) !== null : false;
  }

  uriForKey(key) {
    return `/api/storage/${normalizeStorageKey(key)}`;
  }

  async list(prefix, opts = {}) {
    let normalized = "";
    if (prefix && prefix !== "/") {
      try {
        normalized = normalizeStorageKey(prefix);
      } catch {
        return { entries: [], commonPrefixes: [] };
      }
    }
    // The host lists every file below a directory key, as the in-memory
    // adapter matches `<prefix>/`. A prefix that is no directory lists nothing.
    const listed = bound() ? await assets().listAsync(normalized) : assets().list(normalized);
    const stored = JSON.parse(listed).map((e) => ({ key: e.key, size: e.size, modifiedAt: e.mtimeMs }));
    return listResult(stored, normalized, opts, (key) => this.uriForKey(key));
  }

  /** Keys of the files directly in `dir` named `<stem>.<ext>`, sorted. */
  findStem(dir, stem) {
    let normalized = "";
    if (dir) {
      try {
        normalized = normalizeStorageKey(dir);
      } catch {
        return [];
      }
    }
    return JSON.parse(assets().find(normalized, String(stem)));
  }

  async delete(uri) {
    const key = keyFromUri(uri);
    if (!key) return false;
    return bound() ? await assets().removeAsync(key) : assets().remove(key);
  }

  async stat(uri) {
    const key = keyFromUri(uri);
    if (!key) return null;
    const st = JSON.parse(await statText(key));
    return st ? { key, size: st.size, modifiedAt: st.mtimeMs } : null;
  }

  async localPath() {
    return null;
  }
}
