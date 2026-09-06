/**
 * Re-slicing source-anchored custom curves when a clip's source window moves.
 *
 * A `timeBase: "source"` curve names absolute times in the media (`sourceMs`
 * is its stored truth, see `custom.ts`), so an edit that changes which stretch
 * of the media a clip shows must change which stretch of the curve it carries.
 * A clip-based curve is left alone: `t` is normalized over the window, and
 * stretching with the window is what it means.
 *
 * The slice keeps every keyframe inside the retained source window and puts an
 * interpolated keyframe on each new edge, so the retained motion is the motion
 * that was there before the edit. That is exact for a linear segment — which is
 * every segment of a custom animation that pins no easing, since the compiler's
 * default for `custom` is `linear` — and an approximation when a non-linear
 * segment is cut in half: the boundary lands on the curve, but the eased shape
 * of the remaining half cannot be re-parametrized into the easing grammar. A
 * cut that lands on an existing keyframe is exact for every easing.
 *
 * Pure; no DOM, GPU or store.
 */

import { ease } from "./easing.js";
import { CUSTOM_ANIMATION_PRESET_ID } from "./custom.js";
import type { ClipAnimation, CustomClipAnimation } from "./types.js";

type DocumentCurve = CustomClipAnimation["curves"][number];
type DocumentKeyframe = DocumentCurve["keyframes"][number];

/** Source milliseconds this close together are the same instant. */
const EPSILON_MS = 1e-6;

/**
 * True when `animation` is a custom animation whose curves are placed on the
 * media's clock — the only kind an edit re-slices.
 */
export function isSourceAnchoredAnimation(animation: ClipAnimation): boolean {
  return (
    animation.preset === CUSTOM_ANIMATION_PRESET_ID &&
    animation.custom?.timeBase === "source" &&
    (animation.custom?.curves.length ?? 0) > 0
  );
}

function sourceMsOf(keyframe: DocumentKeyframe): number | null {
  const value = keyframe.sourceMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The curve's value at `atMs`, by the same rule the sampler applies: held flat
 * outside the first and last keyframes, and the segment between two keyframes
 * eased by the LATER one's easing.
 */
function valueAtSourceMs(
  keyframes: readonly DocumentKeyframe[],
  times: readonly number[],
  atMs: number
): number {
  if (atMs <= times[0]) return keyframes[0].value;
  const lastIndex = keyframes.length - 1;
  if (atMs >= times[lastIndex]) return keyframes[lastIndex].value;
  for (let i = 1; i <= lastIndex; i++) {
    if (atMs > times[i]) continue;
    const span = times[i] - times[i - 1];
    const segT = span > 0 ? (atMs - times[i - 1]) / span : 0;
    const eased = ease(keyframes[i].easing ?? "linear", segT);
    return (
      keyframes[i - 1].value +
      (keyframes[i].value - keyframes[i - 1].value) * eased
    );
  }
  return keyframes[lastIndex].value;
}

/**
 * The easing of the segment `atMs` falls in — the easing of the keyframe that
 * ENDS it. A boundary keyframe inherits it so the retained part of a cut
 * segment keeps the shape it had (exactly, for a linear one).
 */
function easingCrossing(
  keyframes: readonly DocumentKeyframe[],
  times: readonly number[],
  atMs: number
): string | undefined {
  for (let i = 0; i < keyframes.length; i++) {
    if (times[i] >= atMs) return keyframes[i].easing;
  }
  return undefined;
}

/** Renormalize `t` over the sliced curve's own source span (the gate's rule). */
function withNormalizedT(keyframes: DocumentKeyframe[]): DocumentKeyframe[] {
  const firstMs = keyframes[0].sourceMs as number;
  const span = (keyframes[keyframes.length - 1].sourceMs as number) - firstMs;
  return keyframes.map((keyframe) => ({
    ...keyframe,
    t: span > 0 ? ((keyframe.sourceMs as number) - firstMs) / span : 0
  }));
}

/**
 * One curve restricted to the source window `fromMs..toMs`. A curve carrying a
 * keyframe with no `sourceMs` is returned untouched — the gate refuses it, and
 * guessing a time here would invent motion.
 */
function sliceCurve(
  curve: DocumentCurve,
  fromMs: number,
  toMs: number
): DocumentCurve {
  const keyframes = curve.keyframes;
  if (keyframes.length === 0) return curve;
  const times: number[] = [];
  for (const keyframe of keyframes) {
    const ms = sourceMsOf(keyframe);
    if (ms === null) return curve;
    times.push(ms);
  }

  const kept: DocumentKeyframe[] = [];
  for (let i = 0; i < keyframes.length; i++) {
    if (times[i] >= fromMs - EPSILON_MS && times[i] <= toMs + EPSILON_MS) {
      kept.push({ ...keyframes[i], sourceMs: times[i] });
    }
  }

  const sliced: DocumentKeyframe[] = [];
  const firstKeptMs = kept.length > 0 ? (kept[0].sourceMs as number) : null;
  if (firstKeptMs === null || firstKeptMs > fromMs + EPSILON_MS) {
    // The head boundary opens a segment, so it carries no easing of its own.
    sliced.push({
      t: 0,
      value: valueAtSourceMs(keyframes, times, fromMs),
      sourceMs: fromMs
    });
  }
  sliced.push(...kept);
  const lastKeptMs =
    kept.length > 0 ? (kept[kept.length - 1].sourceMs as number) : null;
  if (lastKeptMs === null || lastKeptMs < toMs - EPSILON_MS) {
    const easing = easingCrossing(keyframes, times, toMs);
    const boundary: DocumentKeyframe = {
      t: 1,
      value: valueAtSourceMs(keyframes, times, toMs),
      sourceMs: toMs
    };
    if (easing !== undefined) boundary.easing = easing;
    sliced.push(boundary);
  }

  return { ...curve, keyframes: withNormalizedT(sliced) };
}

/**
 * One source-anchored animation restricted to the source window
 * `fromMs..toMs` of a clip now `clipDurationMs` long.
 *
 * The window fields are rewritten as well as the curves: a source-anchored
 * animation is timed by its keyframes, so its window only has to cover the
 * clip — `delayMs` goes to 0 and (for every role but `"loop"`, where
 * `durationMs` is the cycle period) `durationMs` becomes the clip's. Without
 * that, an edit that lengthened the clip would leave the tail of it outside
 * the window and the curve unsampled there.
 */
export function sliceSourceAnimation(
  animation: ClipAnimation,
  fromMs: number,
  toMs: number,
  clipDurationMs: number
): ClipAnimation {
  const custom = animation.custom;
  if (!custom) return animation;
  const next: ClipAnimation = {
    ...animation,
    delayMs: 0,
    custom: {
      ...custom,
      curves: custom.curves.map((curve) => sliceCurve(curve, fromMs, toMs))
    }
  };
  if (animation.role !== "loop") {
    next.durationMs = Math.max(1, clipDurationMs);
  }
  return next;
}

/**
 * Re-slice every source-anchored animation in `animations` onto the source
 * window `fromMs..toMs`. Returns the same array when the clip carries none, so
 * an edit on a document without them allocates nothing and compares equal.
 */
export function resliceSourceAnimations(
  animations: ClipAnimation[],
  fromMs: number,
  toMs: number,
  clipDurationMs: number
): ClipAnimation[] {
  if (!animations.some(isSourceAnchoredAnimation)) return animations;
  return animations.map((animation) =>
    isSourceAnchoredAnimation(animation)
      ? sliceSourceAnimation(animation, fromMs, toMs, clipDurationMs)
      : animation
  );
}
