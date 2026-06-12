import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  vignetteV1,
  colorHsbV1,
  colorColorBalanceV1,
  colorExposureToneV1,
  colorLiftGammaGainV1,
  colorCdlV1,
  colorCurvesV1,
  colorHslAdjustV1,
  colorSplitToningV1,
  colorFilmLookV1
} from "@nodetool-ai/gpu/pool";
import { pickImage, hsvToRgb } from "./lib-image-utils.js";
import { runShaderNode } from "./lib-shader-utils.js";
import { tagAsHybrid, tagAsContentCard } from "@nodetool-ai/nodes-utils";

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Cinematic film-look presets. Each resolves to a shadow/highlight tint plus
 * contrast / saturation / fade scalars that `color.filmLook@1` applies on the
 * GPU. Kept on the host because the preset is a discrete enum, not a per-pixel
 * input — the shader stays a generic grade.
 */
const FILM_PRESETS: Record<
  string,
  {
    shadow: [number, number, number];
    highlight: [number, number, number];
    contrast: number;
    saturation: number;
    fade: number;
  }
> = {
  TEAL_ORANGE: { shadow: [0.0, 0.5, 0.55], highlight: [1.0, 0.78, 0.6], contrast: 1.1, saturation: 1.1, fade: 0 },
  BLOCKBUSTER: { shadow: [0.12, 0.24, 0.35], highlight: [1.0, 0.9, 0.78], contrast: 1.2, saturation: 1.0, fade: 0 },
  NOIR: { shadow: [0.2, 0.2, 0.24], highlight: [0.86, 0.86, 0.9], contrast: 1.4, saturation: 0.3, fade: 0 },
  VINTAGE: { shadow: [0.4, 0.32, 0.24], highlight: [1.0, 0.94, 0.78], contrast: 0.9, saturation: 0.8, fade: 0.15 },
  COLD_BLUE: { shadow: [0.16, 0.24, 0.4], highlight: [0.78, 0.86, 1.0], contrast: 1.1, saturation: 0.9, fade: 0 },
  WARM_SUNSET: { shadow: [0.47, 0.24, 0.16], highlight: [1.0, 0.86, 0.7], contrast: 1.0, saturation: 1.3, fade: 0 },
  MATRIX: { shadow: [0.0, 0.16, 0.0], highlight: [0.6, 1.0, 0.6], contrast: 1.3, saturation: 0.7, fade: 0 },
  BLEACH_BYPASS: { shadow: [0.24, 0.24, 0.27], highlight: [0.94, 0.94, 0.98], contrast: 1.5, saturation: 0.5, fade: 0.05 },
  CROSS_PROCESS: { shadow: [0.0, 0.2, 0.3], highlight: [1.0, 0.9, 0.5], contrast: 1.2, saturation: 1.2, fade: 0 },
  FADED_FILM: { shadow: [0.3, 0.28, 0.26], highlight: [0.95, 0.92, 0.88], contrast: 0.85, saturation: 0.7, fade: 0.2 }
};

/**
 * Normalized hue windows (`[lo, hi]` in turns) for `HSLAdjust`'s color-range
 * selector. `lo > hi` denotes a window that wraps past 1.0 (reds). `ALL` uses
 * `useRange = 0` and ignores the window. Mirrors the legacy CPU table.
 */
const HUE_RANGES: Record<string, [number, number]> = {
  ALL: [0, 1],
  REDS: [0.95, 0.05],
  ORANGES: [0.02, 0.1],
  YELLOWS: [0.1, 0.18],
  GREENS: [0.18, 0.45],
  CYANS: [0.45, 0.55],
  BLUES: [0.55, 0.72],
  PURPLES: [0.72, 0.83],
  MAGENTAS: [0.83, 0.95]
};

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  inlineFields: string[];
  inputFields:  string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

