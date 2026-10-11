/**
 * `storage.*` IO spans around a run's asset storage adapter.
 *
 * Object stores already show their requests as `HTTP <method>` spans. The
 * local file store does its IO on disk, so without these spans a slow asset
 * save or load is invisible. The span names the call; it never carries a key,
 * a URI or the bytes.
 */

import type { StorageAdapter } from "@nodetool-ai/storage";
import { withTaskSpan } from "./tracing-helpers.js";

const traced = new WeakSet<StorageAdapter>();

/**
 * Trace `store`, `retrieve`, `delete` and `list` on `adapter` itself, once.
 * Hosts share one adapter between runs, so the methods are replaced on the
 * instance: identity and `instanceof` checks keep working, and the spans are
 * no-ops while telemetry is off.
 */
export function traceStorageAdapter(adapter: StorageAdapter | null): StorageAdapter | null {
  if (!adapter || traced.has(adapter)) { return adapter; }
  traced.add(adapter);
  const backend = { "nodetool.storage.backend": adapter.constructor.name };
  const store = adapter.store.bind(adapter);
  const retrieve = adapter.retrieve.bind(adapter);
  const remove = adapter.delete.bind(adapter);
  const list = adapter.list.bind(adapter);
  adapter.store = (key, data, contentType) =>
    withTaskSpan("io", "storage.store", { ...backend, "nodetool.storage.bytes": data.byteLength }, () =>
      store(key, data, contentType)
    );
  adapter.retrieve = (uri) =>
    withTaskSpan("io", "storage.retrieve", backend, async (span) => {
      const bytes = await retrieve(uri);
      span?.setAttribute("nodetool.storage.bytes", bytes?.byteLength ?? 0);
      return bytes;
    });
  adapter.delete = (uri) => withTaskSpan("io", "storage.delete", backend, () => remove(uri));
  adapter.list = (prefix, opts) =>
    withTaskSpan("io", "storage.list", backend, async (span) => {
      const result = await list(prefix, opts);
      span?.setAttribute("nodetool.storage.entry_count", result.entries.length);
      return result;
    });
  return adapter;
}
