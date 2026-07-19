/**
 * Preset → curve compiler. Presets never render directly; `compileClipAnimations`
 * resolves each `ClipAnimation` into a `CompiledAnimation` — a window on the
 * clip-local clock plus keyframe curves with easing baked onto each segment.
 * The sampler (`sample.ts`) then needs no preset or role knowledge.
 *
 * Pure: no DOM, GPU, or store access.
 */

import type {
  AnimationRole,
  ClipAnimation,
  EasingId,
  WipeDirection
} from "./types.js";
import {
  getAnimationPreset,
  resolvePresetParams,
  type Canvas
} from "./presets.js";

export type AnimatedProperty =
  | "offsetX" // canvas px, added to transform.position.x
  | "offsetY" // canvas px, added to transform.position.y
  | "scale" // uniform multiplier on ClipTransform.scale
  | "rotation" // radians, added to ClipTransform.rotation
  | "opacity" // multiplier on the layer's resolved opacity
  | "wipeProgress" // 0 = fully hidden, 1 = fully revealed (mask presets only)
  // Effect params applied through the compositor's per-layer effect pre-pass.
  // The engine stays pure: these values compose into synthesized `ClipEffect`s
  // at the render site (see `resolveAnimatedLayerProps`), matching what the
  // `color.grade` / Gaussian-blur pipeline already applies.
  | "blur" // added to the layer's blur radius, in source px (identity 0)
  | "brightness" // added to the grade shader's brightness term, -1..1 (identity 0)
  | "saturation"; // multiplies the grade shader's saturation, 0..4 (identity 1)

export interface Keyframe {
  /** Normalized 0..1 within the animation window. */
  t: number;
  value: number;
  /** Easing of the segment ending at this keyframe. Undefined → linear. */
  easing?: EasingId;
}

export interface PropertyCurve {
  property: AnimatedProperty;
  /** Sorted by `t`; first `t === 0`, last `t === 1`. */
  keyframes: Keyframe[];
}

/**
 * Static per-animation mask config for wipe-style presets. Direction and
 * softness never animate — only the `wipeProgress` curve does — so they ride
 * on the compiled animation, not on a curve.
 */
export interface CompiledAnimationMask {
  direction: WipeDirection;
  /** Feathered edge width as a fraction of the wipe axis (0 = hard edge). */
  softness: number;
}

export interface CompiledAnimation {
  role: AnimationRole;
  /** Clip-local ms, resolved from role + delay + duration. */
  windowStartMs: number;
  windowEndMs: number;
  /**
   * Repeat the window until clip end. Set by the preset's role handling, not
   * derived from role alone: most `"loop"` presets compile `loop: true`, but
   * `kenBurns` compiles `loop: false` (one-shot over the whole clip).
   */
  loop: boolean;
  /** Cycle length in ms when `loop` is true; the window runs to clip end. */
  periodMs?: number;
  /** Hold the `t=0` values before the window (true for `"in"`). */
  holdBefore: boolean;
  /** Hold the `t=1` values after the window (true for `"out"`). */
  holdAfter: boolean;
  curves: PropertyCurve[];
  /** Present only when the preset drives a `wipeProgress` curve. */
  mask?: CompiledAnimationMask;
}

/** Default segment easing when neither the animation nor the preset pins one. */
function roleDefaultEasing(role: AnimationRole): EasingId {
  switch (role) {
    case "in":
      return "easeOut";
    case "out":
      return "easeIn";
    case "emphasis":
      return "easeInOut";
    case "loop":
      return "linear";
  }
}

/** Reverse a curve in time: an "in" curve run backwards is the "out" curve. */
function reverseCurve(curve: PropertyCurve): PropertyCurve {
  const n = curve.keyframes.length;
  const keyframes: Keyframe[] = curve.keyframes.map((_, i) => {
    const src = curve.keyframes[n - 1 - i];
    return { t: 1 - src.t, value: src.value, easing: src.easing };
  });
  return { property: curve.property, keyframes };
}

