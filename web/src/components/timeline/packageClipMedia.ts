/**
 * A clip's `currentAssetId` is usually an asset id, but a shipped example
 * timeline names its stills as `package://<pkg>/<path>` so the reference
 * resolves for every user without a per-user asset row. Those have no row to
 * look up: asking the AssetStore for one answers "Asset not found" and the
 * preview gives up on the clip. They resolve statically instead.
 */

import { isPackageAssetUri } from "@nodetool-ai/protocol";

import {
  resolveStaticMediaUri,
  type ResolvedMediaUrl
} from "../../utils/resolveMediaUri";

/** The media URL of a `package://` clip reference, or null for anything else. */
export function packageClipMediaUrl(
  assetId: string | null | undefined
): ResolvedMediaUrl | null {
  if (!assetId || !isPackageAssetUri(assetId)) {
    return null;
  }
  return resolveStaticMediaUri(assetId) || null;
}
