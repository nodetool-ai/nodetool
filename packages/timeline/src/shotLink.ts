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
 * The blockout of a shot: the `model3d` clip stamped with the shot's board and
 * shot ids. Its grey render is the reference video a take of the shot is
 * generated from. {@link clipsFollowingShot} leaves it out, so selecting a
 * take never replaces the set with footage. The earliest clip wins when
 * several carry the same shot.
 */
export function blockoutClipForShot(
  clips: readonly TimelineClip[],
  boardId: string,
  shotId: string
): TimelineClip | undefined {
  let found: TimelineClip | undefined;
  for (const clip of clips) {
    if (
      clip.mediaType === "model3d" &&
      clip.storyboardBoardId === boardId &&
      clip.storyboardShotId === shotId &&
      (!found || clip.startMs < found.startMs)
    ) {
      found = clip;
    }
  }
  return found;
}

/**
 * The `model3d` clips a shot's clip can take as its blockout: the ones that
 * share any stretch of time with it, earliest first. A clip already linked to
 * another shot is left out.
 */
export function blockoutCandidatesForClip(
  clips: readonly TimelineClip[],
  shotClip: Pick<
    TimelineClip,
    "startMs" | "durationMs" | "storyboardBoardId" | "storyboardShotId"
  >
): TimelineClip[] {
  const start = shotClip.startMs;
  const end = shotClip.startMs + shotClip.durationMs;
  return clips
    .filter((clip) => {
      if (clip.mediaType !== "model3d") return false;
      if (clip.startMs >= end || clip.startMs + clip.durationMs <= start) {
        return false;
      }
      const linkedElsewhere =
        !!clip.storyboardShotId &&
        (clip.storyboardBoardId !== shotClip.storyboardBoardId ||
          clip.storyboardShotId !== shotClip.storyboardShotId);
      return !linkedElsewhere;
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * The shot clips a `model3d` clip can become the blockout of: the video clips
 * that play a shot's take and share any stretch of time with it, earliest
 * first, one per shot.
 */
export function shotClipCandidatesForBlockout(
  clips: readonly TimelineClip[],
  blockoutClip: Pick<TimelineClip, "startMs" | "durationMs">
): TimelineClip[] {
  const start = blockoutClip.startMs;
  const end = blockoutClip.startMs + blockoutClip.durationMs;
  const seen = new Set<string>();
  return clips
    .filter(
      (clip) =>
        clip.mediaType === "video" &&
        !!clip.storyboardBoardId &&
        !!clip.storyboardShotId &&
        !clip.scriptLineId &&
        clip.startMs < end &&
        clip.startMs + clip.durationMs > start
    )
    .sort((a, b) => a.startMs - b.startMs)
    .filter((clip) => {
      const key = `${clip.storyboardBoardId} ${clip.storyboardShotId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** One clip's change in a blockout link edit. */
export interface BlockoutLinkPatch {
  clipId: string;
  patch: Pick<TimelineClip, "storyboardBoardId" | "storyboardShotId">;
}

/**
 * The clip patches that make `blockoutClipId` the one blockout of a shot, or
 * that unlink it when `shot` is null. A shot has one blockout, so any other
 * `model3d` clip stamped with the same shot is unlinked in the same edit.
 * Returns nothing when the clip is missing or is not a `model3d` clip.
 */
export function blockoutLinkPatches(
  clips: readonly TimelineClip[],
  blockoutClipId: string,
  shot: { boardId: string; shotId: string } | null
): BlockoutLinkPatch[] {
  const target = clips.find((clip) => clip.id === blockoutClipId);
  if (!target || target.mediaType !== "model3d") return [];
  const unlink = { storyboardBoardId: undefined, storyboardShotId: undefined };
  if (!shot) {
    return target.storyboardShotId || target.storyboardBoardId
      ? [{ clipId: target.id, patch: unlink }]
      : [];
  }
  const patches: BlockoutLinkPatch[] = [];
  for (const clip of clips) {
    if (
      clip.id !== target.id &&
      clip.mediaType === "model3d" &&
      clip.storyboardBoardId === shot.boardId &&
      clip.storyboardShotId === shot.shotId
    ) {
      patches.push({ clipId: clip.id, patch: unlink });
    }
  }
  if (
    target.storyboardBoardId !== shot.boardId ||
    target.storyboardShotId !== shot.shotId
  ) {
    patches.push({
      clipId: target.id,
      patch: { storyboardBoardId: shot.boardId, storyboardShotId: shot.shotId }
    });
  }
  return patches;
}

/**
 * Put a shot's newly selected take on a clip that follows the shot.
 *
 * The clip keeps its place and length. Its source window stays where it was
 * when the take is long enough to hold it; a shorter take slides the window
 * back so it ends on the take's last frame, and a take shorter than the
 * window itself shortens the clip to the whole take. An unknown take length
 * leaves the window alone. A remap stays intact when its absolute source
 * keyframes fit the take. Otherwise it is cleared and the linear window is fitted.
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
  const keyframes = clip.timeRemap?.keyframes ?? [];
  if (keyframes.length > 0) {
    if (keyframes.every(({ sourceMs }) => sourceMs >= 0 && sourceMs <= takeMs)) {
      return next;
    }
    // Incompatible remaps fall back to the clip's rate-based window.
    delete next.timeRemap;
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
