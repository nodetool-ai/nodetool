/**
 * Asset resolution for the export surfaces — the timeline and storyboard zips
 * and the workflow `.nodetool` bundle. Kept out of `http-api.ts` (which pulls
 * in `@nodetool-ai/dsl` → `base-nodes` at module load) so a route or a test can
 * reach it on its own.
 *
 * The zips stream: {@link resolveExportSource} answers a local file (a managed
 * asset under the local store, or an external asset in place) by path, and
 * only a backend with no local file hands over bytes. The workflow bundle
 * rewrites graph refs from bytes and still reads them whole through
 * {@link resolveAssetBytesForExport}.
 */

import { readFile, stat } from "node:fs/promises";
import nodePath from "node:path";
import { Asset } from "@nodetool-ai/models";
import { safeFetch } from "@nodetool-ai/runtime";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { getAssetAdapter } from "./storage.js";
import { localAssetPath, retrieveAssetBytes } from "./asset-paths.js";
import { isLocalFileSource, type ExportSource } from "./zip-stream.js";

/**
 * The asset id in an `asset://` locator, or null when the locator names a
 * storage key instead. `asset://<id>` and `asset://<id>.<ext>` are both ids —
 * `persistOutput` writes the suffixed form so a renderer can type the media —
 * while anything carrying a slash is already owner-prefixed.
 */
function assetIdOf(rest: string): string | null {
  if (rest === "" || rest.includes("/")) return null;
  const ext = nodePath.extname(rest);
  return ext ? rest.slice(0, -ext.length) : rest;
}

/** The fields that locate an asset's bytes. */
export interface ExportableAsset {
  user_id: string;
  id: string;
  content_type: string;
}

async function fileSource(path: string): Promise<ExportSource> {
  return { path, size: (await stat(path)).size };
}

/**
 * An asset's local file, read in place, or its stored bytes on a backend with
 * no local file. Null when neither exists (including an offline external
 * asset).
 */
export async function resolveAssetExportSource(
  asset: ExportableAsset
): Promise<ExportSource | null> {
  const adapter = getAssetAdapter();
  const path = await localAssetPath(
    adapter,
    asset.user_id,
    asset.id,
    asset.content_type
  );
  if (path) return fileSource(path);
  return retrieveAssetBytes(
    adapter,
    asset.user_id,
    asset.id,
    asset.content_type
  );
}

/** The object under a storage key, as a local file when there is one. */
async function keyExportSource(
  adapter: StorageAdapter,
  key: string
): Promise<ExportSource | null> {
  const uri = adapter.uriForKey(key);
  const path = await adapter.localPath(uri);
  if (path) return fileSource(path);
  return adapter.retrieve(uri);
}

/**
 * Resolve an export ref (`asset://`, `/api/storage/`, or a remote URL) to a
 * local file or bytes. Null when it cannot be resolved; the caller reports
 * it as missing.
 */
export async function resolveExportSource(
  ref: string
): Promise<ExportSource | null> {
  try {
    if (ref.startsWith("asset://")) {
      const rest = ref.slice("asset://".length).split("?")[0].split("#")[0];
      const adapter = getAssetAdapter();
      const assetId = assetIdOf(rest);
      if (assetId) {
        // The row carries the owner, and the bytes live under
        // `<user_id>/<id>.<ext>` on every backend written since the per-owner
        // layout. Reading the suffixed ref as a flat key skipped that prefix
        // and found nothing on S3/Supabase, where no flat object exists.
        const asset = (await Asset.get(assetId)) as Asset | null;
        if (asset) {
          const source = await resolveAssetExportSource(asset);
          if (source) return source;
        }
        // No row (or no bytes under either candidate): an older graph can
        // still name an object that only exists under the flat key.
        return await keyExportSource(adapter, rest);
      }
      return await keyExportSource(adapter, rest);
    }
    if (ref.includes("/api/storage/")) {
      const key = decodeURIComponent(
        ref
          .slice(ref.indexOf("/api/storage/") + "/api/storage/".length)
          .split("?")[0]
      );
      return await keyExportSource(getAssetAdapter(), key);
    }
    if (/^https?:\/\//.test(ref)) {
      const res = await safeFetch(ref);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    // Unresolved — the caller reports the ref as missing.
  }
  return null;
}

/** Resolve a ref to bytes in memory, for the workflow bundle's graph rewrite. */
export async function resolveAssetBytesForExport(
  ref: string
): Promise<Uint8Array | null> {
  const source = await resolveExportSource(ref);
  if (!source || !isLocalFileSource(source)) return source;
  try {
    return new Uint8Array(await readFile(source.path));
  } catch {
    return null;
  }
}
