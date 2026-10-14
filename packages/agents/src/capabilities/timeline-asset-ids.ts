/**
 * Canonical asset ids on a timeline document before it is stored.
 *
 * Sandbox code holds what the asset tools printed: `asset://<id>.<ext>`, often
 * with a 12-character id. The server-side frame resolver tolerates that form,
 * but the editor, the exporter and every later lookup key on the asset row's
 * id, so a stored clip must hold the full 32-character id. `package://` and
 * `http(s)://` locators are not asset ids and are kept as written.
 */

import {
  assetIdFromRef,
  isFullResourceId,
  isShortResourceId
} from "@nodetool-ai/protocol";
import { isRecord, isString } from "../utils/type-guards.js";

/** Looks up one of the caller's assets by full id or 12-character prefix. */
export type TimelineAssetFinder = (id: string) => Promise<{ id: string } | null>;

/**
 * `document` with every clip's `currentAssetId` and `versions[].assetId`
 * rewritten to the bare full asset id. A short id that matches no asset is
 * stored bare, which validation reports like any other missing asset. A short
 * id matching more than one asset is an error, never a guess.
 */
export async function canonicalizeTimelineAssetIds(
  document: Record<string, unknown>,
  find: TimelineAssetFinder
): Promise<{ document: Record<string, unknown> } | { error: string }> {
  const clips = document["clips"];
  if (!Array.isArray(clips)) return { document };

  const resolved = new Map<string, string>();
  const canonical = async (ref: string): Promise<string> => {
    const bare = assetIdFromRef(ref);
    if (bare.includes("://") || isFullResourceId(bare)) return bare;
    if (!isShortResourceId(bare)) return bare;
    const cached = resolved.get(bare);
    if (cached !== undefined) return cached;
    const asset = await find(bare);
    const id = asset?.id ?? bare;
    resolved.set(bare, id);
    return id;
  };

  let changed = false;
  const nextClips: unknown[] = [];
  try {
    for (const clip of clips) {
      if (!isRecord(clip)) {
        nextClips.push(clip);
        continue;
      }
      let next = clip;
      const current = clip["currentAssetId"];
      if (isString(current) && current) {
        const id = await canonical(current);
        if (id !== current) next = { ...next, currentAssetId: id };
      }
      const versions = clip["versions"];
      if (Array.isArray(versions)) {
        let versionsChanged = false;
        const nextVersions: unknown[] = [];
        for (const version of versions) {
          const assetId = isRecord(version) ? version["assetId"] : undefined;
          if (isRecord(version) && isString(assetId) && assetId) {
            const id = await canonical(assetId);
            if (id !== assetId) {
              versionsChanged = true;
              nextVersions.push({ ...version, assetId: id });
              continue;
            }
          }
          nextVersions.push(version);
        }
        if (versionsChanged) next = { ...next, versions: nextVersions };
      }
      if (next !== clip) changed = true;
      nextClips.push(next);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  return changed ? { document: { ...document, clips: nextClips } } : { document };
}

/** A finder scoped to `userId` through the asset model's prefix lookup. */
export function userAssetFinder(userId: string): TimelineAssetFinder {
  return async (id) => {
    const { Asset } = await import("@nodetool-ai/models");
    return Asset.find(userId, id);
  };
}
