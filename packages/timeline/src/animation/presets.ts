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
  AnimationPresetId,
  AnimationRole,
  EasingId,
  WipeDirection
} from "./types.js";
import type {
  AnimatedProperty,
  CompiledAnimationMask,
  Keyframe,
  PropertyCurve
} from "./compile.js";
import { ease } from "./easing.js";

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
  /** When set, overrides the per-role default segment easing. */
  defaultEasing?: EasingId;
  params: PresetParamSpec[];
  describe: string;
  /**
   * When true the preset runs once over the whole clip (window = full clip,
   * `holdAfter`), ignoring duration/delay. Only `kenBurns` sets this.
   */
  fullClip?: boolean;
  curves(params: ResolvedParams, canvas: Canvas, role: AnimationRole): PropertyCurve[];
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
      { name: "cycles", default: 4, min: 1, max: 12 }
    ],
    describe: "Horizontal zig-zag; starts and ends at rest.",
    curves: (params, canvas) => {
      const intensity = num(params, "intensity", 0.02);
      const cycles = Math.max(1, Math.round(num(params, "cycles", 4)));
      const amp = intensity * canvas.width;
      const count = cycles * 4 + 1;
      return [sampleCurve("offsetX", count, (t) => amp * Math.sin(TWO_PI * cycles * t))];
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
    params: [{ name: "amplitude", default: 0.015, min: 0, max: 0.2 }],
    describe: "Gentle vertical bob (loops seamlessly).",
    curves: (params, canvas) => {
      const amp = num(params, "amplitude", 0.015) * canvas.height;
      return [sampleCurve("offsetY", 16, (t) => -amp * Math.sin(TWO_PI * t))];
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
): ResolvedParams {
  const resolved: ResolvedParams = {};
  for (const spec of preset.params) {
    const provided = raw?.[spec.name];
    resolved[spec.name] = provided === undefined ? spec.default : provided;
  }
  return resolved;
}
