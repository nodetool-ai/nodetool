/**
 * Bare asset ids on clips entering the editor.
 *
 * Sandbox-authored timelines stored what the asset tools print,
 * `asset://<id>.<ext>`, while every loader here keys on the asset row's id.
 * The server now stores the canonical id, but documents saved before that
 * still hold the URI form. A 12-character prefix stays as it is: the asset
 * endpoint resolves it.
 */

import { assetIdFromRef } from "@nodetool-ai/protocol";
import type { TimelineClip } from "@nodetool-ai/timeline";

const bareRef = (ref: string): string =>
  ref ? assetIdFromRef(ref) : ref;

/** `clips` with `currentAssetId` and `versions[].assetId` as bare ids. */
export function normalizeClipAssetRefs(clips: TimelineClip[]): TimelineClip[] {
  let changed = false;
  const next = clips.map((clip) => {
    let out = clip;
    if (typeof clip.currentAssetId === "string") {
      const id = bareRef(clip.currentAssetId);
      if (id !== clip.currentAssetId) {
        out = { ...out, currentAssetId: id };
      }
    }
    if (Array.isArray(clip.versions)) {
      let versionsChanged = false;
      const versions = clip.versions.map((version) => {
        const id = bareRef(version.assetId);
        if (id === version.assetId) {
          return version;
        }
        versionsChanged = true;
        return { ...version, assetId: id };
      });
      if (versionsChanged) {
        out = { ...out, versions };
      }
    }
    if (out !== clip) {
      changed = true;
    }
    return out;
  });
  return changed ? next : clips;
}
