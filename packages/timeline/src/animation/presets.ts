/**
 * Preset catalog v1. Each preset declares its allowed roles, default
 * duration/easing, params (with defaults and ranges), and a curve generator.
 * Curve generators author the *forward* ("in") motion; `compileClipAnimations`
 * reverses it in time for the `"out"` role, so a preset never special-cases in
 * vs out.
 *
 * Position params are normalized (fraction of canvas width/height); generators
 * resolve them to px against the passed `canvas`, keeping the sampler and GPU
 * unit-free.
 *
 * Pure: no DOM, GPU, or store access.
 */

import type {
  AnimatedProperty,
  AnimationPresetId,
  AnimationRole,
  WipeDirection
} from "./types.js";
import type {
  CompiledAnimationMask,
  Keyframe,
  PropertyCurve
} from "./compile.js";
import { ease } from "./easing.js";
import { MAX_CUSTOM_KEYFRAMES } from "./custom.js";
import {
  flattenNormalizedPath,
  pointAtPathFraction,
  type PathBox
} from "../pathSampling.js";

export interface Canvas {
  width: number;
  height: number;
}

export type PresetParamValue = number | string | boolean;
export type ResolvedParams = Record<string, PresetParamValue>;

export interface PresetParamSpec {
  name: string;
  default: PresetParamValue;
  /** Numeric range hints for UI sliders. */
  min?: number;
  max?: number;
  /** Allowed values for string (option) params. */
  options?: string[];
}

export interface AnimationPreset {
  id: AnimationPresetId;
  roles: AnimationRole[];
  defaultDurationMs: number;
  /**
   * When set, overrides the per-role default segment easing. A string so a
   * preset can pin a parametric easing (`spring(...)`, `cubic-bezier(...)`)
   * as well as a named id; `parseEasing` reads both.
   */
  defaultEasing?: string;
  params: PresetParamSpec[];
  describe: string;
  /**
   * When true the preset runs once over the whole clip (window = full clip,
   * `holdAfter`), ignoring duration/delay. Only `kenBurns` sets this.
   */
  fullClip?: boolean;
  /**
   * `durationMs` is the animation's own window length in ms (before delay,
   * before stagger stretch) — `compileClipAnimations` passes it so a preset
   * whose motion depends on its window (seeded noise's fade envelope,
   * arc-length sample density) can size itself to it rather than to a fixed
   * sample count. Optional so a preset that ignores it (nearly all of them)
   * can keep its existing three-argument signature.
   */
  curves(
    params: ResolvedParams,
    canvas: Canvas,
    role: AnimationRole,
    durationMs?: number
  ): PropertyCurve[];
  /**
   * Static mask config for presets that drive a `wipeProgress` curve. Carried
   * on the `CompiledAnimation` (direction/softness never animate). Only `wipe`
   * sets this.
   */
  mask?(params: ResolvedParams): CompiledAnimationMask;
}

// ── param helpers ─────────────────────────────────────────────────────────