/** Bake the effective easing onto each keyframe's incoming segment. */
function applyEasing(
  curves: PropertyCurve[],
  animation: ClipAnimation,
  role: AnimationRole,
  presetEasing: EasingId | undefined
): PropertyCurve[] {
  const override = animation.easing; // overrides every segment when set
  const base = presetEasing ?? roleDefaultEasing(role);
  return curves.map((curve) => ({
    property: curve.property,
    keyframes: curve.keyframes.map((kf) => ({
      t: kf.t,
      value: kf.value,
      easing: override ?? kf.easing ?? base
    }))
  }));
}

/**
 * Compile a clip's animations into windowed curves.
 *
 * - `canvas` resolves normalized preset distances to px.
 * - `clipDurationMs` sets window math; windows are clamped to it and windows
 *   that start at or after clip end are dropped.
 * - Unknown presets and roles the preset does not allow are skipped (with a
 *   console warning) — forward compatibility with newer documents.
 */
export function compileClipAnimations(
  animations: ClipAnimation[] | undefined,
  clipDurationMs: number,
  canvas: Canvas
): CompiledAnimation[] {
  if (!animations || animations.length === 0) return [];
  const out: CompiledAnimation[] = [];

  for (const animation of animations) {
    if (animation.enabled === false) continue;
    const preset = getAnimationPreset(animation.preset);
    if (!preset) {
      console.warn(
        `[timeline] unknown animation preset "${animation.preset}" — skipped`
      );
      continue;
    }
    if (!preset.roles.includes(animation.role)) {
      console.warn(
        `[timeline] preset "${animation.preset}" does not support role "${animation.role}" — skipped`
      );
      continue;
    }

    const params = resolvePresetParams(preset, animation.params);
    const mask = preset.mask?.(params);
    let curves = preset.curves(params, canvas, animation.role);
    if (animation.role === "out") {
      curves = curves.map(reverseCurve);
    }
    curves = applyEasing(curves, animation, animation.role, preset.defaultEasing);

    const delayMs = Math.max(0, animation.delayMs ?? 0);
    const durationMs = Math.max(1, animation.durationMs);

    if (preset.fullClip) {
      // kenBurns: one-shot over the whole clip; duration/delay ignored.
      out.push({
        role: animation.role,
        windowStartMs: 0,
        windowEndMs: clipDurationMs,
        loop: false,
        holdBefore: false,
        holdAfter: true,
        curves
      });
      continue;
    }

    if (animation.role === "loop") {
      // The window runs from the delay to clip end, cycling at `durationMs`.
      const windowStartMs = Math.max(0, delayMs);
      if (windowStartMs >= clipDurationMs) continue;
      out.push({
        role: "loop",
        windowStartMs,
        windowEndMs: clipDurationMs,
        loop: true,
        periodMs: durationMs,
        holdBefore: false,
        holdAfter: false,
        curves
      });
      continue;
    }

    let windowStartMs: number;
    let windowEndMs: number;
    if (animation.role === "out") {
      windowEndMs = clipDurationMs - delayMs;
      windowStartMs = windowEndMs - durationMs;
    } else {
      windowStartMs = delayMs;
      windowEndMs = delayMs + durationMs;
    }

    // Clamp to the clip and drop degenerate windows.
    windowEndMs = Math.min(windowEndMs, clipDurationMs);
    windowStartMs = Math.max(0, windowStartMs);
    if (windowStartMs >= clipDurationMs || windowEndMs <= windowStartMs) {
      continue;
    }

    const compiled: CompiledAnimation = {
      role: animation.role,
      windowStartMs,
      windowEndMs,
      loop: false,
      holdBefore: animation.role === "in",
      holdAfter: animation.role === "out",
      curves
    };
    if (mask) compiled.mask = mask;
    out.push(compiled);
  }

  return out;
}