function createColorGradingNode(desc: Desc): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly inlineFields = desc.inlineFields;
    static readonly inputFields  = desc.inputFields;
    static readonly metadataOutputTypes = desc.outputs;

    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const t = desc.nodeType;
      const props = this.serialize() as Record<string, unknown>;

      const baseObj = pickImage(props, props);
      // Emit raw-RGBA (`runShaderNode`) instead of re-encoding to PNG at every
      // node. Chained shader nodes read it via `decodeRgba`'s raw passthrough,
      // so the pipeline stays in raw pixels — the PNG encode happens once, at
      // the display/save boundary, not on every hop (the round-trip that made a
      // Curves→BrightnessContrast drag slow). `runShaderNode` no-ops to an empty
      // image when the source is missing, so no explicit empty guard is needed.
      const emit = (output: unknown) => ({ output });

      if (t.endsWith(".ColorBalance")) {
        return emit(
          await runShaderNode(
            colorColorBalanceV1,
            { temperature: num(props.temperature, 0), tint: num(props.tint, 0) },
            baseObj,
            {},
            context
          )
        );
      }

      // The full tonal path (exposure + contrast + highlights/shadows/whites/
      // blacks) runs in one shader pass; with every tonal knob at 0 it
      // collapses to a pure `rgb * 2^exposure`.
      if (t.endsWith(".Exposure")) {
        return emit(
          await runShaderNode(
            colorExposureToneV1,
            {
              exposure: num(props.exposure, 0),
              contrast: num(props.contrast, 0),
              highlights: num(props.highlights, 0),
              shadows: num(props.shadows, 0),
              whites: num(props.whites, 0),
              blacks: num(props.blacks, 0)
            },
            baseObj,
            {},
            context
          )
        );
      }

      // Vibrance is folded into saturation as an additive boost — the published
      // HSB shader has no separate skin-tone-protected channel.
      if (t.endsWith(".SaturationVibrance")) {
        const saturation = num(props.saturation, 0);
        const vibrance = num(props.vibrance, 0);
        return emit(
          await runShaderNode(
            colorHsbV1,
            {
              hue: 0,
              saturation: 1 + saturation + vibrance * 0.5,
              brightness: 1
            },
            baseObj,
            {},
            context
          )
        );
      }

      if (t.endsWith(".LiftGammaGain")) {
        return emit(
          await runShaderNode(
            colorLiftGammaGainV1,
            {
              liftR: num(props.lift_r, 0),
              liftG: num(props.lift_g, 0),
              liftB: num(props.lift_b, 0),
              liftMaster: num(props.lift_master, 0),
              gammaR: num(props.gamma_r, 1),
              gammaG: num(props.gamma_g, 1),
              gammaB: num(props.gamma_b, 1),
              gammaMaster: num(props.gamma_master, 1),
              gainR: num(props.gain_r, 1),
              gainG: num(props.gain_g, 1),
              gainB: num(props.gain_b, 1),
              gainMaster: num(props.gain_master, 1)
            },
            baseObj,
            {},
            context
          )
        );
      }

      if (t.endsWith(".CDL")) {
        return emit(
          await runShaderNode(
            colorCdlV1,
            {
              slopeR: num(props.slope_r, 1),
              slopeG: num(props.slope_g, 1),
              slopeB: num(props.slope_b, 1),
              offsetR: num(props.offset_r, 0),
              offsetG: num(props.offset_g, 0),
              offsetB: num(props.offset_b, 0),
              powerR: num(props.power_r, 1),
              powerG: num(props.power_g, 1),
              powerB: num(props.power_b, 1),
              saturation: num(props.saturation, 1)
            },
            baseObj,
            {},
            context
          )
        );
      }

      if (t.endsWith(".Curves")) {
        return emit(
          await runShaderNode(
            colorCurvesV1,
            {
              blackPoint: num(props.black_point, 0),
              whitePoint: num(props.white_point, 1),
              shadows: num(props.shadows, 0),
              midtones: num(props.midtones, 0),
              highlights: num(props.highlights, 0),
              redMidtones: num(props.red_midtones, 0),
              greenMidtones: num(props.green_midtones, 0),
              blueMidtones: num(props.blue_midtones, 0)
            },
            baseObj,
            {},
            context
          )
        );
      }

      // `color_range === "ALL"` applies to every pixel (useRange 0); the named
      // ranges gate the adjustment by per-pixel hue proximity inside the shader.
      if (t.endsWith(".HSLAdjust")) {
        const colorRange = String(props.color_range ?? "all").toUpperCase();
        const [lo, hi] = HUE_RANGES[colorRange] ?? HUE_RANGES.ALL;
        return emit(
          await runShaderNode(
            colorHslAdjustV1,
            {
              hueShift: num(props.hue_shift, 0),
              satAdj: num(props.saturation, 0),
              lumAdj: num(props.luminance, 0),
              rangeLo: lo,
              rangeHi: hi,
              useRange: colorRange === "ALL" ? 0 : 1
            },
            baseObj,
            {},
            context
          )
        );
      }

      // Resolve the shadow/highlight hues to RGB tint colours on the host; the
      // shader weights them toward shadows/highlights by a balance-shifted mask.
      if (t.endsWith(".SplitToning")) {
        const [sr, sg, sb] = hsvToRgb(num(props.shadow_hue, 200) / 360, 1, 1);
        const [hr, hg, hb] = hsvToRgb(num(props.highlight_hue, 40) / 360, 1, 1);
        return emit(
          await runShaderNode(
            colorSplitToningV1,
            {
              shadowColor: d.vec3f(sr, sg, sb),
              shadowSat: num(props.shadow_saturation, 0.3),
              highlightColor: d.vec3f(hr, hg, hb),
              highlightSat: num(props.highlight_saturation, 0.3),
              balance: num(props.balance, 0)
            },
            baseObj,
            {},
            context
          )
        );
      }

      if (t.endsWith(".FilmLook")) {
        const preset = String(props.preset ?? "teal_orange").toUpperCase();
        const p = FILM_PRESETS[preset] ?? FILM_PRESETS.TEAL_ORANGE;
        return emit(
          await runShaderNode(
            colorFilmLookV1,
            {
              shadow: d.vec3f(p.shadow[0], p.shadow[1], p.shadow[2]),
              highlight: d.vec3f(p.highlight[0], p.highlight[1], p.highlight[2]),
              contrast: p.contrast,
              saturation: p.saturation,
              fade: p.fade,
              intensity: num(props.intensity, 1)
            },
            baseObj,
            {},
            context
          )
        );
      }

      // Shader `intensity` maps to the legacy `amount`; midpoint/feather map
      // onto the shader's `radius` (where the vignette begins) and `softness`.
      if (t.endsWith(".Vignette")) {
        const midpoint = num(props.midpoint, 0.5);
        const feather = Math.max(0.01, num(props.feather, 0.5));
        return emit(
          await runShaderNode(
            vignetteV1,
            {
              intensity: num(props.amount, 0.5),
              radius: 1 - midpoint,
              softness: feather
            },
            baseObj,
            {},
            context
          )
        );
      }

      // Unknown grade type — pass the source through unchanged.
      return { output: baseObj ?? {} };
    }
  };

  for (const property of desc.properties) {
    registerDeclaredProperty(C, property.name, property.options);
  }

  return C as NodeClass;
}

