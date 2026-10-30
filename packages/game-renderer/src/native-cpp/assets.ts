import { nativeGame2dAsset } from "@nodetool-ai/protocol/native-game";
import type { NativeAssetBroker, NativeAssetEntry } from "./contracts.js";

export interface NativeAssetSourceOptions {
  readonly assets: readonly NativeAssetEntry[];
  readonly fetchBytes: (path: string, signal: AbortSignal) => Promise<Uint8Array>;
  readonly maxBytes?: number;
}

export function nativeAssetPath(path: string): string {
  if (!path || path.length > 4096 || /[\\?#:%]/u.test(path) || Array.from(path).some((character) => character.charCodeAt(0) < 32) || path.startsWith("/") ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Native assets require closed relative paths");
  }
  return `/assets/${path}`;
}

/** Only manifest entries reach the fetch seam. Decoding belongs to presentation. */
export function createNativeAssetBroker(options: NativeAssetSourceOptions): NativeAssetBroker {
  if (options.assets.length > 4096) { throw new Error("Native asset count exceeds budget"); }
  const manifest = options.assets.map((asset) => nativeGame2dAsset.parse(asset));
  const assets = new Map<string, NativeAssetEntry>();
  const paths = new Set<string>();
  let total = 0;
  for (const asset of manifest) {
    const path = nativeAssetPath(asset.path);
    if (assets.has(asset.id) || paths.has(path)) { throw new Error("Duplicate native asset ID or path"); }
    assets.set(asset.id, asset); paths.add(path); total += asset.size;
  }
  if (total > (options.maxBytes ?? 256 * 1024 * 1024)) { throw new Error("Native asset manifest exceeds byte budget"); }
  for (const asset of manifest) {
    for (const dependency of asset.dependencies) {
      if (!assets.has(dependency)) { throw new Error(`Missing native asset dependency ${dependency}`); }
    }
  }
  const controller = new AbortController();
  const cache = new Map<string, Promise<Uint8Array>>();
  const verified = new Map<string, Uint8Array>();
  let disposed = false;
  const get = async (id: string): Promise<Uint8Array> => {
      if (disposed) { throw new Error("Native asset source is disposed"); }
      const asset = assets.get(id);
      if (!asset) { throw new Error(`Undeclared native asset ${id}`); }
      let promise = cache.get(id);
      if (!promise) {
        promise = (async () => {
          const bytes = await options.fetchBytes(asset.path, controller.signal);
          if (disposed) { throw new Error("Native asset source is disposed"); }
          if (bytes.byteLength !== asset.size) { throw new Error(`Native asset size mismatch: ${id}`); }
          const owned = Uint8Array.from(bytes);
          const digest = await crypto.subtle.digest("SHA-256", owned);
          const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
          if (hex !== asset.digest) { throw new Error(`Native asset digest mismatch: ${id}`); }
          if (disposed) { throw new Error("Native asset source is disposed"); }
          if (cache.get(id) === promise) { verified.set(id, owned); }
          return owned;
        })();
        cache.set(id, promise);
      }
      return Uint8Array.from(await promise);
  };
  const entry = (id: string): NativeAssetEntry => {
    const result = assets.get(id);
    if (!result) { throw new Error(`Undeclared native asset ${id}`); }
    return result;
  };
  return {
    entries: manifest, entry, get, bytes: get,
    verifiedRange(id, offset, length) {
      if (disposed) { throw new Error("Native asset source is disposed"); }
      entry(id);
      const bytes = verified.get(id);
      if (!bytes) { throw new Error(`Native image source is not verified or has been released: ${id}`); }
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || offset > bytes.byteLength || length > bytes.byteLength - offset) {
        throw new Error("Native verified source range is invalid");
      }
      return bytes.slice(offset, offset + length);
    },
    dependencies(id) { return entry(id).dependencies.map(entry); },
    release(id) { cache.delete(id); verified.delete(id); },
    dispose() { disposed = true; controller.abort(); cache.clear(); verified.clear(); }
  };
}

