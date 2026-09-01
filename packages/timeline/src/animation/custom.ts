/**
 * Custom animations: motion authored as JavaScript instead of picked from the
 * preset catalog.
 *
 * The body runs ONCE, host-side, and returns keyframes. Those keyframes are
 * baked onto the clip and compiled exactly like a preset's, so the five render
 * sites that sample animations — the WebGPU preview, the web export renderer,
 * the text rasterizer, and the headless `nodetool.timeline` compositor — need
 * no JS engine and cannot disagree about what a script means. Sampling an
 * arbitrary `f(t)` densely is what makes that equivalent to evaluating the
 * body per frame; the cost is that a script cannot react to playback state.
 *
 * This module is the whole contract: the input bag a body receives, the two
 * output shapes it may return, and the normalization every consumer applies.
 * Pure — no DOM, GPU, sandbox, or store — so the browser, the server bake, the
 * validator, and the tests all read one implementation.
 */

import type {
  CompiledAnimationMask,
  Keyframe,
  PropertyCurve
} from "./compile.js";
import {
  ANIMATED_PROPERTIES,
  type AnimatedProperty,
  type AnimationRole,
  type WipeDirection
} from "./types.js";

/**
 * Reserved `preset` id marking an animation whose curves come from
 * `ClipAnimation.custom` rather than from the catalog.
 */
export const CUSTOM_ANIMATION_PRESET_ID = "custom";

/** Curves accepted per animation. A script wanting more is doing too much. */
export const MAX_CUSTOM_CURVES = 16;

/**
 * Keyframes accepted per curve. Well past what any easing needs at 60fps over
 * a long clip, and low enough that a runaway loop in a body is rejected rather
 * than saved into the document.
 */
export const MAX_CUSTOM_KEYFRAMES = 4096;

/** Sample density suggested to a body that has no opinion of its own. */
export const DEFAULT_CUSTOM_SAMPLE_COUNT = 60;

const WIPE_DIRECTIONS: readonly WipeDirection[] = [
  "left",
  "right",
  "up",
  "down"
];

const PROPERTY_SET = new Set<string>(ANIMATED_PROPERTIES);

/**
 * The bag a custom-animation body reads off `inputs`. Everything the compiler
 * knows before the curves exist, so a body can shape its motion to the clip it
 * is on: `canvasWidth`/`canvasHeight` turn a normalized distance into px the
 * way a preset's `curves(params, canvas, role)` does.
 */
export interface CustomAnimationScriptInputs {
  role: AnimationRole;
  /** The animation's own window length in ms (its `durationMs`). */
  durationMs: number;
  /** The clip the animation sits on, in ms. */
  clipDurationMs: number;
  canvasWidth: number;
  canvasHeight: number;
  /** The animation's `params`, passed through untouched. */
  params: Record<string, number | string | boolean>;
  /** Stagger units the clip splits into (word count of a text clip), or 0. */
  staggerCount: number;
  /** Suggested `samples` density for a body sampling a continuous `f(t)`. */
  sampleCount: number;
}

export interface BuildCustomAnimationInputsOptions {
  role: AnimationRole;
  durationMs: number;
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  staggerCount?: number;
  sampleCount?: number;
}

/** Build the `inputs` bag for a custom-animation body. */
export function buildCustomAnimationInputs(
  options: BuildCustomAnimationInputsOptions
): CustomAnimationScriptInputs {
  return {
    role: options.role,
    durationMs: options.durationMs,
    clipDurationMs: options.clipDurationMs,
    canvasWidth: options.canvas.width,
    canvasHeight: options.canvas.height,
    params: options.params ?? {},
    staggerCount: options.staggerCount ?? 0,
    sampleCount: options.sampleCount ?? DEFAULT_CUSTOM_SAMPLE_COUNT
  };
}

export type CustomCurvesResult =
  | { ok: true; curves: PropertyCurve[] }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Normalize one curve's keyframes to what {@link sampleAnimations} assumes:
 * sorted by `t`, `t` clamped to 0..1, first `t === 0`, last `t === 1`. A curve
 * whose ends fall short is extended by holding its end values, which is what a
 * body sampling `0.05..0.95` means.
 */