const DESCRIPTORS: readonly Desc[] = [
  {
    nodeType: "lib.image.color_grading.CDL",
    title: "CDL",
    description:
      "ASC CDL (Color Decision List) color correction.\n    cdl, slope, offset, power, saturation, asc, color decision list\n\n    Use cases:\n    - Apply industry-standard CDL color correction\n    - Exchange color grades between different software\n    - Apply precise mathematical color transformations\n    - Create consistent looks across multiple shots\n\n    Formula: output = (input * slope + offset) ^ power\n    Followed by saturation adjustment.",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to color correct."
        }
      },
      {
        name: "slope_r",
        options: {
          type: "float",
          default: 1,
          title: "Slope R",
          description: "Red slope (multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "slope_g",
        options: {
          type: "float",
          default: 1,
          title: "Slope G",
          description: "Green slope (multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "slope_b",
        options: {
          type: "float",
          default: 1,
          title: "Slope B",
          description: "Blue slope (multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "offset_r",
        options: {
          type: "float",
          default: 0,
          title: "Offset R",
          description: "Red offset (addition).",
          min: -1,
          max: 1
        }
      },
      {
        name: "offset_g",
        options: {
          type: "float",
          default: 0,
          title: "Offset G",
          description: "Green offset (addition).",
          min: -1,
          max: 1
        }
      },
      {
        name: "offset_b",
        options: {
          type: "float",
          default: 0,
          title: "Offset B",
          description: "Blue offset (addition).",
          min: -1,
          max: 1
        }
      },
      {
        name: "power_r",
        options: {
          type: "float",
          default: 1,
          title: "Power R",
          description: "Red power (gamma).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "power_g",
        options: {
          type: "float",
          default: 1,
          title: "Power G",
          description: "Green power (gamma).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "power_b",
        options: {
          type: "float",
          default: 1,
          title: "Power B",
          description: "Blue power (gamma).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "saturation",
        options: {
          type: "float",
          default: 1,
          title: "Saturation",
          description: "Saturation adjustment.",
          min: 0,
          max: 4
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.ColorBalance",
    title: "Color Balance",
    description:
      "Adjust color temperature and tint for white balance correction.\n    white balance, temperature, tint, color balance, warm, cool\n\n    Use cases:\n    - Correct white balance in photos and video\n    - Warm up or cool down the overall image\n    - Fix color casts from mixed lighting\n    - Create mood through color temperature shifts",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust."
        }
      },
      {
        name: "temperature",
        options: {
          type: "float",
          default: 0,
          title: "Temperature",
          description:
            "Color temperature. Positive = warmer (orange), negative = cooler (blue).",
          min: -1,
          max: 1
        }
      },
      {
        name: "tint",
        options: {
          type: "float",
          default: 0,
          title: "Tint",
          description: "Color tint. Positive = magenta, negative = green.",
          min: -1,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.Curves",
    title: "Curves",
    description:
      "RGB curves adjustment with control points for precise tonal control.\n    curves, rgb, tonal, contrast, levels\n\n    Use cases:\n    - Create custom contrast curves\n    - Adjust specific tonal ranges precisely\n    - Create cross-processed or stylized looks\n    - Match the tonal characteristics of film stocks",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust."
        }
      },
      {
        name: "black_point",
        options: {
          type: "float",
          default: 0,
          title: "Black Point",
          description: "Black point (input level that maps to 0).",
          min: 0,
          max: 0.5
        }
      },
      {
        name: "white_point",
        options: {
          type: "float",
          default: 1,
          title: "White Point",
          description: "White point (input level that maps to 1).",
          min: 0.5,
          max: 1
        }
      },
      {
        name: "shadows",
        options: {
          type: "float",
          default: 0,
          title: "Shadows",
          description: "Shadow curve adjustment.",
          min: -0.5,
          max: 0.5
        }
      },
      {
        name: "midtones",
        options: {
          type: "float",
          default: 0,
          title: "Midtones",
          description: "Midtone gamma adjustment.",
          min: -0.5,
          max: 0.5
        }
      },
      {
        name: "highlights",
        options: {
          type: "float",
          default: 0,
          title: "Highlights",
          description: "Highlight curve adjustment.",
          min: -0.5,
          max: 0.5
        }
      },
      {
        name: "red_midtones",
        options: {
          type: "float",
          default: 0,
          title: "Red Midtones",
          description: "Red channel midtone adjustment.",
          min: -0.5,
          max: 0.5
        }
      },
      {
        name: "green_midtones",
        options: {
          type: "float",
          default: 0,
          title: "Green Midtones",
          description: "Green channel midtone adjustment.",
          min: -0.5,
          max: 0.5
        }
      },
      {
        name: "blue_midtones",
        options: {
          type: "float",
          default: 0,
          title: "Blue Midtones",
          description: "Blue channel midtone adjustment.",
          min: -0.5,
          max: 0.5
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.Exposure",
    title: "Exposure",
    description:
      "Comprehensive tonal exposure controls similar to Lightroom/Camera Raw.\n    exposure, contrast, highlights, shadows, whites, blacks, tonal\n\n    Use cases:\n    - Correct over/underexposed images\n    - Recover highlight and shadow detail\n    - Adjust overall contrast and tonal range\n    - Fine-tune the brightness of specific tonal regions",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust."
        }
      },
      {
        name: "exposure",
        options: {
          type: "float",
          default: 0,
          title: "Exposure",
          description:
            "Exposure in stops. 1 = double brightness, -1 = half brightness.",
          min: -5,
          max: 5
        }
      },
      {
        name: "contrast",
        options: {
          type: "float",
          default: 0,
          title: "Contrast",
          description:
            "Contrast adjustment. Positive = more contrast, negative = less.",
          min: -1,
          max: 1
        }
      },
      {
        name: "highlights",
        options: {
          type: "float",
          default: 0,
          title: "Highlights",
          description: "Highlight recovery/boost. Affects brightest areas.",
          min: -1,
          max: 1
        }
      },
      {
        name: "shadows",
        options: {
          type: "float",
          default: 0,
          title: "Shadows",
          description: "Shadow recovery/darken. Affects darkest areas.",
          min: -1,
          max: 1
        }
      },
      {
        name: "whites",
        options: {
          type: "float",
          default: 0,
          title: "Whites",
          description: "White point adjustment. Sets the brightest white.",
          min: -1,
          max: 1
        }
      },
      {
        name: "blacks",
        options: {
          type: "float",
          default: 0,
          title: "Blacks",
          description: "Black point adjustment. Sets the darkest black.",
          min: -1,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.FilmLook",
    title: "Film Look",
    description:
      "Apply preset cinematic film looks with adjustable intensity.\n    film look, cinematic, preset, movie, lut, color grade\n\n    Use cases:\n    - Quickly apply popular cinematic color grades\n    - Create consistent looks across multiple images\n    - Emulate classic film stock characteristics\n    - Starting point for custom color grading",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to apply the film look to."
        }
      },
      {
        name: "preset",
        options: {
          type: "enum",
          default: "teal_orange",
          title: "Preset",
          description: "The cinematic look to apply.",
          values: [
            "teal_orange",
            "blockbuster",
            "noir",
            "vintage",
            "cold_blue",
            "warm_sunset",
            "matrix",
            "bleach_bypass",
            "cross_process",
            "faded_film"
          ]
        }
      },
      {
        name: "intensity",
        options: {
          type: "float",
          default: 1,
          title: "Intensity",
          description:
            "Intensity of the effect. 0=none, 1=full, 2=exaggerated.",
          min: 0,
          max: 2
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.HSLAdjust",
    title: "HSLAdjust",
    description:
      "Adjust hue, saturation, and luminance for specific color ranges.\n    hsl, hue, saturation, luminance, selective color, color range\n\n    Use cases:\n    - Shift specific colors (e.g., make blues more cyan)\n    - Desaturate or boost individual color ranges\n    - Brighten or darken specific colors\n    - Create color-specific looks (teal skies, orange skin)",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust."
        }
      },
      {
        name: "color_range",
        options: {
          type: "enum",
          default: "all",
          title: "Color Range",
          description: "The color range to adjust.",
          values: [
            "all",
            "reds",
            "oranges",
            "yellows",
            "greens",
            "cyans",
            "blues",
            "purples",
            "magentas"
          ]
        }
      },
      {
        name: "hue_shift",
        options: {
          type: "float",
          default: 0,
          title: "Hue Shift",
          description:
            "Hue shift for the selected color range. -1 to 1 = -180 to +180 degrees.",
          min: -1,
          max: 1
        }
      },
      {
        name: "saturation",
        options: {
          type: "float",
          default: 0,
          title: "Saturation",
          description: "Saturation adjustment for the selected color range.",
          min: -1,
          max: 1
        }
      },
      {
        name: "luminance",
        options: {
          type: "float",
          default: 0,
          title: "Luminance",
          description: "Luminance adjustment for the selected color range.",
          min: -1,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.LiftGammaGain",
    title: "Lift Gamma Gain",
    description:
      "Three-way color corrector for shadows, midtones, and highlights.\n    lift, gamma, gain, color wheels, primary correction, shadows, midtones, highlights\n\n    Use cases:\n    - Apply the industry-standard three-way color correction\n    - Balance colors across different tonal ranges\n    - Create color contrast between shadows and highlights\n    - Match footage from different sources\n\n    Lift affects shadows, Gamma affects midtones, Gain affects highlights.\n    Each control adjusts both luminance and color for its tonal range.",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to color correct."
        }
      },
      {
        name: "lift_r",
        options: {
          type: "float",
          default: 0,
          title: "Lift R",
          description: "Red lift (shadow color shift).",
          min: -1,
          max: 1
        }
      },
      {
        name: "lift_g",
        options: {
          type: "float",
          default: 0,
          title: "Lift G",
          description: "Green lift (shadow color shift).",
          min: -1,
          max: 1
        }
      },
      {
        name: "lift_b",
        options: {
          type: "float",
          default: 0,
          title: "Lift B",
          description: "Blue lift (shadow color shift).",
          min: -1,
          max: 1
        }
      },
      {
        name: "lift_master",
        options: {
          type: "float",
          default: 0,
          title: "Lift Master",
          description: "Master lift (shadow brightness).",
          min: -1,
          max: 1
        }
      },
      {
        name: "gamma_r",
        options: {
          type: "float",
          default: 1,
          title: "Gamma R",
          description: "Red gamma (midtone adjustment).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "gamma_g",
        options: {
          type: "float",
          default: 1,
          title: "Gamma G",
          description: "Green gamma (midtone adjustment).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "gamma_b",
        options: {
          type: "float",
          default: 1,
          title: "Gamma B",
          description: "Blue gamma (midtone adjustment).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "gamma_master",
        options: {
          type: "float",
          default: 1,
          title: "Gamma Master",
          description: "Master gamma (overall midtones).",
          min: 0.1,
          max: 4
        }
      },
      {
        name: "gain_r",
        options: {
          type: "float",
          default: 1,
          title: "Gain R",
          description: "Red gain (highlight multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "gain_g",
        options: {
          type: "float",
          default: 1,
          title: "Gain G",
          description: "Green gain (highlight multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "gain_b",
        options: {
          type: "float",
          default: 1,
          title: "Gain B",
          description: "Blue gain (highlight multiplier).",
          min: 0,
          max: 4
        }
      },
      {
        name: "gain_master",
        options: {
          type: "float",
          default: 1,
          title: "Gain Master",
          description: "Master gain (overall brightness).",
          min: 0,
          max: 4
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.SaturationVibrance",
    title: "Saturation Vibrance",
    description:
      "Adjust color saturation with vibrance protection for skin tones.\n    saturation, vibrance, color intensity, skin tones\n\n    Use cases:\n    - Boost color intensity without clipping\n    - Protect skin tones while increasing saturation\n    - Create desaturated or oversaturated looks\n    - Fine-tune color intensity independently",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust."
        }
      },
      {
        name: "saturation",
        options: {
          type: "float",
          default: 0,
          title: "Saturation",
          description:
            "Global saturation. 0 = no change, -1 = grayscale, 1 = 2x saturation.",
          min: -1,
          max: 1
        }
      },
      {
        name: "vibrance",
        options: {
          type: "float",
          default: 0,
          title: "Vibrance",
          description:
            "Smart saturation that protects already-saturated colors and skin tones.",
          min: -1,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.SplitToning",
    title: "Split Toning",
    description:
      "Apply different color tints to shadows and highlights.\n    split toning, shadows, highlights, tint, duotone\n\n    Use cases:\n    - Create classic teal and orange looks\n    - Add color contrast between shadows and highlights\n    - Emulate film processing techniques\n    - Create stylized color-graded images",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to apply split toning to."
        }
      },
      {
        name: "shadow_hue",
        options: {
          type: "float",
          default: 200,
          title: "Shadow Hue",
          description:
            "Hue of shadow tint in degrees (0=red, 120=green, 240=blue).",
          min: 0,
          max: 360
        }
      },
      {
        name: "shadow_saturation",
        options: {
          type: "float",
          default: 0.3,
          title: "Shadow Saturation",
          description: "Saturation of shadow tint.",
          min: 0,
          max: 1
        }
      },
      {
        name: "highlight_hue",
        options: {
          type: "float",
          default: 40,
          title: "Highlight Hue",
          description: "Hue of highlight tint in degrees.",
          min: 0,
          max: 360
        }
      },
      {
        name: "highlight_saturation",
        options: {
          type: "float",
          default: 0.3,
          title: "Highlight Saturation",
          description: "Saturation of highlight tint.",
          min: 0,
          max: 1
        }
      },
      {
        name: "balance",
        options: {
          type: "float",
          default: 0,
          title: "Balance",
          description: "Balance between shadows (-1) and highlights (+1).",
          min: -1,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.color_grading.Vignette",
    title: "Vignette",
    description:
      "Apply cinematic vignette effect to darken or lighten image edges.\n    vignette, edge, darken, focus, cinematic\n\n    Use cases:\n    - Draw attention to the center of the image\n    - Create a classic cinematic look\n    - Simulate lens light falloff\n    - Add subtle framing to photos",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to apply vignette to."
        }
      },
      {
        name: "amount",
        options: {
          type: "float",
          default: 0.5,
          title: "Amount",
          description:
            "Vignette amount. Positive darkens edges, negative lightens.",
          min: -1,
          max: 1
        }
      },
      {
        name: "midpoint",
        options: {
          type: "float",
          default: 0.5,
          title: "Midpoint",
          description:
            "Distance from center where vignette begins (0=center, 1=edges).",
          min: 0,
          max: 1
        }
      },
      {
        name: "feather",
        options: {
          type: "float",
          default: 0.5,
          title: "Feather",
          description: "Softness of the vignette edge.",
          min: 0,
          max: 1
        }
      }
    ]
  }
];

export const LIB_IMAGE_COLOR_GRADING_NODES: readonly NodeClass[] = tagAsHybrid(
  tagAsContentCard(DESCRIPTORS.map(createColorGradingNode))
);