function num(params: ResolvedParams, name: string, fallback: number): number {
  const v = params[name];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(params: ResolvedParams, name: string, fallback: string): string {
  const v = params[name];
  return typeof v === "string" ? v : fallback;
}

/** Sample `fn` at `count` evenly-spaced points t ∈ [0,1] into a curve. */
function sampleCurve(
  property: AnimatedProperty,
  count: number,
  fn: (t: number) => number
): PropertyCurve {
  const keyframes: Keyframe[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    keyframes.push({ t, value: fn(t) });
  }
  return { property, keyframes };
}

const TWO_PI = Math.PI * 2;

// ── sample density (T8) ─────────────────────────────────────────────────────

export interface SampleCountBounds {
  min: number;
  max: number;
}

/**
 * Keyframe count for a curve sampled at ~8 points per cycle of `frequencyHz`
 * over `durationMs`, clamped to `bounds`. One extra keyframe closes the last
 * cycle (`sampleCurve` divides by `count - 1`), so a whole number of cycles
 * still lands its final sample exactly at `t = 1`.
 *
 * `bounds.max` should never exceed `MAX_CUSTOM_KEYFRAMES` — the limit
 * `normalizeCustomCurves` enforces on a baked custom animation's curves.
 * Preset-generated curves are not run through that gate today, but staying
 * under the same ceiling keeps a preset's output document-shaped even if a
 * future caller (a "bake this preset to custom" op) starts saving it as one.
 */
export function sampleCountFor(
  durationMs: number,
  frequencyHz: number,
  bounds: SampleCountBounds
): number {
  const cycles =
    durationMs > 0 && frequencyHz > 0 ? (durationMs / 1000) * frequencyHz : 0;
  const raw = Math.round(cycles * 8) + 1;
  return Math.max(bounds.min, Math.min(bounds.max, raw));
}

// ── seeded value noise (T6, T7) ──────────────────────────────────────────────

/**
 * mulberry32: a small, fast, deterministic PRNG. Same seed, same sequence —
 * which is what lets `shake`/`float` reproduce identical curves for identical
 * params rather than re-rolling on every compile.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth (cubic Hermite) interpolant, for value noise between lattice points. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** `count` random values in [-1, 1], drawn from `rand`. */
function buildNoiseLattice(rand: () => number, count: number): number[] {
  const lattice: number[] = [];
  for (let i = 0; i < count; i++) lattice.push(rand() * 2 - 1);
  return lattice;
}

/**
 * Value noise at `u` (expected 0..1) over an open lattice — the two end
 * lattice points are NOT the same value, so this is for a one-shot animation
 * (`shake`), not a loop.
 */
function sampleLatticeNoise(lattice: readonly number[], u: number): number {
  const n = lattice.length;
  if (n === 0) return 0;
  if (n === 1) return lattice[0]!;
  const scaled = Math.max(0, Math.min(1, u)) * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(scaled));
  const i1 = i0 + 1;
  const frac = scaled - i0;
  const a = lattice[i0]!;
  const b = lattice[i1]!;
  return a + (b - a) * smoothstep(frac);
}

/**
 * Value noise at `u` (0..1) over a CIRCULAR lattice: `u = 0` and `u = 1` both
 * resolve to `lattice[0]`, so a loop preset (`float`) can blend this in
 * without breaking its own seamless-loop invariant.
 */
function sampleCircularLatticeNoise(
  lattice: readonly number[],
  u: number
): number {
  const n = lattice.length;
  if (n === 0) return 0;
  const scaled = u * n;
  const i0 = ((Math.floor(scaled) % n) + n) % n;
  const i1 = (i0 + 1) % n;
  const frac = scaled - Math.floor(scaled);
  const a = lattice[i0]!;
  const b = lattice[i1]!;
  return a + (b - a) * smoothstep(frac);
}

/**
 * Amplitude envelope for `shake`: ramps 0→1 over the first `fadeInMs` of the
 * window and 1→0 over the last `fadeOutMs`, 1 elsewhere. A `0` fade length
 * disables that ramp — the caller separately forces the curve's own t=0/t=1
 * keyframes to 0, which is the actual "starts and ends at rest" guarantee;
 * this only shapes how quickly the interior approaches full amplitude.
 */
function fadeEnvelope(
  tMs: number,
  windowMs: number,
  fadeInMs: number,
  fadeOutMs: number
): number {
  let e = 1;
  if (fadeInMs > 0 && tMs < fadeInMs) e = Math.min(e, tMs / fadeInMs);
  if (fadeOutMs > 0 && tMs > windowMs - fadeOutMs) {
    e = Math.min(e, (windowMs - tMs) / fadeOutMs);
  }
  return Math.max(0, Math.min(1, e));
}

/** Nominal sample-density frequency for `followPath` — see its `describe`. */
const FOLLOW_PATH_SAMPLE_HZ = 1;

// ── catalog ────────────────────────────────────────────────────────────────

