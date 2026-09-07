import { resliceSourceAnimations } from "./animation/sourceCurves.js";
import { sourceRate } from "./sourceRate.js";
import { assertNotTimeRemapped } from "./timeRemap.js";
import type { TimelineClip } from "./types.js";

/**
 * Move one edge of a clip.
 *
 * Animations ride along untouched — a clip-based curve is normalized over the
 * window, so a trim stretches its keyframes with the clip. The exception is a
 * source-anchored custom animation (`custom.timeBase: "source"`), whose
 * keyframes name times in the media: those curves are re-sliced onto the
 * retained source window so the motion the trim kept is the motion that was
 * there (`animation/sourceCurves.ts`).
 */
export function trimClip(
  clip: TimelineClip,
  edge: "start" | "end",
  deltaMs: number,
  maxDurationMs?: number
): TimelineClip {
  // A remap is a curve over this clip's window; moving an edge renormalizes it
  // and retimes every frame, including the ones the trim did not touch (D13).
  assertNotTimeRemapped(clip, "trimClip");

  const rate = sourceRate(clip);
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs * rate;

  // `deltaMs` is a timeline delta; the source in/out points it reveals or hides
  // move by `deltaMs * rate` source-ms.
  const sourceDeltaMs = deltaMs * rate;
  const nextStartMs = edge === "start" ? clip.startMs - deltaMs : clip.startMs;
  const nextDurationMs = clip.durationMs + deltaMs;
  const nextInPointMs = edge === "start" ? inPointMs - sourceDeltaMs : inPointMs;
  const nextOutPointMs = edge === "end" ? outPointMs + sourceDeltaMs : outPointMs;

  if (nextDurationMs <= 0) {
    throw new Error("trimClip would result in a non-positive duration");
  }

  if (nextInPointMs < 0) {
    throw new Error("trimClip cannot extend before source start");
  }

  if (nextStartMs < 0) {
    throw new Error("trimClip cannot start before zero on the timeline");
  }

  if (maxDurationMs !== undefined && nextOutPointMs > maxDurationMs) {
    throw new Error("trimClip cannot extend beyond source out-point");
  }

  const next: TimelineClip = {
    ...clip,
    startMs: nextStartMs,
    durationMs: nextDurationMs,
    inPointMs: nextInPointMs,
    outPointMs: nextOutPointMs
  };
  if (clip.animations) {
    next.animations = resliceSourceAnimations(
      clip.animations,
      nextInPointMs,
      nextOutPointMs,
      nextDurationMs
    );
  }
  return next;
}
