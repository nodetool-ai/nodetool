/**
 * Take switching, renaming and deletion — the shared logic behind the
 * `select_take`/`rename_take`/`delete_take` agent ops and the equivalent
 * `TimelineStore` actions (P0 AI Video, PRD § 8.10). A `ClipVersion` is a
 * take; `clip.versions` is the take list.
 */

import type { ClipVersion, TimelineClip } from "./types.js";

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
 * Record the media already playing before the first generated alternative is
 * appended. Imported clips and older direct generations can have an active
 * asset without a corresponding `ClipVersion`; without this baseline, Use
 * take would make the original impossible to select again.
 */
export function preserveBaselineTake(
  clip: TimelineClip,
  recordedAt: string
): TimelineClip {
  const assetId = clip.currentAssetId;
  if (
    assetId === undefined ||
    (clip.versions ?? []).some((version) => version.assetId === assetId)
  ) {
    return clip;
  }

  const baseline: ClipVersion = {
    id: `baseline:${clip.id}:${assetId}`,
    createdAt: recordedAt,
    jobId: "",
    assetId,
    workflowUpdatedAt: recordedAt,
    dependencyHash: clip.lastGeneratedHash ?? clip.dependencyHash ?? "",
    paramOverridesSnapshot: { ...(clip.paramOverrides ?? {}) },
    status: "success",
    source: clip.sourceType
  };
  return { ...clip, versions: [...(clip.versions ?? []), baseline] };
}

export interface TakeSourceWindow {
  /** First source millisecond in the replacement asset. */
  readonly inPointMs: number;
  /** Source duration available in the replacement asset. */
  readonly sourceDurationMs: number;
  /** Amount of source media that must cover the unchanged timeline slot. */
  readonly playableDurationMs: number;
}

export type UseTakeResult =
  | { readonly ok: true; readonly clip: TimelineClip }
  | { readonly ok: false; readonly clip: TimelineClip; readonly error: string };

/**
 * Apply one take with an explicit source-time mapping.
 *
 * This is the persisted half of Use take. Candidate auditioning never calls
 * it. The cut stays where it is while invalid trims from the previous source
 * are replaced by the new asset's declared playable window.
 */
export function useTake(
  clip: TimelineClip,
  takeId: string,
  sourceWindow: TakeSourceWindow
): UseTakeResult {
  if (clip.mediaType === "model3d") {
    return {
      ok: false,
      clip,
      error: `Clip "${clip.name}" cannot use a video take.`
    };
  }
  const version = (clip.versions ?? []).find((item) => item.id === takeId);
  if (version === undefined) {
    return { ok: false, clip, error: `Take "${takeId}" is missing.` };
  }
  if (version.status !== "success") {
    return { ok: false, clip, error: `Take "${takeId}" is not ready.` };
  }

  const { inPointMs, playableDurationMs, sourceDurationMs } = sourceWindow;
  if (
    !Number.isFinite(inPointMs) ||
    !Number.isFinite(playableDurationMs) ||
    !Number.isFinite(sourceDurationMs) ||
    inPointMs < 0 ||
    playableDurationMs <= 0 ||
    sourceDurationMs <= 0
  ) {
    return { ok: false, clip, error: "Take timing must use positive finite milliseconds." };
  }
  if (playableDurationMs !== clip.durationMs) {
    return {
      ok: false,
      clip,
      error: `Take timing targets ${playableDurationMs}ms, but the clip is ${clip.durationMs}ms.`
    };
  }
  if (inPointMs + playableDurationMs > sourceDurationMs) {
    return {
      ok: false,
      clip,
      error: `Take "${takeId}" is shorter than the clip's playable window.`
    };
  }

  const selected = selectTake(clip, takeId);
  if (selected === clip) {
    return { ok: false, clip, error: `Take "${takeId}" could not be selected.` };
  }
  return {
    ok: true,
    clip: {
      ...selected,
      inPointMs,
      outPointMs: inPointMs + playableDurationMs
    }
  };
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
