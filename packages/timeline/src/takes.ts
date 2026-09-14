/**
 * Take switching, renaming and deletion — the shared logic behind the
 * `select_take`/`rename_take`/`delete_take` agent ops and the equivalent
 * `TimelineStore` actions (P0 AI Video, PRD § 8.10). A `ClipVersion` is a
 * take; `clip.versions` is the take list.
 */

import type { TimelineClip } from "./types.js";

/**
 * Make a stored take current on a clip. Mirrors `TimelineStore.restoreVersion`
 * so the browser store and the headless op run one rule for what switching a
 * take does — `currentAssetId`, `activeTakeId`, `paramOverrides`,
 * `lastGeneratedHash` and `status` — and, just as importantly, does not touch
 * anything else (position, duration, effects, animations, ...).
 *
 * A no-op (returns `clip` unchanged) for a missing take or one that did not
 * finish successfully, matching the existing `restoreVersion` guard.
 */
export function selectTake(clip: TimelineClip, takeId: string): TimelineClip {
  const version = (clip.versions ?? []).find((v) => v.id === takeId);
  if (!version || version.status !== "success") return clip;

  const restoredHash = version.dependencyHash;
  const status: TimelineClip["status"] =
    clip.dependencyHash === restoredHash ? "generated" : "stale";

  return {
    ...clip,
    currentAssetId: version.assetId,
    activeTakeId: version.id,
    paramOverrides: version.paramOverridesSnapshot,
    lastGeneratedHash: restoredHash,
    status
  };
}

/** Set a take's display label. A no-op for a take id not on this clip. */
export function renameTake(
  clip: TimelineClip,
  takeId: string,
  label: string
): TimelineClip {
  const versions = clip.versions ?? [];
  const index = versions.findIndex((v) => v.id === takeId);
  if (index === -1) return clip;
  const nextVersions = versions.slice();
  nextVersions[index] = { ...nextVersions[index]!, label };
  return { ...clip, versions: nextVersions };
}

export interface DeleteTakeResult {
  clip: TimelineClip;
  /** Set when the delete was refused; `clip` is then the input, unchanged. */
  error?: string;
}

/**
 * Remove a take from a clip's history.
 *
 * Refused (PRD § 8.10) when the take is the active one: deleting it would
 * either leave the clip with zero takes (the sole take), or leave it pointing
 * at an asset with no corresponding take record (one of several) — both read
 * as "explicitly unresolved" rather than a clip that silently keeps playing a
 * now-untracked asset. The caller must `select_take` a different take first.
 */
export function deleteTake(
  clip: TimelineClip,
  takeId: string
): DeleteTakeResult {
  const versions = clip.versions ?? [];
  const index = versions.findIndex((v) => v.id === takeId);
  if (index === -1) {
    return { clip, error: `No take "${takeId}" on this clip.` };
  }
  const version = versions[index]!;
  const isActive = clip.activeTakeId
    ? clip.activeTakeId === takeId
    : clip.currentAssetId !== undefined &&
      clip.currentAssetId === version.assetId;

  if (isActive) {
    if (versions.length === 1) {
      return {
        clip,
        error:
          "Cannot delete the only take on this clip while it has an active " +
          "asset — a clip must always keep at least one take."
      };
    }
    return {
      clip,
      error:
        "Cannot delete the active take while other takes exist — " +
        "select_take a different take first, then delete this one."
    };
  }

  return { clip: { ...clip, versions: versions.filter((v) => v.id !== takeId) } };
}