function normalizeKeyframes(raw: readonly Keyframe[]): Keyframe[] {
  const sorted = raw
    .map((kf) => {
      const clamped: Keyframe = {
        t: Math.min(1, Math.max(0, kf.t)),
        value: kf.value
      };
      if (kf.easing !== undefined) {
        clamped.easing = kf.easing;
      }
      return clamped;
    })
    .sort((a, b) => a.t - b.t);

  if (sorted[0].t > 0) {
    sorted.unshift({ ...sorted[0], t: 0 });
  }
  const last = sorted[sorted.length - 1];
  if (last.t < 1) {
    sorted.push({ ...last, t: 1 });
  }
  return sorted;
}

function parseCurve(raw: unknown, index: number): CustomCurvesResult {
  if (!isRecord(raw)) {
    return { ok: false, error: `curves[${index}] is not an object` };
  }
  const property = raw.property;
  if (typeof property !== "string" || !PROPERTY_SET.has(property)) {
    return {
      ok: false,
      error:
        `curves[${index}].property is ${JSON.stringify(property)}; ` +
        `expected one of ${ANIMATED_PROPERTIES.join(", ")}`
    };
  }
  const keyframes = raw.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return {
      ok: false,
      error: `curves[${index}] (${property}) has no keyframes`
    };
  }
  if (keyframes.length > MAX_CUSTOM_KEYFRAMES) {
    return {
      ok: false,
      error:
        `curves[${index}] (${property}) has ${keyframes.length} keyframes; ` +
        `the limit is ${MAX_CUSTOM_KEYFRAMES}`
    };
  }

  const parsed: Keyframe[] = [];
  for (let i = 0; i < keyframes.length; i++) {
    const kf: unknown = keyframes[i];
    if (!isRecord(kf) || !isFiniteNumber(kf.t) || !isFiniteNumber(kf.value)) {
      return {
        ok: false,
        error:
          `curves[${index}] (${property}) keyframe ${i} needs finite ` +
          "numeric `t` and `value`"
      };
    }
    const keyframe: Keyframe = { t: kf.t, value: kf.value };
    if (typeof kf.easing === "string") {
      // Unknown easing ids fall through to linear in `ease`, matching how an
      // unknown preset id is tolerated rather than rejected.
      keyframe.easing = kf.easing as Keyframe["easing"];
    }
    parsed.push(keyframe);
  }

  return {
    ok: true,
    curves: [{ property: property as AnimatedProperty, keyframes: normalizeKeyframes(parsed) }]
  };
}

/**
 * Check and normalize a baked curve list — the one gate between a script's
 * output (or a document written by another client) and the sampler.
 */
export function normalizeCustomCurves(raw: unknown): CustomCurvesResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "curves must be an array" };
  }
  if (raw.length === 0) {
    return { ok: false, error: "curves is empty — the animation drives nothing" };
  }
  if (raw.length > MAX_CUSTOM_CURVES) {
    return {
      ok: false,
      error: `${raw.length} curves; the limit is ${MAX_CUSTOM_CURVES}`
    };
  }

  const curves: PropertyCurve[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseCurve(raw[i], i);
    if (!parsed.ok) return parsed;
    const curve = parsed.curves[0];
    if (seen.has(curve.property)) {
      return {
        ok: false,
        error: `two curves drive "${curve.property}" — one curve per property`
      };
    }
    seen.add(curve.property);
    curves.push(curve);
  }
  return { ok: true, curves };
}

/**
 * Convert the `samples` output shape — one bag per point in time,
 * `{t, opacity, offsetY, …}` — into per-property curves. This is how a body
 * that computes a continuous `f(t)` writes its result: emit the function at N
 * points and let the sampler interpolate between them.
 *
 * A property present on some samples and absent on others is an error rather
 * than a hole: interpolating across the gap would silently invent motion the
 * body never wrote.
 */
