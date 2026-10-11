import { resliceSourceAnimations } from "./animation/sourceCurves.js";
import { sourceRate } from "./sourceRate.js";
import { assertNotTimeRemapped } from "./timeRemap.js";
import type { TimelineClip } from "./types.js";

const SOURCE_BOUND_TOLERANCE_MS = 0.000001;

/**
 * A caption's words with their clip-local times mapped through
 * `local * scale + offsetMs`. Words are timed against the clip's start, so an
 * edit that moves the media under that start (a head trim, a slip, a speed
 * change) has to move the words with it or they highlight off the audio.
 */
export function retimeCaption(
  caption: NonNullable<TimelineClip["caption"]>,
  offsetMs: number,
  scale = 1
): NonNullable<TimelineClip["caption"]> {
  if (offsetMs === 0 && scale === 1) return caption;
  return {
    ...caption,
    words: caption.words.map((word) => ({
      ...word,
      startMs: word.startMs * scale + offsetMs,
      endMs: word.endMs * scale + offsetMs
    }))
  };
}

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
const NO_SOURCE_CLOCK: ReadonlySet<TimelineClip["mediaType"]> = new Set([
  "image",
  "text",
  "shape",
  "adjustment",
  "group"
]);

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
  const rawInPointMs =
    edge === "start" ? inPointMs - sourceDeltaMs : inPointMs;
  // A clip with no source clock (a still, text, shape, adjustment or group)
  // has nothing before its in-point to run out of: extending its head keeps
  // the in-point at 0 and moves the out-point to keep the window's length.
  const headOverhangMs =
    rawInPointMs < 0 && NO_SOURCE_CLOCK.has(clip.mediaType) ? -rawInPointMs : 0;
  const nextInPointMs = rawInPointMs + headOverhangMs;
  const calculatedOutPointMs =
    (edge === "end" ? outPointMs + sourceDeltaMs : outPointMs) + headOverhangMs;
  const nextOutPointMs =
    maxDurationMs !== undefined &&
    calculatedOutPointMs > maxDurationMs &&
    calculatedOutPointMs - maxDurationMs <= SOURCE_BOUND_TOLERANCE_MS
      ? maxDurationMs
      : calculatedOutPointMs;

  if (nextDurationMs <= 0) {
    throw new Error("trimClip would result in a non-positive duration");
  }

  if (nextInPointMs < 0) {
    throw new Error("trimClip cannot extend before source start");
  }

  if (nextStartMs < 0) {
    throw new Error("trimClip cannot start before zero on the timeline");
  }

  if (
    maxDurationMs !== undefined &&
    sourceDeltaMs > 0 &&
    nextOutPointMs > maxDurationMs
  ) {
    throw new Error("trimClip cannot extend beyond source out-point");
  }

  const next: TimelineClip = {
    ...clip,
    startMs: nextStartMs,
    durationMs: nextDurationMs,
    inPointMs: nextInPointMs,
    outPointMs: nextOutPointMs
  };
  // A head trim moves the clip's start over still media, so each word keeps
  // its timeline instant: its clip-local time grows by what the head gained.
  // Words that fall outside the window stay stored and are not shown.
  if (clip.caption && edge === "start") {
    next.caption = retimeCaption(clip.caption, clip.startMs - nextStartMs);
  }
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
