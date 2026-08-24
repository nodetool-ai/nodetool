/**
 * Asset byte resolution for the export surfaces — the workflow `.nodetool`
 * bundle and the storyboard zip. Kept out of `http-api.ts` (which pulls in
 * `@nodetool-ai/dsl` → `base-nodes` at module load) so a route or a test can
 * reach it on its own.
 */

import nodePath from "node:path";
import { Asset } from "@nodetool-ai/models";
import { safeFetch } from "@nodetool-ai/runtime";
import { getAssetAdapter } from "./storage.js";
import { retrieveAssetBytes } from "./asset-paths.js";

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

/** Resolve asset bytes for a ref during export, via the asset storage adapter. */
export async function resolveAssetBytesForExport(
  ref: string
): Promise<Uint8Array | null> {
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
          const bytes = await retrieveAssetBytes(
            adapter,
            asset.user_id,
            asset.id,
            asset.content_type
          );
          if (bytes) return bytes;
        }
        // No row (or no bytes under either candidate): an older graph can
        // still name an object that only exists under the flat key.
        return await adapter.retrieve(adapter.uriForKey(rest));
      }
      return await adapter.retrieve(adapter.uriForKey(rest));
    }
    if (ref.includes("/api/storage/")) {
      const key = decodeURIComponent(
        ref
          .slice(ref.indexOf("/api/storage/") + "/api/storage/".length)
          .split("?")[0]
      );
      const adapter = getAssetAdapter();
      return await adapter.retrieve(adapter.uriForKey(key));
    }
    if (/^https?:\/\//.test(ref)) {
      const res = await safeFetch(ref);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    // Unresolved — the ref is left as-is in the bundle.
  }
  return null;
}
