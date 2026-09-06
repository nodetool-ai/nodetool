/**
 * The evaluated sample list a `model3d` clip's Blender bake is rendered from
 * (design §D6, producer).
 *
 * A bake is the clip's picture, clip-local: frame `i` is what the live layer
 * draws at `clip.startMs + 1000 * i / fps`. Blender's own frame range cannot
 * express that — a trimmed, sped-up, reversed or looped clip is not a run of
 * consecutive scene frames — so the timeline hands the job one model time and
 * one camera per output frame instead, computed with the same functions the
 * live layer uses.
 */

import type { ClipModel3DCamera, TimelineClip } from "../types.js";
import { resolveModel3DCamera } from "../model3d.js";
import { clipSourceTimeSec, resolveAnimatedLayerProps } from "./sceneModel.js";
import type { Model3DBakeSequence } from "../model3dBake.js";

/**
 * One animation's length, as `animationDurations` in `@nodetool-ai/model3d`
 * reads it off the glTF. Declared structurally: this package parses no glTF.
 */
export interface Model3DBakeAnimationDuration {
  name: string;
  durationSec: number;
}

/** What the bake job renders: one model time and one camera per output frame. */
export interface Model3DBakeSamples {
  /** Model time in seconds, one entry per output frame. */
  frameTimes: number[];
  /** The camera each of those frames is rendered through. */
  cameras: ClipModel3DCamera[];
}

/**
 * The length the clip's model time is wrapped or clamped against: the named
 * animation's, or the longest of all of them when the style names none (the
 * D2 default, where every animation plays). Zero when the model has none.
 */
export function model3dBakeAnimationLength(
  clipName: string | undefined,
  durations: readonly Model3DBakeAnimationDuration[]
): number {
  if (clipName === undefined) {
    return durations.reduce((longest, d) => Math.max(longest, d.durationSec), 0);
  }
  return durations.find((d) => d.name === clipName)?.durationSec ?? 0;
}

/** Wrap into `[0, length)` with `loop` on, hold the last frame with it off. */
function foldModelTime(time: number, length: number, loop: boolean): number {
  if (!(length > 0)) return 0;
  if (!loop) return Math.min(Math.max(time, 0), length);
  return ((time % length) + length) % length;
}

/**
 * Sample the clip across its own duration at the sequence's fps.
 *
 * The model time of frame `i` is `clipSourceTimeSec` at that frame — in point,
 * speed and time remap already applied — times `animation.speed`, then folded
 * by `animation.loop` against the selected animation's length. A reversed remap
 * is therefore a decreasing list and a loop past the end wraps inside it, so
 * Blender needs nothing beyond setting the frame it is handed.
 */
export function computeModel3DBakeSamples(
  clip: TimelineClip,
  sequence: Model3DBakeSequence,
  durations: readonly Model3DBakeAnimationDuration[]
): Model3DBakeSamples {
  const style = clip.model3dStyle;
  if (!style) {
    throw new Error(
      `Clip "${clip.name}" has no model3dStyle, so there is no camera, ` +
        `lighting or animation to bake.`
    );
  }
  const fps = Math.max(1, sequence.fps);
  const frameCount = Math.max(1, Math.round((clip.durationMs / 1000) * fps));
  // Animations are authored against the sequence's own resolution, so that is
  // the space the camera curves are sampled in — the same canvas the preview
  // hands `resolveAnimatedLayerProps`.
  const canvas = {
    width: Math.max(1, sequence.width),
    height: Math.max(1, sequence.height)
  };
  const length = model3dBakeAnimationLength(style.animation.clipName, durations);

  const frameTimes: number[] = [];
  const cameras: ClipModel3DCamera[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const timeMs = clip.startMs + (1000 * i) / fps;
    const modelTime = clipSourceTimeSec(clip, timeMs) * style.animation.speed;
    frameTimes.push(foldModelTime(modelTime, length, style.animation.loop));
    cameras.push(
      resolveModel3DCamera(
        style,
        resolveAnimatedLayerProps({ clip, opacity: 1 }, timeMs, canvas)
      )
    );
  }
  return { frameTimes, cameras };
}
