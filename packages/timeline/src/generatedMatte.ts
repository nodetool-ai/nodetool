/**
 * Generated mattes: a matte cut from a clip's own source and carried on that
 * clip (D2).
 *
 * The two-clip `ClipMatte` names another clip as the keyhole, so keeping the
 * two in step is the caller's problem: every trim, split and move has to move
 * both. A generated matte is an *attribute* of the source clip instead, so it
 * shares the in-point, the speed, the window and the time remap by
 * construction — `splitClip` and `trimClip` copy it across with the rest of the
 * clip and it stays aligned with no work of their own.
 *
 * What can go wrong is therefore not misalignment but staleness: the clip's
 * asset was regenerated under it, or its window now asks for source the
 * generation never covered. {@link isGeneratedMatteStale} is the one place that
 * is decided; the validator (`generated_matte_stale`) and the UI both ask it.
 *
 * Pure functions over one clip. Nothing here reads a document, an asset or a
 * clock.
 */

import { sourceRate } from "./sourceRate.js";
import { clipSourceMsAt, hasTimeRemap } from "./timeRemap.js";
import type { ClipGeneratedMatte, TimelineClip } from "./types.js";

/** One stored generation of a clip's matte. */
export type GeneratedMatteVersion = NonNullable<
  ClipGeneratedMatte["versions"]
>[number];

/**
 * A finished generation, as the job hands it back: the mask asset, the source
 * asset and interval it was cut from, and the knobs it ran with.
 */
export interface GeneratedMatteResult {
  assetId: string;
  sourceAssetId: string;
  sourceRange: { fromMs: number; toMs: number };
  settings: Record<string, number | string | boolean>;
  /** The job that produced it, recorded on the version it replaces. */
  jobId?: string;
  /** ISO timestamp stamped on the version this result displaces. */
  createdAt?: string;
}

/**
 * The fields a staleness check reads. Spelled out rather than taking a whole
 * {@link TimelineClip} so the validator can ask it of a document clip parsed by
 * the protocol schema, which is the same shape and a different declaration.
 */
export type GeneratedMatteClip = Pick<
  TimelineClip,
  | "generatedMatte"
  | "currentAssetId"
  | "startMs"
  | "durationMs"
  | "inPointMs"
  | "speedMultiplier"
  | "speedBaked"
  | "timeRemap"
>;

/** Floating-point slack on the window comparison, in source ms (sub-frame). */
const WINDOW_EPSILON_MS = 1;

/**
 * The source interval a clip currently shows, in source milliseconds.
 *
 * Without a remap that is the in-point plus the window at the clip's rate. With
 * one the curve names absolute source positions, so the interval is the range
 * the curve covers over the clip — its keyframes plus both ends, which is where
 * a monotone segment's extremes are.
 */
export function clipSourceWindowMs(clip: GeneratedMatteClip): {
  fromMs: number;
  toMs: number;
} {
  if (hasTimeRemap(clip)) {
    const ends = [
      clipSourceMsAt(clip, clip.startMs),
      clipSourceMsAt(clip, clip.startMs + clip.durationMs)
    ];
    for (const kf of clip.timeRemap?.keyframes ?? []) {
      if (kf.t < 0 || kf.t > 1) continue;
      ends.push(Math.max(0, kf.sourceMs));
    }
    return { fromMs: Math.min(...ends), toMs: Math.max(...ends) };
  }
  const fromMs = Math.max(0, clip.inPointMs ?? 0);
  return { fromMs, toMs: fromMs + clip.durationMs * sourceRate(clip) };
}

/**
 * True when the clip's generated matte no longer describes what the clip
 * shows: the source asset was replaced under it, or the window now reaches
 * source the generation never covered.
 *
 * False for a clip with no generated matte at all — there is nothing to be
 * stale — so a caller can ask it of any clip.
 */
export function isGeneratedMatteStale(clip: GeneratedMatteClip): boolean {
  const matte = clip.generatedMatte;
  if (!matte) return false;
  if (matte.sourceAssetId !== clip.currentAssetId) return true;
  const window = clipSourceWindowMs(clip);
  return (
    window.fromMs < matte.sourceRange.fromMs - WINDOW_EPSILON_MS ||
    window.toMs > matte.sourceRange.toMs + WINDOW_EPSILON_MS
  );
}

/**
 * The clip with a finished generation as its matte, the one it replaces pushed
 * onto `versions` newest first — so a regenerate the user dislikes is one
 * {@link selectGeneratedMatteVersion} away from being undone.
 *
 * A result identical to what is already current still records a version: the
 * two runs are distinct events, and the version list is the audit of them.
 */
export function applyGeneratedMatteResult(
  clip: TimelineClip,
  result: GeneratedMatteResult
): TimelineClip {
  const previous = clip.generatedMatte;
  const versions: GeneratedMatteVersion[] = [];
  if (previous) {
    const displaced: GeneratedMatteVersion = {
      assetId: previous.assetId,
      sourceAssetId: previous.sourceAssetId,
      createdAt: result.createdAt ?? new Date().toISOString(),
      settings: previous.settings
    };
    if (result.jobId !== undefined) displaced.jobId = result.jobId;
    versions.push(displaced, ...(previous.versions ?? []));
  }
  const generatedMatte: ClipGeneratedMatte = {
    assetId: result.assetId,
    sourceAssetId: result.sourceAssetId,
    sourceRange: { ...result.sourceRange },
    settings: { ...result.settings },
    status: "ready"
  };
  // The look knobs are the user's, not the generation's: a regenerate at a new
  // resolution keeps the invert, strength and feather they dialled in.
  if (previous?.invert !== undefined) generatedMatte.invert = previous.invert;
  if (previous?.strength !== undefined) {
    generatedMatte.strength = previous.strength;
  }
  if (previous?.featherPx !== undefined) {
    generatedMatte.featherPx = previous.featherPx;
  }
  if (versions.length > 0) generatedMatte.versions = versions;
  return { ...clip, generatedMatte };
}

/**
 * The clip with a stored version made current, the displaced one taking its
 * place in the list. Returns the clip unchanged when it has no generated matte,
 * when the asset is already current, or when no version carries it — selecting
 * a version that is not there is a no-op, not an error, because the list is
 * pruned by whoever owns the assets.
 */
export function selectGeneratedMatteVersion(
  clip: TimelineClip,
  assetId: string
): TimelineClip {
  const matte = clip.generatedMatte;
  if (!matte || matte.assetId === assetId) return clip;
  const versions = matte.versions ?? [];
  const index = versions.findIndex((v) => v.assetId === assetId);
  if (index === -1) return clip;
  const chosen = versions[index]!;
  const displaced: GeneratedMatteVersion = {
    assetId: matte.assetId,
    sourceAssetId: matte.sourceAssetId,
    createdAt: chosen.createdAt,
    settings: matte.settings
  };
  const rest = [...versions];
  rest.splice(index, 1, displaced);
  return {
    ...clip,
    generatedMatte: {
      ...matte,
      assetId: chosen.assetId,
      sourceAssetId: chosen.sourceAssetId,
      settings: { ...chosen.settings },
      status: "ready",
      versions: rest
    }
  };
}

/** The clip with its generated matte removed, versions and all. */
export function clearGeneratedMatte(clip: TimelineClip): TimelineClip {
  if (!clip.generatedMatte) return clip;
  const { generatedMatte: _dropped, ...rest } = clip;
  return rest;
}
