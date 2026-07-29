/**
 * Sampler. Folds a clip's `CompiledAnimation[]` into a single `AnimationSample`
 * at a clip-local time. Offsets and rotation add; scale and opacity multiply;
 * overlapping wipe masks keep the smaller progress (more hidden wins).
 * Order-independent across animations (the fold is commutative).
 *
 * Pure; supports an optional scratch `out` object so the render loop allocates
 * nothing in the steady state.
 */

import { ease } from "./easing.js";
import {
  staggerUnitDelayMs,
  type CompiledAnimation,
  type CompiledStagger,
  type Keyframe,
  type PropertyCurve
} from "./compile.js";
import type { WipeDirection } from "./types.js";

/**
 * Resolved wipe mask at a point in time. Absent from a sample means unmasked.
 * The mask lives in the layer's own normalized quad space, so the wipe edge
 * rotates with the layer.
 */
export interface AnimationSampleMask {
  /** Edge the reveal starts from (see {@link WipeDirection}). */
  direction: WipeDirection;
  /** 0 = fully hidden, 1 = fully revealed. */
  progress: number;
  /** Feathered edge width as a fraction of the wipe axis (0 = hard edge). */
  softness: number;
}

export interface AnimationSample {
  /** px, add to transform.position.x */
  offsetX: number;
  /** px, add to transform.position.y */
  offsetY: number;
  /** multiply transform.scale.x and .y */
  scale: number;
  /** radians, add to transform.rotation */
  rotation: number;
  /** 0..1, multiply layer opacity */
  opacity: number;
  /** source px, add to the layer's blur radius (identity 0) */
  blur: number;
  /** -1..1, add to the color grade's brightness term (identity 0) */
  brightness: number;
  /** 0..4, multiply the color grade's saturation (identity 1) */
  saturation: number;
  /** Wipe mask, when one is active. Absent (undefined) means unmasked. */
  mask?: AnimationSampleMask;
}

export const IDENTITY_SAMPLE: Readonly<AnimationSample> = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blur: 0,
  brightness: 0,
  saturation: 1
});

function resetIdentity(s: AnimationSample): AnimationSample {
  s.offsetX = 0;
  s.offsetY = 0;
  s.scale = 1;
  s.rotation = 0;
  s.opacity = 1;
  s.blur = 0;
  s.brightness = 0;
  s.saturation = 1;
  s.mask = undefined;
  return s;
}