const PRESETS: AnimationPreset[] = [
  {
    id: "fade",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    params: [],
    describe: "Fade opacity between 0 and 1.",
    curves: () => [{ property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }]
  },
  {
    id: "slide",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    params: [
      { name: "direction", default: "left", options: ["left", "right", "up", "down"] },
      { name: "distance", default: 0.3, min: 0, max: 1 }
    ],
    describe: "Slide in from a direction (opacity fades in with it).",
    curves: (params, canvas) => {
      const direction = str(params, "direction", "left");
      const distance = num(params, "distance", 0.3);
      const dx = distance * canvas.width;
      const dy = distance * canvas.height;
      const curves: PropertyCurve[] = [
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ];
      switch (direction) {
        case "right":
          curves.push({ property: "offsetX", keyframes: [{ t: 0, value: dx }, { t: 1, value: 0 }] });
          break;
        case "up":
          curves.push({ property: "offsetY", keyframes: [{ t: 0, value: -dy }, { t: 1, value: 0 }] });
          break;
        case "down":
          curves.push({ property: "offsetY", keyframes: [{ t: 0, value: dy }, { t: 1, value: 0 }] });
          break;
        case "left":
        default:
          curves.push({ property: "offsetX", keyframes: [{ t: 0, value: -dx }, { t: 1, value: 0 }] });
          break;
      }
      return curves;
    }
  },
  {
    id: "pop",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    defaultEasing: "easeOut",
    params: [{ name: "overshoot", default: 1.08, min: 1, max: 1.5 }],
    describe: "Scale up past 1 then settle, with a fade in.",
    curves: (params) => {
      const overshoot = num(params, "overshoot", 1.08);
      return [
        {
          property: "scale",
          keyframes: [
            { t: 0, value: 0.6 },
            { t: 0.6, value: overshoot },
            { t: 1, value: 1 }
          ]
        },
        {
          property: "opacity",
          keyframes: [
            { t: 0, value: 0 },
            { t: 0.6, value: 1 },
            { t: 1, value: 1 }
          ]
        }
      ];
    }
  },
  {
    id: "spin",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    params: [{ name: "turns", default: 0.25, min: 0, max: 2 }],
    describe: "Rotate into place while fading in.",
    curves: (params) => {
      const turns = num(params, "turns", 0.25);
      return [
        { property: "rotation", keyframes: [{ t: 0, value: -turns * TWO_PI }, { t: 1, value: 0 }] },
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ];
    }
  },
  {
    id: "wipe",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    // No defaultEasing: the role defaults apply (in → easeOut, out → easeIn),
    // matching fade/slide.
    params: [
      { name: "direction", default: "left", options: ["left", "right", "up", "down"] },
      { name: "softness", default: 0.05, min: 0, max: 0.5 }
    ],
    describe:
      "Reveal the layer with a directional mask sweep (feathered edge via softness).",
    curves: () => [
      {
        property: "wipeProgress",
        keyframes: [
          { t: 0, value: 0 },
          { t: 1, value: 1 }
        ]
      }
    ],
    mask: (params) => {
      const raw = str(params, "direction", "left");
      const direction: WipeDirection =
        raw === "right" || raw === "up" || raw === "down" ? raw : "left";
      const softness = Math.min(0.5, Math.max(0, num(params, "softness", 0.05)));
      return { direction, softness };
    }
  },
  {
    id: "blur",
    roles: ["in", "out"],
    defaultDurationMs: 500,
    // No defaultEasing: role defaults apply (in → easeOut, out → easeIn).
    params: [{ name: "amount", default: 12, min: 0, max: 40 }],
    describe:
      "Rack focus: start blurred and sharpen into place (reversed for out), fading in with it.",
    curves: (params) => {
      const amount = Math.max(0, Math.min(40, num(params, "amount", 12)));
      return [
        { property: "blur", keyframes: [{ t: 0, value: amount }, { t: 1, value: 0 }] },
        { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
      ];
    }
  },
  {
    id: "colorFade",
    roles: ["in", "out"],
    defaultDurationMs: 600,
    // No defaultEasing: role defaults apply.
    params: [],
    describe:
      "Desaturate to grayscale then bloom into full color on in (reversed for out).",
    curves: () => [
      { property: "saturation", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
    ]
  },
  {
    id: "pulse",
    roles: ["emphasis"],
    defaultDurationMs: 600,
    defaultEasing: "easeInOut",
    params: [{ name: "intensity", default: 0.06, min: 0, max: 0.5 }],
    describe: "Scale up and back for a soft heartbeat.",
    curves: (params) => {
      const intensity = num(params, "intensity", 0.06);
      return [
        {
          property: "scale",
          keyframes: [
            { t: 0, value: 1 },
            { t: 0.5, value: 1 + intensity },
            { t: 1, value: 1 }
          ]
        }
      ];
    }
  },
  {
    id: "flash",
    roles: ["emphasis"],
    defaultDurationMs: 400,
    defaultEasing: "easeInOut",
    params: [{ name: "intensity", default: 0.6, min: 0, max: 1 }],
    describe: "Brief brightness spike and back to normal.",
    curves: (params) => {
      const intensity = Math.max(0, Math.min(1, num(params, "intensity", 0.6)));
      return [
        {
          property: "brightness",
          keyframes: [
            { t: 0, value: 0 },
            { t: 0.5, value: intensity },
            { t: 1, value: 0 }
          ]
        }
      ];
    }
  },
  {
    id: "shake",
    roles: ["emphasis"],
    defaultDurationMs: 600,
    defaultEasing: "linear",
    params: [
      { name: "intensity", default: 0.02, min: 0, max: 0.2 },
      { name: "frequency", default: 8, min: 0.5, max: 30 },
      { name: "seed", default: 1, min: 0, max: 1000000 },
      { name: "fadeInMs", default: 0, min: 0, max: 5000 },
      { name: "fadeOutMs", default: 0, min: 0, max: 5000 }
    ],
    describe:
      "Seeded jitter on both axes (deterministic per seed); starts and ends " +
      "at rest, with optional fade-in/out.",
    curves: (params, canvas, _role, durationMs) => {
      const intensity = num(params, "intensity", 0.02);
      const frequency = Math.max(0.01, num(params, "frequency", 8));
      const seed = Math.round(num(params, "seed", 1));
      const fadeInMs = Math.max(0, num(params, "fadeInMs", 0));
      const fadeOutMs = Math.max(0, num(params, "fadeOutMs", 0));
      const windowMs = durationMs ?? 600;

      const count = sampleCountFor(windowMs, frequency, {
        min: 9,
        max: MAX_CUSTOM_KEYFRAMES
      });
      // A lattice point roughly every cycle; two independent PRNG streams
      // (odd/even seed offsets) so X and Y jitter don't move in lockstep.
      const latticeCount = Math.max(
        2,
        Math.round((frequency * windowMs) / 1000) + 1
      );
      const noiseX = buildNoiseLattice(mulberry32(seed * 2 + 1), latticeCount);
      const noiseY = buildNoiseLattice(mulberry32(seed * 2 + 2), latticeCount);
      const ampX = intensity * canvas.width;
      const ampY = intensity * canvas.height;

      const axis = (lattice: number[], amp: number) => (t: number): number => {
        // Force exact rest at both ends regardless of fade settings — the
        // invariant is on the curve, not on the envelope.
        if (t <= 0 || t >= 1) return 0;
        const envelope = fadeEnvelope(t * windowMs, windowMs, fadeInMs, fadeOutMs);
        return amp * sampleLatticeNoise(lattice, t) * envelope;
      };

      return [
        sampleCurve("offsetX", count, axis(noiseX, ampX)),
        sampleCurve("offsetY", count, axis(noiseY, ampY))
      ];
    }
  },
  {
    id: "bounce",
    roles: ["emphasis"],
    defaultDurationMs: 600,
    defaultEasing: "linear",
    params: [{ name: "height", default: 0.05, min: 0, max: 0.3 }],
    describe: "Hop up and land with a bounce.",
    curves: (params, canvas) => {
      const height = num(params, "height", 0.05) * canvas.height;
      // Rise on [0,0.5] (easeOut), fall back to rest on [0.5,1] (easeOutBounce).
      const profile = (t: number): number => {
        if (t < 0.5) return ease("easeOut", t / 0.5);
        return 1 - ease("easeOutBounce", (t - 0.5) / 0.5);
      };
      // Negative offsetY = up on the canvas.
      return [sampleCurve("offsetY", 24, (t) => -height * profile(t))];
    }
  },
  {
    id: "squash",
    roles: ["emphasis"],
    defaultDurationMs: 500,
    defaultEasing: "easeOutBack",
    params: [{ name: "amount", default: 0.12, min: 0, max: 0.5 }],
    describe: "Squash wider and shorter, then spring back to shape.",
    curves: (params) => {
      const amount = Math.max(0, Math.min(0.5, num(params, "amount", 0.12)));
      return [
        {
          property: "scaleX",
          keyframes: [
            { t: 0, value: 1 },
            { t: 0.5, value: 1 + amount },
            { t: 1, value: 1 }
          ]
        },
        {
          property: "scaleY",
          keyframes: [
            { t: 0, value: 1 },
            { t: 0.5, value: 1 - amount },
            { t: 1, value: 1 }
          ]
        }
      ];
    }
  },
  {
    id: "kenBurns",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "easeInOut",
    fullClip: true,
    params: [
      { name: "zoom", default: 0.12, min: 0, max: 1 },
      { name: "direction", default: "in", options: ["in", "out"] },
      { name: "driftX", default: 0.02, min: -0.2, max: 0.2 },
      { name: "driftY", default: 0.02, min: -0.2, max: 0.2 }
    ],
    describe: "Slow zoom and drift across the whole clip (one shot).",
    curves: (params, canvas) => {
      const zoom = num(params, "zoom", 0.12);
      const direction = str(params, "direction", "in");
      const driftX = num(params, "driftX", 0.02) * canvas.width;
      const driftY = num(params, "driftY", 0.02) * canvas.height;
      const from = direction === "out" ? 1 + zoom : 1;
      const to = direction === "out" ? 1 : 1 + zoom;
      return [
        { property: "scale", keyframes: [{ t: 0, value: from }, { t: 1, value: to }] },
        { property: "offsetX", keyframes: [{ t: 0, value: 0 }, { t: 1, value: driftX }] },
        { property: "offsetY", keyframes: [{ t: 0, value: 0 }, { t: 1, value: driftY }] }
      ];
    }
  },
  {
    id: "float",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "linear",
    params: [
      { name: "amplitude", default: 0.015, min: 0, max: 0.2 },
      { name: "frequency", default: 1, min: 0.1, max: 8 },
      { name: "seed", default: 0, min: 0, max: 1000000 }
    ],
    describe:
      "Gentle vertical bob (loops seamlessly); `frequency` sets bobs per " +
      "period, `seed` blends in organic drift instead of a pure sine.",
    curves: (params, canvas, _role, durationMs) => {
      const amp = num(params, "amplitude", 0.015) * canvas.height;
      const frequency = Math.max(0.01, num(params, "frequency", 1));
      const seed = Math.round(num(params, "seed", 0));
      const windowMs = durationMs ?? 3000;
      const count = sampleCountFor(windowMs, frequency, {
        min: 9,
        max: MAX_CUSTOM_KEYFRAMES
      });
      // The oscillation itself always closes on a whole cycle — sin(2π·n) = 0
      // for integer n — so the loop is seamless regardless of a fractional
      // `frequency`; the unrounded value only steers sample/lattice density.
      const cycles = Math.max(1, Math.round(frequency));
      let lattice: number[] | null = null;
      if (seed !== 0) {
        const latticeCount = Math.max(4, Math.min(64, Math.round(frequency * 8)));
        lattice = buildNoiseLattice(mulberry32(seed), latticeCount);
      }
      return [
        sampleCurve("offsetY", count, (t) => {
          const base = -amp * Math.sin(TWO_PI * cycles * t);
          if (!lattice) return base;
          // Circular lattice: sampleCircularLatticeNoise(lattice, 0) ===
          // sampleCircularLatticeNoise(lattice, 1), so the drift stays as
          // seamless as the sine it rides on.
          return base + amp * 0.5 * sampleCircularLatticeNoise(lattice, t);
        })
      ];
    }
  },
  {
    id: "breathe",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "linear",
    params: [{ name: "intensity", default: 0.03, min: 0, max: 0.3 }],
    describe: "Slow scale in and out (loops seamlessly).",
    curves: (params) => {
      const intensity = num(params, "intensity", 0.03);
      return [
        sampleCurve("scale", 16, (t) => 1 + intensity * (0.5 - 0.5 * Math.cos(TWO_PI * t)))
      ];
    }
  },
  {
    id: "rotate",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "linear",
    params: [{ name: "direction", default: "cw", options: ["cw", "ccw"] }],
    describe: "Continuous rotation, one turn per cycle.",
    curves: (params) => {
      const sign = str(params, "direction", "cw") === "ccw" ? -1 : 1;
      return [{ property: "rotation", keyframes: [{ t: 0, value: 0 }, { t: 1, value: sign * TWO_PI }] }];
    }
  },
  {
    id: "hueShift",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "linear",
    params: [{ name: "direction", default: "forward", options: ["forward", "reverse"] }],
    describe: "Cycle the hue through the whole color wheel, one turn per cycle.",
    curves: (params) => {
      const sign = str(params, "direction", "forward") === "reverse" ? -1 : 1;
      return [
        { property: "hue", keyframes: [{ t: 0, value: 0 }, { t: 1, value: sign * 360 }] }
      ];
    }
  },
  {
    id: "orbit",
    roles: ["loop"],
    defaultDurationMs: 3000,
    defaultEasing: "linear",
    params: [
      { name: "degrees", default: 360, min: -1440, max: 1440 },
      { name: "direction", default: "cw", options: ["cw", "ccw"] }
    ],
    describe:
      "Sweep a 3D clip's camera around the model, `degrees` per cycle. Drives cameraAzimuth, so it does nothing on a clip that is not 3D.",
    curves: (params) => {
      const degrees = num(params, "degrees", 360);
      const sign = str(params, "direction", "cw") === "ccw" ? -1 : 1;
      return [
        {
          property: "cameraAzimuth",
          keyframes: [{ t: 0, value: 0 }, { t: 1, value: sign * degrees }]
        }
      ];
    }
  },
  {
    id: "followPath",
    roles: ["emphasis", "loop"],
    defaultDurationMs: 800,
    defaultEasing: "linear",
    params: [
      { name: "d", default: "" },
      { name: "pathX", default: 0, min: 0, max: 1 },
      { name: "pathY", default: 0, min: 0, max: 1 },
      { name: "pathWidth", default: 1, min: 0, max: 1 },
      { name: "pathHeight", default: 1, min: 0, max: 1 },
      { name: "orient", default: false },
      { name: "startT", default: 0, min: 0, max: 1 },
      { name: "endT", default: 1, min: 0, max: 1 }
    ],
    describe:
      "Move along an authored SVG path (`d`, normalized 0..1 the same way " +
      "as ClipShapeStyle.d, placed in the pathX/Y/Width/Height box) from " +
      "startT to endT, sampled uniformly by arc length. Writes " +
      "positionX/positionY in canvas px; `orient` also writes rotation from " +
      "the path's tangent. Resolving an existing shape clip's `d` into " +
      "these params (by `pathClipId`) instead of authoring the path inline " +
      "is a follow-up op — this preset only takes the path literally, " +
      "because a preset compiles without the document to look a clip up in.",
    curves: (params, canvas, _role, durationMs) => {
      const d = str(params, "d", "");
      const box: PathBox = {
        x: num(params, "pathX", 0),
        y: num(params, "pathY", 0),
        width: num(params, "pathWidth", 1),
        height: num(params, "pathHeight", 1)
      };
      const orient = params.orient === true;
      const startT = Math.max(0, Math.min(1, num(params, "startT", 0)));
      const endT = Math.max(0, Math.min(1, num(params, "endT", 1)));

      const flat = flattenNormalizedPath(d, box, canvas.width, canvas.height);
      if (!flat) {
        // No usable path (empty/unparsable `d`, or zero length): drive
        // nothing rather than snapping the clip to (0, 0) — matches how an
        // unknown preset id or role compiles to no curves elsewhere (I2).
        return [];
      }

      const window = durationMs ?? 800;
      // followPath has no oscillation of its own to count cycles of; treat
      // the whole window as advancing through path positions at a nominal
      // 1 Hz, so a longer follow gets proportionally more samples to track
      // curvature.
      const count = sampleCountFor(window, FOLLOW_PATH_SAMPLE_HZ, {
        min: 5,
        max: MAX_CUSTOM_KEYFRAMES
      });

      const xs: Keyframe[] = [];
      const ys: Keyframe[] = [];
      const rotations: Keyframe[] = [];
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const u = startT + t * (endT - startT);
        const point = pointAtPathFraction(flat, u);
        if (!point) continue;
        xs.push({ t, value: point.x });
        ys.push({ t, value: point.y });
        if (orient) rotations.push({ t, value: point.angle });
      }

      const curves: PropertyCurve[] = [
        { property: "positionX", keyframes: xs },
        { property: "positionY", keyframes: ys }
      ];
      if (orient && rotations.length > 0) {
        curves.push({ property: "rotation", keyframes: rotations });
      }
      return curves;
    }
  }
];

export const ANIMATION_PRESETS: readonly AnimationPreset[] = PRESETS;

const PRESET_BY_ID = new Map<string, AnimationPreset>(PRESETS.map((p) => [p.id, p]));

/** Look up a preset by id, or `undefined` for an unknown (newer-client) id. */
export function getAnimationPreset(id: string): AnimationPreset | undefined {
  return PRESET_BY_ID.get(id);
}

/** Fill in preset param defaults for any keys the caller omitted. */
export function resolvePresetParams(
  preset: AnimationPreset,
  raw: ResolvedParams | undefined
) {
  const resolved: ResolvedParams = {};
  for (const spec of preset.params) {
    const provided = raw?.[spec.name];
    resolved[spec.name] = provided === undefined ? spec.default : provided;
  }
  return resolved;
}
