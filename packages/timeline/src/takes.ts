/**
 * Take switching, renaming and deletion — the shared logic behind the
 * `select_take`/`rename_take`/`delete_take` agent ops and the equivalent
 * `TimelineStore` actions (P0 AI Video, PRD § 8.10). A `ClipVersion` is a
 * take; `clip.versions` is the take list.
 */

import { makeClipVersion } from "./defaults.js";
import type { TimelineClip } from "./types.js";

/**
 * The take actually playing, derived rather than trusted from the stored
 * alias. `activeTakeId` is a convenience field several asset writers besides
 * `selectTake` can set `currentAssetId` without updating (direct generation,
 * imports, agent ops) — `currentAssetId` is the field every renderer and
 * export path actually reads, so a version whose `assetId` matches it is the
 * active take even when `activeTakeId` still names an older one. Falls back
 * to the stored alias only when no version's `assetId` matches at all (e.g.
 * the current asset isn't a recorded take, or a 3D clip's bake history).
 */
export function activeTakeIdOf(clip: TimelineClip): string | undefined {
  const versions = clip.versions ?? [];
  if (clip.currentAssetId !== undefined) {
    const match = versions.find((v) => v.assetId === clip.currentAssetId);
    if (match) return match.id;
  }
  return clip.activeTakeId;
}

/**
 * Record the clip's accepted asset as a take before an edit is submitted.
 * Imported clips commonly have no version history, so the first candidate
 * would otherwise have no explicit Original take to audition against.
 */
export function ensureBaselineTake(
  clip: TimelineClip,
  createdAt = new Date().toISOString()
): TimelineClip {
  const assetId = clip.currentAssetId;
  if (!assetId || (clip.versions ?? []).some((take) => take.assetId === assetId)) {
    return clip;
  }

  const baseline = makeClipVersion({
    id: `${clip.id}:baseline:${assetId}`,
    createdAt,
    workflowUpdatedAt: createdAt,
    assetId,
    dependencyHash: clip.dependencyHash ?? "",
    paramOverridesSnapshot: { ...(clip.paramOverrides ?? {}) },
    durationMs: clip.durationMs,
    source: clip.sourceType === "imported" ? "imported" : "generated",
    sourceMapping: {
      ...(clip.inPointMs !== undefined && { inPointMs: clip.inPointMs }),
      ...(clip.outPointMs !== undefined && { outPointMs: clip.outPointMs }),
      ...(clip.speedMultiplier !== undefined && {
        speedMultiplier: clip.speedMultiplier
      }),
      ...(clip.speedBaked !== undefined && { speedBaked: clip.speedBaked })
    }
  });
  return {
    ...clip,
    versions: [...(clip.versions ?? []), baseline],
    activeTakeId: baseline.id
  };
}

/** Return a preview-only clip projection for a successful take. */
export function previewTake(
  clip: TimelineClip,
  takeId: string
): TimelineClip | null {
  const take = (clip.versions ?? []).find(
    (candidate) => candidate.id === takeId && candidate.status === "success"
  );
  if (!take) return null;
  if (!take.mediaEdit) {
    return { ...clip, currentAssetId: take.assetId };
  }
  return {
    ...clip,
    currentAssetId: take.assetId,
    // Generated edit results represent the selected source window from zero.
    inPointMs: 0,
    outPointMs: take.durationMs ?? clip.durationMs,
    speedMultiplier: 1,
    speedBaked: true,
    timeRemap: undefined
  };
}

export interface ApplyTakeResult {
  clip: TimelineClip;
  error?: string;
}

/**
 * Apply a successful take while preserving the editorial shape of its clip.
 *
 * Video-edit results are rendered from the submitted source window, so their
 * source clock starts at zero. The result may be longer than the cut, but the
 * cut keeps its existing duration and uses the remainder as handles. A result
 * that cannot cover the cut is refused before the caller writes the document.
 */
export function applyTakeToClip(
  clip: TimelineClip,
  takeId: string
): ApplyTakeResult {
  if (clip.mediaType === "model3d") {
    return {
      clip,
      error:
        `Clip "${clip.name}" is a 3D clip — take application is not available.`
    };
  }

  const version = (clip.versions ?? []).find((take) => take.id === takeId);
  if (!version) {
    return { clip, error: `No take "${takeId}" on "${clip.name}".` };
  }
  if (version.status !== "success") {
    return {
      clip,
      error:
        `Take "${takeId}" on "${clip.name}" did not finish successfully.`
    };
  }

  if (clip.mediaType === "video") {
    const resultDurationMs = version.durationMs;
    if (
      resultDurationMs === undefined ||
      !Number.isFinite(resultDurationMs) ||
      resultDurationMs < clip.durationMs
    ) {
      return {
        clip,
        error:
          `Take "${takeId}" is shorter than the current ${clip.durationMs}ms cut.`
      };
    }
  }

  const selected = selectTake(clip, takeId);
  if (selected === clip) {
    return { clip, error: `Take "${takeId}" cannot be applied.` };
  }
  if (!version.mediaEdit) return { clip: selected };

  const applied: TimelineClip = { ...selected };
  applied.inPointMs = 0;
  applied.outPointMs = clip.durationMs;
  applied.speedMultiplier = 1;
  applied.speedBaked = true;
  delete applied.timeRemap;
  return { clip: applied };
}

/**
 * Make a stored take current on a clip. Mirrors `TimelineStore.restoreVersion`
 * so the browser store and the headless op run one rule for what switching a
 * take does — `currentAssetId`, `activeTakeId`, `paramOverrides`,
 * `lastGeneratedHash` and `status` — and, just as importantly, does not touch
 * anything else (position, duration, effects, animations, ...).
 *
 * A no-op (returns `clip` unchanged) for a missing take, one that did not
 * finish successfully, or a `model3d` clip — matching the existing
 * `restoreVersion` guard. `ClipVersion` also carries `bake_model3d_clip`'s
 * render history for a 3D clip: the baked movie lives in `versions` while
 * `currentAssetId` deliberately stays the glTF `model3dStyle` renders from
 * (`ops/apply.ts`'s `bake_model3d_clip` case never touches it). Generic take
 * selection has no bake-aware path, so applying it here would overwrite the
 * glTF with a rendered video and leave `model3dStyle.bake` pointing at a
 * dependency hash the clip no longer matches. Bake-history selection needs
 * its own op; this one refuses model3d clips until it exists.
 */
export function selectTake(clip: TimelineClip, takeId: string): TimelineClip {
  if (clip.mediaType === "model3d") return clip;
  const version = (clip.versions ?? []).find((v) => v.id === takeId);
  if (!version || version.status !== "success") return clip;

  const restoredHash = version.dependencyHash;
  const status: TimelineClip["status"] =
    clip.dependencyHash === restoredHash ? "generated" : "stale";
  const mapped = version.sourceMapping;

  const next: TimelineClip = {
    ...clip,
    currentAssetId: version.assetId,
    activeTakeId: version.id,
    paramOverrides: version.paramOverridesSnapshot,
    lastGeneratedHash: restoredHash,
    status
  };
  if (mapped) {
    next.inPointMs = mapped.inPointMs;
    next.outPointMs = mapped.outPointMs;
    next.speedMultiplier = mapped.speedMultiplier;
    next.speedBaked = mapped.speedBaked;
  }
  if (version.mediaEdit) {
    next.inPointMs = 0;
    next.outPointMs = version.durationMs ?? clip.durationMs;
    next.speedMultiplier = 1;
    next.speedBaked = true;
    delete next.timeRemap;
  }
  return next;
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
  const isActive = activeTakeIdOf(clip) === takeId;

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
