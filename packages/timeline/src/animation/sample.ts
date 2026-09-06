/**
 * Sampler. Folds a clip's `CompiledAnimation[]` into a single `AnimationSample`
 * at a clip-local time.
 *
 * How several animations driving one channel combine is declared per channel in
 * `ANIMATED_PROPERTY_FOLD` (I3), not decided here: offsets and additive grade
 * terms add, scale/opacity/multiplicative grade terms multiply, overlapping
 * wipes keep the smaller progress (more hidden wins), and `replace` channels
 * take the last enabled animation in document order. Only that last kind reads
 * order, and it records which animation won in `replacedBy` so a validator can
 * warn about two replace curves overlapping in time.
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
import {
  ANIMATED_PROPERTY_FOLD,
  ANIMATED_PROPERTY_PASS,
  type AnimatedProperty,
  type WipeDirection
} from "./types.js";

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

/**
 * Channels that set an absolute value instead of composing with the clip's.
 * Mirrors the `"replace"` entries of {@link ANIMATED_PROPERTY_FOLD}; the fold
 * reads the table, this union types the fields it writes.
 */
export type ReplaceChannel =
  | "positionX"
  | "positionY"
  | "anchorX"
  | "anchorY"
  | "trimStart"
  | "trimEnd";

/**
 * Channels that fold arithmetically. Every one is a field of the same name on
 * {@link AnimationSample}, so the fold takes its operator from the table and
 * writes through the channel name.
 */
type ArithmeticChannel = Exclude<
  AnimatedProperty,
  ReplaceChannel | "wipeProgress"
>;

export interface AnimationSample {
  /** px, add to transform.position.x */
  offsetX: number;
  /** px, add to transform.position.y */
  offsetY: number;
  /** multiply transform.scale.x and .y */
  scale: number;
  /** multiply transform.scale.x */
  scaleX: number;
  /** multiply transform.scale.y */
  scaleY: number;
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
  /** 0..4, multiply the color grade's contrast (identity 1) */
  contrast: number;
  /** degrees, add to the color grade's hue rotation; wraps to -180..180 */
  hue: number;
  /** -1..1, add to the grade's cool→warm term (identity 0) */
  temperature: number;
  /** -1..1, add to the grade's green→magenta term (identity 0) */
  tint: number;
  /** canvas px, replaces transform.position.x. Absent = clip's own value. */
  positionX?: number;
  /** canvas px, replaces transform.position.y. Absent = clip's own value. */
  positionY?: number;
  /** 0..1, replaces transform.anchor.x. Absent = clip's own value. */
  anchorX?: number;
  /** 0..1, replaces transform.anchor.y. Absent = clip's own value. */
  anchorY?: number;
  /** 0..1, replaces the shape's stroked sub-range start. Absent = clip's own. */
  trimStart?: number;
  /** 0..1, replaces the shape's stroked sub-range end. Absent = clip's own. */
  trimEnd?: number;
  /** Wipe mask, when one is active. Absent (undefined) means unmasked. */
  mask?: AnimationSampleMask;
  /**
   * Animation id that supplied each replace channel present in this sample.
   * Absent when no replace curve fired — which is every document that only
   * uses composing channels, so the steady path allocates nothing.
   */
  replacedBy?: Partial<Record<ReplaceChannel, string>>;
}

/** A fresh sample at identity: no replace channel driven, no mask. */
export function createAnimationSample(): AnimationSample {
  return {
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    brightness: 0,
    saturation: 1,
    contrast: 1,
    hue: 0,
    temperature: 0,
    tint: 0
  };
}

export const IDENTITY_SAMPLE: Readonly<AnimationSample> = Object.freeze(
  createAnimationSample()
);

/**
 * True when the sample changes nothing about the layer. A driven replace
 * channel always records its animation, so `replacedBy` covers all six of
 * them.
 */
export function isIdentitySample(s: AnimationSample): boolean {
  return (
    s.offsetX === 0 &&
    s.offsetY === 0 &&
    s.scale === 1 &&
    s.scaleX === 1 &&
    s.scaleY === 1 &&
    s.rotation === 0 &&
    s.opacity === 1 &&
    s.blur === 0 &&
    s.brightness === 0 &&
    s.saturation === 1 &&
    s.contrast === 1 &&
    s.hue === 0 &&
    s.temperature === 0 &&
    s.tint === 0 &&
    s.mask === undefined &&
    s.replacedBy === undefined
  );
}

