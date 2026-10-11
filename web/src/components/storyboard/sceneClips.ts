/**
 * sceneClips — what the board shows about its scene clips.
 *
 * A scene clip is a run of 2 to 5 consecutive shots in one scene rendered as
 * one clip (`SceneClipDirection`). These helpers are pure: the scene header
 * reads a clip's status and label, the card reads its part of a clip, and the
 * dialog reads the run a new scene clip starts with.
 */

import {
  SCENE_CLIP_MAX_SHOTS,
  SCENE_CLIP_MIN_SHOTS,
  oneTakeSteps,
  oneTakeWindow,
  sceneClipRun
} from "@nodetool-ai/protocol";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";

/**
 * - `planned`: saved, not rendered yet (or a shot's clip replaced it);
 * - `rendering`: the run's first shot is rendering its clip;
 * - `rendered`: the first shot holds a clip and every other shot is covered
 *   by it;
 * - `broken`: the run no longer resolves (a shot was deleted or moved).
 */
export type SceneClipStatus = "planned" | "rendering" | "rendered" | "broken";

export const sceneClipStatus = (
  shots: readonly Shot[],
  clip: SceneClipDirection
): SceneClipStatus => {
  const run = sceneClipRun(shots, clip.shot_ids);
  if (run.issue) {
    return "broken";
  }
  const [owner, ...rest] = run.shots;
  if (owner.status === "clip_generating") {
    return "rendering";
  }
  return owner.clip &&
    !owner.covered_by &&
    rest.every((shot) => shot.covered_by?.shot_id === owner.id)
    ? "rendered"
    : "planned";
};

export const SCENE_CLIP_STATUS_LABELS: Record<SceneClipStatus, string> = {
  planned: "not rendered",
  rendering: "rendering",
  rendered: "rendered",
  broken: "needs fixing"
};

/** One shot's place in a scene clip, for its card. */
export interface SceneClipPart {
  clipId: string;
  /** 1-based position in the run. */
  position: number;
  count: number;
  /** The shot's window on the clip, as `0-4s`. */
  window: string;
}

/** Each shot in a resolvable scene clip, keyed by shot id. */
export const sceneClipParts = (
  shots: readonly Shot[],
  clips: readonly SceneClipDirection[]
): Map<string, SceneClipPart> => {
  const parts = new Map<string, SceneClipPart>();
  for (const clip of clips) {
    const run = sceneClipRun(shots, clip.shot_ids);
    if (run.issue) {
      continue;
    }
    oneTakeSteps(run.shots, clip.duration_seconds).forEach((step, index) => {
      parts.set(step.shot_id, {
        clipId: clip.id,
        position: index + 1,
        count: run.shots.length,
        window: oneTakeWindow(step.start_seconds, step.end_seconds)
      });
    });
  }
  return parts;
};

/** The scene clips holding a shot of this scene, in board order. */
export const sceneClipsInGroup = (
  groupShots: readonly Shot[],
  clips: readonly SceneClipDirection[]
): SceneClipDirection[] => {
  const position = new Map(groupShots.map((shot, index) => [shot.id, index]));
  return clips
    .filter((clip) => clip.shot_ids.some((id) => position.has(id)))
    .sort(
      (a, b) =>
        Math.min(...a.shot_ids.map((id) => position.get(id) ?? Infinity)) -
        Math.min(...b.shot_ids.map((id) => position.get(id) ?? Infinity))
    );
};

/**
 * The run a new scene clip in this scene starts with: the first shots no
 * scene clip holds yet, up to five, else the scene's first five. Empty when
 * the scene has fewer than two shots.
 */
export const newSceneClipShotIds = (
  groupShots: readonly Shot[],
  clips: readonly SceneClipDirection[]
): string[] => {
  if (groupShots.length < SCENE_CLIP_MIN_SHOTS) {
    return [];
  }
  const taken = new Set(clips.flatMap((clip) => clip.shot_ids));
  let run: Shot[] = [];
  for (const shot of groupShots) {
    if (taken.has(shot.id)) {
      if (run.length >= SCENE_CLIP_MIN_SHOTS) {
        break;
      }
      run = [];
      continue;
    }
    run.push(shot);
    if (run.length === SCENE_CLIP_MAX_SHOTS) {
      break;
    }
  }
  const picked =
    run.length >= SCENE_CLIP_MIN_SHOTS
      ? run
      : groupShots.slice(0, SCENE_CLIP_MAX_SHOTS);
  return picked.map((shot) => shot.id);
};

/** `Shots 2–4`, numbered within the scene as the cards are. */
export const sceneClipRangeLabel = (
  groupShots: readonly Shot[],
  clip: SceneClipDirection
): string => {
  const numbers = clip.shot_ids
    .map((id) => groupShots.findIndex((shot) => shot.id === id))
    .filter((index) => index >= 0)
    .map((index) => index + 1)
    .sort((a, b) => a - b);
  if (numbers.length === 0) {
    return "Scene clip";
  }
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last ? `Shot ${first}` : `Shots ${first}–${last}`;
};
