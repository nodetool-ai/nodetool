/**
 * Timeline clips linked to storyboard shots.
 *
 * A clip carrying `storyboardBoardId`/`storyboardShotId` plays its shot's
 * selected take. The shot owns the take list (`Shot.clip_versions`) and the
 * selection (`Shot.clip`); the cut follows the selection. These helpers are
 * the editing math behind that: which clips follow a shot, what a clip looks
 * like after its shot's take changes, and where to sample reference frames
 * for a shot derived from a clip.
 */

import { sourceRate } from "./sourceRate.js";
import { clipSourceMsAt } from "./timeRemap.js";
import type { TimelineClip } from "./types.js";

/** A shot take as the cut sees it: the asset, and its length when known. */
export interface ShotTakeMedia {
  assetId: string;
  /** Length of the take's media in milliseconds. */
  durationMs?: number;
}

/** Most reference frames a derived shot samples from one clip. */
export const MAX_DERIVED_FRAMES = 8;

/**
 * The clips in a cut that play a shot's take: the video clip and its audio
 * twin. A voiceover clip stamped with the same shot plays a script take
 * instead, so it carries a `scriptLineId` and is left out.
 */
export function clipsFollowingShot(
  clips: readonly TimelineClip[],
  boardId: string,
  shotId: string
): TimelineClip[] {
  return clips.filter(
    (clip) =>
      clip.storyboardBoardId === boardId &&
      clip.storyboardShotId === shotId &&
      !clip.scriptLineId &&
      (clip.mediaType === "video" || clip.mediaType === "audio")
  );
}

/**
 * Put a shot's newly selected take on a clip that follows the shot.
 *
 * The clip keeps its place and length. Its source window stays where it was
 * when the take is long enough to hold it; a shorter take slides the window
 * back so it ends on the take's last frame, and a take shorter than the
 * window itself shortens the clip to the whole take. An unknown take length
 * leaves the window alone.
 *
 * Returns `clip` unchanged for a locked clip, a clip that is not video or
 * audio, and a clip already playing the asset.
 */
export function applyShotTakeToClip(
  clip: TimelineClip,
  take: ShotTakeMedia
): TimelineClip {
  if (clip.locked) return clip;
  if (clip.mediaType !== "video" && clip.mediaType !== "audio") return clip;
  if (!take.assetId || clip.currentAssetId === take.assetId) return clip;

  const next: TimelineClip = {
    ...clip,
    currentAssetId: take.assetId,
    status: "generated"
  };
  const recorded = (clip.versions ?? []).find(
    (version) => version.assetId === take.assetId
  );
  if (recorded) {
    next.activeTakeId = recorded.id;
  } else {
    delete next.activeTakeId;
  }

  const takeMs = take.durationMs;
  if (takeMs === undefined || !Number.isFinite(takeMs) || takeMs <= 0) {
    return next;
  }
  const rate = sourceRate(clip);
  const spanMs = clip.durationMs * rate;
  const inPointMs = clip.inPointMs ?? 0;
  if (inPointMs + spanMs <= takeMs) {
    return next;
  }
  // A curve names source times in the old footage; it cannot be carried onto
  // a window that moved.
  delete next.timeRemap;
  if (spanMs <= takeMs) {
    next.inPointMs = takeMs - spanMs;
    next.outPointMs = takeMs;
    return next;
  }
  next.inPointMs = 0;
  next.outPointMs = takeMs;
  next.durationMs = Math.max(1, Math.floor(takeMs / rate));
  return next;
}

/**
 * The source times, in milliseconds, of `count` reference frames spread over
 * what a clip shows: one at the middle of each of `count` equal slices of the
 * clip, mapped through its speed and time remap the way the compositor seeks
 * the video. Sampling slice middles keeps clear of the first and last frames,
 * which can decode black.
 */
export function derivedFrameTimesMs(
  clip: Pick<
    TimelineClip,
    | "timeRemap"
    | "startMs"
    | "durationMs"
    | "inPointMs"
    | "speedMultiplier"
    | "speedBaked"
  >,
  count: number
): number[] {
  const frames = Math.min(
    MAX_DERIVED_FRAMES,
    Math.max(1, Math.floor(Number.isFinite(count) ? count : 1))
  );
  const sliceMs = clip.durationMs / frames;
  return Array.from({ length: frames }, (_, i) =>
    Math.round(clipSourceMsAt(clip, clip.startMs + (i + 0.5) * sliceMs))
  );
}