function resetIdentity(s: AnimationSample): AnimationSample {
  s.offsetX = 0;
  s.offsetY = 0;
  s.scale = 1;
  s.scaleX = 1;
  s.scaleY = 1;
  s.rotation = 0;
  s.opacity = 1;
  s.blur = 0;
  s.brightness = 0;
  s.saturation = 1;
  s.contrast = 1;
  s.hue = 0;
  s.temperature = 0;
  s.tint = 0;
  s.positionX = undefined;
  s.positionY = undefined;
  s.anchorX = undefined;
  s.anchorY = undefined;
  s.trimStart = undefined;
  s.trimEnd = undefined;
  s.mask = undefined;
  s.replacedBy = undefined;
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
    const origin = anim.loopOriginMs ?? anim.windowStartMs;
    return ((((localMs - origin) % period) + period) % period) / period;
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
 * transform/opacity curves at the word's own time (`"motion"`). Which pass a
 * channel belongs to is declared in `ANIMATED_PROPERTY_PASS`, so a new channel
 * is classified there rather than by a list kept here.
 */
type FoldMode = "all" | "motion" | "effects";

/**
 * Both guards read the fold table, so the sample's fields and the table cannot
 * disagree about which kind a channel is.
 */
function isReplaceChannel(p: AnimatedProperty): p is ReplaceChannel {
  return ANIMATED_PROPERTY_FOLD[p] === "replace";
}

function isArithmeticChannel(p: AnimatedProperty): p is ArithmeticChannel {
  const fold = ANIMATED_PROPERTY_FOLD[p];
  return fold === "add" || fold === "multiply";
}

/**
 * Mask fold rule: when several wipes overlap (an in and an out on a short
 * clip), the sample with the SMALLER progress wins — more hidden wins, so the
 * layer never pops back to visible mid-overlap. A fully revealed wipe
 * (progress >= 1) contributes nothing: the layer is unmasked and the
 * compositor pays no mask cost.
 */
function foldWipe(
  anim: CompiledAnimation,
  value: number,
  acc: AnimationSample
): void {
  const config = anim.mask;
  if (!config) return;
  const progress = value < 0 ? 0 : value;
  if (progress >= 1) return;
  if (!acc.mask || progress < acc.mask.progress) {
    acc.mask = {
      direction: config.direction,
      progress,
      softness: config.softness
    };
  }
}

function foldAnimation(
  anim: CompiledAnimation,
  t: number,
  acc: AnimationSample,
  mode: FoldMode = "all"
): void {
  for (const curve of anim.curves) {
    const property = curve.property;
    if (mode !== "all" && ANIMATED_PROPERTY_PASS[property] !== mode) continue;
    const value = evalCurve(curve, t);
    // The arithmetic folds mirror how the compositor's effect pre-pass
    // aggregates: blur radii and the grade's additive terms sum across
    // effects, its multipliers multiply, so concurrent animations do the same.
    // Ranges are clamped once at the end of sampleAnimations.
    switch (ANIMATED_PROPERTY_FOLD[property]) {
      case "add":
        if (isArithmeticChannel(property)) acc[property] += value;
        break;
      case "multiply":
        if (isArithmeticChannel(property)) acc[property] *= value;
        break;
      case "replace":
        if (isReplaceChannel(property)) {
          acc[property] = value;
          // Allocated only once a replace curve fires, which keeps the steady
          // path of a document that only composes allocation-free.
          if (!acc.replacedBy) acc.replacedBy = {};
          acc.replacedBy[property] = anim.id;
        }
        break;
      case "min":
        foldWipe(anim, value, acc);
        break;
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
  const acc = resetIdentity(out ?? createAnimationSample());
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
  if (acc.scaleX < 0) acc.scaleX = 0;
  if (acc.scaleY < 0) acc.scaleY = 0;
  // Clamp effect values to the ranges the grade/blur pipeline accepts.
  if (acc.blur < 0) acc.blur = 0;
  if (acc.brightness < -1) acc.brightness = -1;
  else if (acc.brightness > 1) acc.brightness = 1;
  if (acc.saturation < 0) acc.saturation = 0;
  else if (acc.saturation > 4) acc.saturation = 4;
  if (acc.contrast < 0) acc.contrast = 0;
  else if (acc.contrast > 4) acc.contrast = 4;
  // Hue is an angle: a full turn is the identity, so it wraps into -180..180
  // the way the grade aggregator does rather than clamping at the ends.
  if (acc.hue !== 0) acc.hue = ((acc.hue % 360) + 540) % 360 - 180;
  if (acc.temperature < -1) acc.temperature = -1;
  else if (acc.temperature > 1) acc.temperature = 1;
  if (acc.tint < -1) acc.tint = -1;
  else if (acc.tint > 1) acc.tint = 1;
  acc.trimStart = clampUnit(acc.trimStart);
  acc.trimEnd = clampUnit(acc.trimEnd);
  return acc;
}

/** Clamp a driven 0..1 replace channel, leaving an undriven one absent. */
function clampUnit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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
    const phase = localMs - (anim.loopOriginMs ?? anim.windowStartMs) - delay;
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
  const acc = resetIdentity(out ?? createAnimationSample());
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