export function curvesFromSamples(raw: unknown): CustomCurvesResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "samples must be an array" };
  }
  if (raw.length < 2) {
    return { ok: false, error: "samples needs at least two points" };
  }
  if (raw.length > MAX_CUSTOM_KEYFRAMES) {
    return {
      ok: false,
      error: `${raw.length} samples; the limit is ${MAX_CUSTOM_KEYFRAMES}`
    };
  }

  const byProperty = new Map<string, Keyframe[]>();
  for (let i = 0; i < raw.length; i++) {
    const sample: unknown = raw[i];
    if (!isRecord(sample) || !isFiniteNumber(sample.t)) {
      return { ok: false, error: `samples[${i}] needs a finite numeric \`t\`` };
    }
    const easing = typeof sample.easing === "string" ? sample.easing : undefined;
    for (const [key, value] of Object.entries(sample)) {
      if (key === "t" || key === "easing") continue;
      if (!PROPERTY_SET.has(key)) {
        return {
          ok: false,
          error:
            `samples[${i}] sets "${key}"; expected one of ` +
            `${ANIMATED_PROPERTIES.join(", ")}`
        };
      }
      if (!isFiniteNumber(value)) {
        return {
          ok: false,
          error: `samples[${i}].${key} is not a finite number`
        };
      }
      const keyframe: Keyframe = { t: sample.t, value };
      if (easing !== undefined) {
        keyframe.easing = easing as Keyframe["easing"];
      }
      const list = byProperty.get(key) ?? [];
      list.push(keyframe);
      byProperty.set(key, list);
    }
  }

  if (byProperty.size === 0) {
    return { ok: false, error: "samples set no animated property" };
  }
  for (const [property, keyframes] of byProperty) {
    if (keyframes.length !== raw.length) {
      return {
        ok: false,
        error:
          `"${property}" is set on ${keyframes.length} of ${raw.length} ` +
          "samples — set it on every sample or on none"
      };
    }
  }

  return normalizeCustomCurves(
    [...byProperty].map(([property, keyframes]) => ({ property, keyframes }))
  );
}

/**
 * Read a custom-animation body's return value. Accepts either output shape:
 * `{curves}` for a body that authored keyframes directly, `{samples}` for one
 * that sampled a function. A bag carrying both is a mistake worth naming.
 */
export function curvesFromScriptOutput(outputs: unknown): CustomCurvesResult {
  if (!isRecord(outputs)) {
    return {
      ok: false,
      error: "the body returned no object — return `{curves}` or `{samples}`"
    };
  }
  const hasCurves = outputs.curves !== undefined;
  const hasSamples = outputs.samples !== undefined;
  if (hasCurves && hasSamples) {
    return {
      ok: false,
      error: "the body returned both `curves` and `samples` — return one"
    };
  }
  if (hasCurves) return normalizeCustomCurves(outputs.curves);
  if (hasSamples) return curvesFromSamples(outputs.samples);
  return {
    ok: false,
    error: "the body returned neither `curves` nor `samples`"
  };
}

export type CustomMaskResult =
  | { ok: true; mask?: CompiledAnimationMask }
  | { ok: false; error: string };

/**
 * Resolve the mask a custom animation needs. A `wipeProgress` curve without
 * one is refused: direction and softness cannot be inferred, and defaulting
 * them would render a wipe the author never described.
 */
export function resolveCustomMask(
  curves: readonly PropertyCurve[],
  raw: unknown
): CustomMaskResult {
  const drivesWipe = curves.some((curve) => curve.property === "wipeProgress");
  if (!isRecord(raw)) {
    if (drivesWipe) {
      return {
        ok: false,
        error:
          "a `wipeProgress` curve needs a mask — set `custom.mask` to " +
          "{direction, softness}"
      };
    }
    return { ok: true };
  }

  const direction = raw.direction;
  if (
    typeof direction !== "string" ||
    !(WIPE_DIRECTIONS as readonly string[]).includes(direction)
  ) {
    return {
      ok: false,
      error:
        `custom.mask.direction is ${JSON.stringify(direction)}; ` +
        `expected one of ${WIPE_DIRECTIONS.join(", ")}`
    };
  }
  const softness = raw.softness;
  if (!isFiniteNumber(softness) || softness < 0 || softness > 1) {
    return {
      ok: false,
      error: "custom.mask.softness must be a number in 0..1"
    };
  }
  return {
    ok: true,
    mask: { direction: direction as WipeDirection, softness }
  };
}