/** Evaluate a curve at normalized `t` (keyframes sorted, first t=0, last t=1). */
function evalCurve(curve: PropertyCurve, t: number): number {
  const kfs = curve.keyframes;
  if (kfs.length === 0) return 0;
  if (t <= kfs[0].t) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 1; i < kfs.length; i++) {
    const b: Keyframe = kfs[i];
    if (t <= b.t) {
      const a = kfs[i - 1];
      const span = b.t - a.t;
      const segT = span > 0 ? (t - a.t) / span : 0;
      const eased = ease(b.easing ?? "linear", segT);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

/**
 * Resolve the normalized `t` for one animation at `localMs`, or `null` when the
 * animation contributes identity (outside its window with no hold).
 */
function windowT(anim: CompiledAnimation, localMs: number): number | null {
  if (anim.loop) {
    const period = anim.periodMs ?? anim.windowEndMs - anim.windowStartMs;
    if (period <= 0) return null;
    if (localMs < anim.windowStartMs || localMs >= anim.windowEndMs) return null;
    return ((localMs - anim.windowStartMs) % period) / period;
  }
  if (localMs < anim.windowStartMs) {
    return anim.holdBefore ? 0 : null;
  }
  if (localMs > anim.windowEndMs) {
    return anim.holdAfter ? 1 : null;
  }
  const span = anim.windowEndMs - anim.windowStartMs;
  return span > 0 ? (localMs - anim.windowStartMs) / span : 0;
}

/**
 * Which of an animation's curves a fold pass applies. A staggered animation is
 * split across two passes: the block-level sampler folds its effect/mask
 * curves over the full span (`"effects"`), the per-word sampler folds its
 * transform/opacity curves at the word's own time (`"motion"`).
 */
type FoldMode = "all" | "motion" | "effects";

function foldAnimation(
  anim: CompiledAnimation,
  t: number,
  acc: AnimationSample,
  mode: FoldMode = "all"
): void {
  for (const curve of anim.curves) {
    switch (curve.property) {
      case "offsetX":
      case "offsetY":
      case "rotation":
      case "scale":
      case "opacity":
        if (mode === "effects") continue;
        break;
      default:
        if (mode === "motion") continue;
        break;
    }
    const value = evalCurve(curve, t);
    switch (curve.property) {
      case "offsetX":
        acc.offsetX += value;
        break;
      case "offsetY":
        acc.offsetY += value;
        break;
      case "rotation":
        acc.rotation += value;
        break;
      case "scale":
        acc.scale *= value;
        break;
      case "opacity":
        acc.opacity *= value;
        break;
      // Effect folds mirror how the compositor's effect pre-pass aggregates:
      // blur radii and the grade's brightness term ADD across effects, so
      // concurrent animations add too; saturation is a MULTIPLIER, so it
      // multiplies. Ranges are clamped once at the end of sampleAnimations.
      case "blur":
        acc.blur += value;
        break;
      case "brightness":
        acc.brightness += value;
        break;
      case "saturation":
        acc.saturation *= value;
        break;
      case "wipeProgress": {
        // Mask fold rule: when several wipes overlap (an in and an out on a
        // short clip), the sample with the SMALLER progress wins — more hidden
        // wins, so the layer never pops back to visible mid-overlap. A fully
        // revealed wipe (progress >= 1) contributes nothing: the layer is
        // unmasked and the compositor pays no mask cost.
        const config = anim.mask;
        if (!config) break;
        const progress = value < 0 ? 0 : value;
        if (progress >= 1) break;
        if (!acc.mask || progress < acc.mask.progress) {
          acc.mask = {
            direction: config.direction,
            progress,
            softness: config.softness
          };
        }
        break;
      }
    }
  }
}

/**
 * Fold all compiled animations at `localMs` into one sample. Pass `out` to
 * reuse a scratch object (it is reset before writing).
 */
export function sampleAnimations(
  compiled: CompiledAnimation[],
  localMs: number,
  out?: AnimationSample
): AnimationSample {
  const acc = resetIdentity(
    out ?? {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      blur: 0,
      brightness: 0,
      saturation: 1
    }
  );
  for (const anim of compiled) {
    const t = windowT(anim, localMs);
    if (t === null) continue;
    // A staggered animation's transform/opacity curves run per word (see
    // `sampleStaggeredAnimations`); only its effect/mask curves apply at the
    // block level, over the full stagger span.
    foldAnimation(anim, t, acc, anim.stagger ? "effects" : "all");
  }
  return clampSample(acc);
}

function clampSample(acc: AnimationSample): AnimationSample {
  // Overshoot easings can push these past their natural range.
  if (acc.opacity < 0) acc.opacity = 0;
  else if (acc.opacity > 1) acc.opacity = 1;
  if (acc.scale < 0) acc.scale = 0;
  // Clamp effect values to the ranges the grade/blur pipeline accepts.
  if (acc.blur < 0) acc.blur = 0;
  if (acc.brightness < -1) acc.brightness = -1;
  else if (acc.brightness > 1) acc.brightness = 1;
  if (acc.saturation < 0) acc.saturation = 0;
  else if (acc.saturation > 4) acc.saturation = 4;
  return acc;
}

/** True when any compiled animation carries a per-unit stagger. */
export function hasStaggeredAnimation(compiled: CompiledAnimation[]): boolean {
  return compiled.some((anim) => anim.stagger !== undefined);
}

/**
 * Resolve the normalized `t` for `unitIndex` of a staggered animation at
 * `localMs`, or `null` when the unit contributes identity. Mirrors
 * {@link windowT} with the unit's own window: shifted by the unit's delay and
 * `unitDurationMs` long (a pure phase shift for loops).
 */
function staggerUnitT(
  anim: CompiledAnimation,
  stagger: CompiledStagger,
  localMs: number,
  unitIndex: number
): number | null {
  const delay = staggerUnitDelayMs(stagger, unitIndex);
  if (anim.loop) {
    const period = anim.periodMs ?? anim.windowEndMs - anim.windowStartMs;
    if (period <= 0) return null;
    if (localMs < anim.windowStartMs || localMs >= anim.windowEndMs) return null;
    const phase = localMs - anim.windowStartMs - delay;
    return (((phase % period) + period) % period) / period;
  }
  const startMs = anim.windowStartMs + delay;
  const endMs = startMs + stagger.unitDurationMs;
  if (localMs < startMs) return anim.holdBefore ? 0 : null;
  if (localMs > endMs) return anim.holdAfter ? 1 : null;
  const span = endMs - startMs;
  return span > 0 ? (localMs - startMs) / span : 0;
}

/**
 * Fold the staggered animations' transform/opacity curves for one unit (word)
 * at `localMs`. Un-staggered animations are skipped — they already applied at
 * the block level — as are effect/mask curves (block-level in v1). Pass `out`
 * to reuse a scratch object.
 */
export function sampleStaggeredAnimations(
  compiled: CompiledAnimation[],
  localMs: number,
  unitIndex: number,
  out?: AnimationSample
): AnimationSample {
  const acc = resetIdentity(
    out ?? {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      blur: 0,
      brightness: 0,
      saturation: 1
    }
  );
  for (const anim of compiled) {
    if (!anim.stagger) continue;
    const t = staggerUnitT(anim, anim.stagger, localMs, unitIndex);
    if (t === null) continue;
    foldAnimation(anim, t, acc, "motion");
  }
  return clampSample(acc);
}

/** True when any compiled animation is inside an actively-animating window. */
export function hasActiveAnimationWindow(
  compiled: CompiledAnimation[],
  localMs: number
): boolean {
  for (const anim of compiled) {
    if (anim.loop) {
      if (localMs >= anim.windowStartMs && localMs < anim.windowEndMs) return true;
    } else if (localMs >= anim.windowStartMs && localMs <= anim.windowEndMs) {
      return true;
    }
  }
  return false;
}
