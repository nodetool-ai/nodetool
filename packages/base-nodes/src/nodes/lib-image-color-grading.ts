import { BaseNode, registerDeclaredProperty } from "@nodetool/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import sharp from "sharp";
import {
  decodeImage,
  toRef,
  pickImage,
  toFloatRGB,
  fromFloatRGB,
  clamp,
  getLuminance,
  rgbToHsv,
  hsvToRgb
} from "./lib-image-utils.js";

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  basicFields: string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

function createColorGradingNode(desc: Desc): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly basicFields = desc.basicFields;
    static readonly metadataOutputTypes = desc.outputs;

    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const t = desc.nodeType;
      const self = this as unknown as Record<string, unknown>;

      const baseObj = pickImage(this.serialize(), this.serialize());
      const baseBytes = await decodeImage(baseObj, context);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      // ColorBalance
      if (t.endsWith(".ColorBalance")) {
        const temperature = Number(
          (this as any).temperature ?? self.temperature ?? 0
        );
        const tint = Number((this as any).tint ?? self.tint ?? 0);
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const tempShift = temperature * 0.3;
        const tintShift = tint * 0.3;
        for (let i = 0; i < data.length; i += 3) {
          data[i] += tempShift + tintShift * 0.5;
          data[i + 1] -= tintShift;
          data[i + 2] = data[i + 2] - tempShift + tintShift * 0.5;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // Exposure
      if (t.endsWith(".Exposure")) {
        const exposure = Number((this as any).exposure ?? self.exposure ?? 0);
        const contrast = Number((this as any).contrast ?? self.contrast ?? 0);
        const highlights = Number(
          (this as any).highlights ?? self.highlights ?? 0
        );
        const shadows = Number((this as any).shadows ?? self.shadows ?? 0);
        const whites = Number((this as any).whites ?? self.whites ?? 0);
        const blacks = Number((this as any).blacks ?? self.blacks ?? 0);
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const expMul = Math.pow(2, exposure);
        for (let i = 0; i < data.length; i += 3) {
          let r = data[i] * expMul,
            g = data[i + 1] * expMul,
            b = data[i + 2] * expMul;
          const lum = getLuminance(r, g, b);
          const hlMask = clamp((lum - 0.5) * 2, 0, 1);
          const shMask = clamp((0.5 - lum) * 2, 0, 1);
          r -= hlMask * highlights * 0.5;
          r += shMask * shadows * 0.5;
          g -= hlMask * highlights * 0.5;
          g += shMask * shadows * 0.5;
          b -= hlMask * highlights * 0.5;
          b += shMask * shadows * 0.5;
          r += whites * 0.2 * r;
          r += blacks * 0.2 * (1 - r);
          g += whites * 0.2 * g;
          g += blacks * 0.2 * (1 - g);
          b += whites * 0.2 * b;
          b += blacks * 0.2 * (1 - b);
          data[i] = 0.5 + (r - 0.5) * (1 + contrast);
          data[i + 1] = 0.5 + (g - 0.5) * (1 + contrast);
          data[i + 2] = 0.5 + (b - 0.5) * (1 + contrast);
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // SaturationVibrance
      if (t.endsWith(".SaturationVibrance")) {
        const saturation = Number(
          (this as any).saturation ?? self.saturation ?? 0
        );
        const vibrance = Number((this as any).vibrance ?? self.vibrance ?? 0);
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        for (let i = 0; i < data.length; i += 3) {
          let r = data[i],
            g = data[i + 1],
            b = data[i + 2];
          const lum = getLuminance(r, g, b);
          // Saturation
          r = lum + (r - lum) * (1 + saturation);
          g = lum + (g - lum) * (1 + saturation);
          b = lum + (b - lum) * (1 + saturation);
          // Vibrance
          if (vibrance !== 0) {
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const curSat = (maxC - minC) / (maxC + 0.001);
            const mask = 1 - curSat;
            const vFactor = 1 + vibrance * mask;
            const lum2 = getLuminance(r, g, b);
            r = lum2 + (r - lum2) * vFactor;
            g = lum2 + (g - lum2) * vFactor;
            b = lum2 + (b - lum2) * vFactor;
          }
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // LiftGammaGain
      if (t.endsWith(".LiftGammaGain")) {
        const liftR = Number((this as any).lift_r ?? self.lift_r ?? 0);
        const liftG = Number((this as any).lift_g ?? self.lift_g ?? 0);
        const liftB = Number((this as any).lift_b ?? self.lift_b ?? 0);
        const liftM = Number(
          (this as any).lift_master ?? self.lift_master ?? 0
        );
        const gammaR = Number((this as any).gamma_r ?? self.gamma_r ?? 1);
        const gammaG = Number((this as any).gamma_g ?? self.gamma_g ?? 1);
        const gammaB = Number((this as any).gamma_b ?? self.gamma_b ?? 1);
        const gammaM = Number(
          (this as any).gamma_master ?? self.gamma_master ?? 1
        );
        const gainR = Number((this as any).gain_r ?? self.gain_r ?? 1);
        const gainG = Number((this as any).gain_g ?? self.gain_g ?? 1);
        const gainB = Number((this as any).gain_b ?? self.gain_b ?? 1);
        const gainM = Number(
          (this as any).gain_master ?? self.gain_master ?? 1
        );
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        for (let i = 0; i < data.length; i += 3) {
          const r = data[i] * gainR * gainM + liftR + liftM;
          const g = data[i + 1] * gainG * gainM + liftG + liftM;
          const b = data[i + 2] * gainB * gainM + liftB + liftM;
          const gr = 1 / Math.max(0.01, gammaR * gammaM);
          const gg = 1 / Math.max(0.01, gammaG * gammaM);
          const gb = 1 / Math.max(0.01, gammaB * gammaM);
          data[i] = r > 0 ? Math.pow(r, gr) : 0;
          data[i + 1] = g > 0 ? Math.pow(g, gg) : 0;
          data[i + 2] = b > 0 ? Math.pow(b, gb) : 0;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // CDL
      if (t.endsWith(".CDL")) {
        const slopeR = Number((this as any).slope_r ?? self.slope_r ?? 1);
        const slopeG = Number((this as any).slope_g ?? self.slope_g ?? 1);
        const slopeB = Number((this as any).slope_b ?? self.slope_b ?? 1);
        const offsetR = Number((this as any).offset_r ?? self.offset_r ?? 0);
        const offsetG = Number((this as any).offset_g ?? self.offset_g ?? 0);
        const offsetB = Number((this as any).offset_b ?? self.offset_b ?? 0);
        const powerR = Number((this as any).power_r ?? self.power_r ?? 1);
        const powerG = Number((this as any).power_g ?? self.power_g ?? 1);
        const powerB = Number((this as any).power_b ?? self.power_b ?? 1);
        const sat = Number((this as any).saturation ?? self.saturation ?? 1);
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        for (let i = 0; i < data.length; i += 3) {
          let r = clamp(data[i] * slopeR + offsetR, 0, 1);
          let g = clamp(data[i + 1] * slopeG + offsetG, 0, 1);
          let b = clamp(data[i + 2] * slopeB + offsetB, 0, 1);
          r = Math.pow(r, powerR);
          g = Math.pow(g, powerG);
          b = Math.pow(b, powerB);
          const lum = getLuminance(r, g, b);
          data[i] = lum + (r - lum) * sat;
          data[i + 1] = lum + (g - lum) * sat;
          data[i + 2] = lum + (b - lum) * sat;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // Curves
      if (t.endsWith(".Curves")) {
        const blackPoint = Number(
          (this as any).black_point ?? self.black_point ?? 0
        );
        const whitePoint = Number(
          (this as any).white_point ?? self.white_point ?? 1
        );
        const shadowsV = Number((this as any).shadows ?? self.shadows ?? 0);
        const midtones = Number((this as any).midtones ?? self.midtones ?? 0);
        const highlightsV = Number(
          (this as any).highlights ?? self.highlights ?? 0
        );
        const redMid = Number(
          (this as any).red_midtones ?? self.red_midtones ?? 0
        );
        const greenMid = Number(
          (this as any).green_midtones ?? self.green_midtones ?? 0
        );
        const blueMid = Number(
          (this as any).blue_midtones ?? self.blue_midtones ?? 0
        );
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const range = Math.max(0.001, whitePoint - blackPoint);
        const gammaAll = 1 / Math.max(0.01, 1 + midtones);
        const gammaRed = 1 / Math.max(0.01, 1 + redMid);
        const gammaGreen = 1 / Math.max(0.01, 1 + greenMid);
        const gammaBlue = 1 / Math.max(0.01, 1 + blueMid);
        for (let i = 0; i < data.length; i += 3) {
          let r = clamp((data[i] - blackPoint) / range, 0, 1);
          let g = clamp((data[i + 1] - blackPoint) / range, 0, 1);
          let b = clamp((data[i + 2] - blackPoint) / range, 0, 1);
          // Shadows
          r += shadowsV * (1 - r) * r;
          g += shadowsV * (1 - g) * g;
          b += shadowsV * (1 - b) * b;
          // Midtones (global gamma)
          r = Math.pow(Math.max(0, r), gammaAll);
          g = Math.pow(Math.max(0, g), gammaAll);
          b = Math.pow(Math.max(0, b), gammaAll);
          // Highlights
          r += highlightsV * r * (1 - r);
          g += highlightsV * g * (1 - g);
          b += highlightsV * b * (1 - b);
          // Per-channel gamma
          data[i] = Math.pow(Math.max(0, r), gammaRed);
          data[i + 1] = Math.pow(Math.max(0, g), gammaGreen);
          data[i + 2] = Math.pow(Math.max(0, b), gammaBlue);
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // HSLAdjust
      if (t.endsWith(".HSLAdjust")) {
        const colorRange = String(
          (this as any).color_range ?? self.color_range ?? "ALL"
        ).toUpperCase();
        const hueShift = Number((this as any).hue_shift ?? self.hue_shift ?? 0);
        const satAdj = Number((this as any).saturation ?? self.saturation ?? 0);
        const lumAdj = Number((this as any).luminance ?? self.luminance ?? 0);
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
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const hueRange = HUE_RANGES[colorRange] ?? HUE_RANGES.ALL;
        for (let i = 0; i < data.length; i += 3) {
          let [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
          let blend = 1;
          if (colorRange !== "ALL") {
            if (s < 0.1) {
              blend = 0;
            } else {
              const [lo, hi] = hueRange;
              if (lo > hi) {
                // wraps around (REDS)
                blend = h >= lo || h <= hi ? 1 : 0;
                if (blend === 1) {
                  const center = (lo + (1 - lo + hi) / 2) % 1;
                  let dist = Math.abs(h - center);
                  if (dist > 0.5) dist = 1 - dist;
                  const halfWidth = (1 - lo + hi) / 2;
                  blend = clamp(1 - dist / halfWidth, 0, 1);
                }
              } else {
                const center = (lo + hi) / 2;
                const halfWidth = (hi - lo) / 2;
                const dist = Math.abs(h - center);
                blend = clamp(1 - dist / halfWidth, 0, 1);
              }
            }
          }
          if (blend > 0) {
            h = (h + hueShift * 0.5 * blend + 1) % 1;
            s = clamp(s * (1 + satAdj * blend), 0, 1);
            v = clamp(v * (1 + lumAdj * blend), 0, 1);
          }
          const [r, g, b] = hsvToRgb(h, s, v);
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // SplitToning
      if (t.endsWith(".SplitToning")) {
        const shadowHue = Number(
          (this as any).shadow_hue ?? self.shadow_hue ?? 30
        );
        const shadowSat = Number(
          (this as any).shadow_saturation ?? self.shadow_saturation ?? 0.5
        );
        const highlightHue = Number(
          (this as any).highlight_hue ?? self.highlight_hue ?? 200
        );
        const highlightSat = Number(
          (this as any).highlight_saturation ?? self.highlight_saturation ?? 0.5
        );
        const balance = Number((this as any).balance ?? self.balance ?? 0);
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const [sr, sg, sb] = hsvToRgb(shadowHue / 360, 1, 1);
        const [hr, hg, hb] = hsvToRgb(highlightHue / 360, 1, 1);
        const balOff = balance * 0.25;
        for (let i = 0; i < data.length; i += 3) {
          const lum = getLuminance(data[i], data[i + 1], data[i + 2]);
          const shMask = clamp((0.5 + balOff - lum) * 2, 0, 1);
          const hlMask = clamp((lum - 0.5 + balOff) * 2, 0, 1);
          data[i] +=
            shMask * (sr - 0.5) * shadowSat +
            hlMask * (hr - 0.5) * highlightSat;
          data[i + 1] +=
            shMask * (sg - 0.5) * shadowSat +
            hlMask * (hg - 0.5) * highlightSat;
          data[i + 2] +=
            shMask * (sb - 0.5) * shadowSat +
            hlMask * (hb - 0.5) * highlightSat;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // FilmLook
      if (t.endsWith(".FilmLook")) {
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
          TEAL_ORANGE: {
            shadow: [0.0, 0.4, 0.5],
            highlight: [1.0, 0.7, 0.3],
            contrast: 1.1,
            saturation: 1.15,
            fade: 0
          },
          BLOCKBUSTER: {
            shadow: [0.0, 0.2, 0.4],
            highlight: [1.0, 0.8, 0.5],
            contrast: 1.2,
            saturation: 0.9,
            fade: 0
          },
          NOIR: {
            shadow: [0.1, 0.1, 0.15],
            highlight: [0.9, 0.9, 0.85],
            contrast: 1.3,
            saturation: 0.0,
            fade: 0
          },
          VINTAGE: {
            shadow: [0.3, 0.2, 0.1],
            highlight: [1.0, 0.95, 0.8],
            contrast: 0.9,
            saturation: 0.7,
            fade: 0.1
          },
          COLD_BLUE: {
            shadow: [0.1, 0.15, 0.3],
            highlight: [0.7, 0.8, 1.0],
            contrast: 1.05,
            saturation: 0.85,
            fade: 0
          },
          WARM_SUNSET: {
            shadow: [0.3, 0.1, 0.0],
            highlight: [1.0, 0.7, 0.3],
            contrast: 1.05,
            saturation: 1.2,
            fade: 0
          },
          MATRIX: {
            shadow: [0.0, 0.15, 0.0],
            highlight: [0.5, 1.0, 0.5],
            contrast: 1.15,
            saturation: 0.6,
            fade: 0
          },
          BLEACH_BYPASS: {
            shadow: [0.2, 0.2, 0.2],
            highlight: [0.9, 0.9, 0.9],
            contrast: 1.4,
            saturation: 0.4,
            fade: 0
          },
          CROSS_PROCESS: {
            shadow: [0.1, 0.3, 0.0],
            highlight: [1.0, 0.8, 0.2],
            contrast: 1.1,
            saturation: 1.3,
            fade: 0
          },
          FADED_FILM: {
            shadow: [0.2, 0.15, 0.1],
            highlight: [0.95, 0.9, 0.85],
            contrast: 0.85,
            saturation: 0.75,
            fade: 0.15
          }
        };
        const preset = String(
          (this as any).preset ?? self.preset ?? "TEAL_ORANGE"
        ).toUpperCase();
        const intensity = Number(
          (this as any).intensity ?? self.intensity ?? 1
        );
        const p = FILM_PRESETS[preset] ?? FILM_PRESETS.TEAL_ORANGE;
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        for (let i = 0; i < data.length; i += 3) {
          const origR = data[i],
            origG = data[i + 1],
            origB = data[i + 2];
          let r = origR,
            g = origG,
            b = origB;
          const lum = getLuminance(r, g, b);
          const shMask = clamp(1 - lum * 2, 0, 1);
          const hlMask = clamp(lum * 2 - 1, 0, 1);
          r +=
            shMask * (p.shadow[0] - 0.5) * 0.3 +
            hlMask * (p.highlight[0] - 0.5) * 0.3;
          g +=
            shMask * (p.shadow[1] - 0.5) * 0.3 +
            hlMask * (p.highlight[1] - 0.5) * 0.3;
          b +=
            shMask * (p.shadow[2] - 0.5) * 0.3 +
            hlMask * (p.highlight[2] - 0.5) * 0.3;
          r = (r - 0.5) * p.contrast + 0.5;
          g = (g - 0.5) * p.contrast + 0.5;
          b = (b - 0.5) * p.contrast + 0.5;
          const lum2 = getLuminance(r, g, b);
          r = lum2 + (r - lum2) * p.saturation;
          g = lum2 + (g - lum2) * p.saturation;
          b = lum2 + (b - lum2) * p.saturation;
          if (p.fade > 0) {
            r = r * (1 - p.fade) + p.fade * 0.15;
            g = g * (1 - p.fade) + p.fade * 0.15;
            b = b * (1 - p.fade) + p.fade * 0.15;
          }
          data[i] = origR + (r - origR) * intensity;
          data[i + 1] = origG + (g - origG) * intensity;
          data[i + 2] = origB + (b - origB) * intensity;
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // Vignette
      if (t.endsWith(".Vignette")) {
        const amount = Number((this as any).amount ?? self.amount ?? 0.5);
        const midpoint = Number((this as any).midpoint ?? self.midpoint ?? 0.5);
        const roundness = Number(
          (this as any).roundness ?? self.roundness ?? 0
        );
        const feather = Math.max(
          0.01,
          Number((this as any).feather ?? self.feather ?? 0.4)
        );
        const { data, width, height, alpha } = await toFloatRGB(baseBytes);
        const cx = width / 2,
          cy = height / 2;
        const halfW = width / 2,
          halfH = height / 2;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const normX = (x - cx) / halfW;
            const normY = (y - cy) / halfH;
            let dist: number;
            if (roundness < 0) {
              const rect = Math.max(Math.abs(normX), Math.abs(normY));
              const eucl = Math.sqrt(normX * normX + normY * normY);
              dist =
                eucl * (1 - Math.abs(roundness)) + rect * Math.abs(roundness);
            } else {
              dist = Math.sqrt(normX * normX + normY * normY);
            }
            const vig = clamp((dist - midpoint) / feather, 0, 1);
            const factor = amount > 0 ? 1 - vig * amount : 1 + vig * -amount;
            const idx = (y * width + x) * 3;
            data[idx] *= factor;
            data[idx + 1] *= factor;
            data[idx + 2] *= factor;
          }
        }
        const out = await fromFloatRGB(data, width, height, alpha);
        return { output: toRef(out, baseObj) };
      }

      // Fallback: return image unchanged
      const out = await sharp(baseBytes, { failOn: "none" }).png().toBuffer();
      return { output: toRef(out, baseObj) };
    }
  };

  for (const property of desc.properties) {
    registerDeclaredProperty(C, property.name, property.options);
  }

  return C as NodeClass;
}

const DESCRIPTORS: readonly Desc[] = [
  {
    nodeType: "lib.pillow.color_grading.CDL",
    title: "CDL",
    description:
      "ASC CDL (Color Decision List) color correction.\n    cdl, slope, offset, power, saturation, asc, color decision list\n\n    Use cases:\n    - Apply industry-standard CDL color correction\n    - Exchange color grades between different software\n    - Apply precise mathematical color transformations\n    - Create consistent looks across multiple shots\n\n    Formula: output = (input * slope + offset) ^ power\n    Followed by saturation adjustment.",
    basicFields: [
      "image",
      "slope_r",
      "slope_g",
      "slope_b",
      "offset_r",
      "offset_g",
      "offset_b",
      "power_r",
      "power_g",
      "power_b",
      "saturation"
    ],
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
    nodeType: "lib.pillow.color_grading.ColorBalance",
    title: "Color Balance",
    description:
      "Adjust color temperature and tint for white balance correction.\n    white balance, temperature, tint, color balance, warm, cool\n\n    Use cases:\n    - Correct white balance in photos and video\n    - Warm up or cool down the overall image\n    - Fix color casts from mixed lighting\n    - Create mood through color temperature shifts",
    basicFields: ["image", "temperature", "tint"],
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
    nodeType: "lib.pillow.color_grading.Curves",
    title: "Curves",
    description:
      "RGB curves adjustment with control points for precise tonal control.\n    curves, rgb, tonal, contrast, levels\n\n    Use cases:\n    - Create custom contrast curves\n    - Adjust specific tonal ranges precisely\n    - Create cross-processed or stylized looks\n    - Match the tonal characteristics of film stocks",
    basicFields: [
      "image",
      "black_point",
      "white_point",
      "shadows",
      "midtones",
      "highlights",
      "red_midtones",
      "green_midtones",
      "blue_midtones"
    ],
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
    nodeType: "lib.pillow.color_grading.Exposure",
    title: "Exposure",
    description:
      "Comprehensive tonal exposure controls similar to Lightroom/Camera Raw.\n    exposure, contrast, highlights, shadows, whites, blacks, tonal\n\n    Use cases:\n    - Correct over/underexposed images\n    - Recover highlight and shadow detail\n    - Adjust overall contrast and tonal range\n    - Fine-tune the brightness of specific tonal regions",
    basicFields: [
      "image",
      "exposure",
      "contrast",
      "highlights",
      "shadows",
      "whites",
      "blacks"
    ],
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
    nodeType: "lib.pillow.color_grading.FilmLook",
    title: "Film Look",
    description:
      "Apply preset cinematic film looks with adjustable intensity.\n    film look, cinematic, preset, movie, lut, color grade\n\n    Use cases:\n    - Quickly apply popular cinematic color grades\n    - Create consistent looks across multiple images\n    - Emulate classic film stock characteristics\n    - Starting point for custom color grading",
    basicFields: ["image", "preset", "intensity"],
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
    nodeType: "lib.pillow.color_grading.HSLAdjust",
    title: "HSLAdjust",
    description:
      "Adjust hue, saturation, and luminance for specific color ranges.\n    hsl, hue, saturation, luminance, selective color, color range\n\n    Use cases:\n    - Shift specific colors (e.g., make blues more cyan)\n    - Desaturate or boost individual color ranges\n    - Brighten or darken specific colors\n    - Create color-specific looks (teal skies, orange skin)",
    basicFields: [
      "image",
      "color_range",
      "hue_shift",
      "saturation",
      "luminance"
    ],
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
    nodeType: "lib.pillow.color_grading.LiftGammaGain",
    title: "Lift Gamma Gain",
    description:
      "Three-way color corrector for shadows, midtones, and highlights.\n    lift, gamma, gain, color wheels, primary correction, shadows, midtones, highlights\n\n    Use cases:\n    - Apply the industry-standard three-way color correction\n    - Balance colors across different tonal ranges\n    - Create color contrast between shadows and highlights\n    - Match footage from different sources\n\n    Lift affects shadows, Gamma affects midtones, Gain affects highlights.\n    Each control adjusts both luminance and color for its tonal range.",
    basicFields: [
      "image",
      "lift_r",
      "lift_g",
      "lift_b",
      "lift_master",
      "gamma_r",
      "gamma_g",
      "gamma_b",
      "gamma_master",
      "gain_r",
      "gain_g",
      "gain_b",
      "gain_master"
    ],
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
    nodeType: "lib.pillow.color_grading.SaturationVibrance",
    title: "Saturation Vibrance",
    description:
      "Adjust color saturation with vibrance protection for skin tones.\n    saturation, vibrance, color intensity, skin tones\n\n    Use cases:\n    - Boost color intensity without clipping\n    - Protect skin tones while increasing saturation\n    - Create desaturated or oversaturated looks\n    - Fine-tune color intensity independently",
    basicFields: ["image", "saturation", "vibrance"],
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
    nodeType: "lib.pillow.color_grading.SplitToning",
    title: "Split Toning",
    description:
      "Apply different color tints to shadows and highlights.\n    split toning, shadows, highlights, tint, duotone\n\n    Use cases:\n    - Create classic teal and orange looks\n    - Add color contrast between shadows and highlights\n    - Emulate film processing techniques\n    - Create stylized color-graded images",
    basicFields: [
      "image",
      "shadow_hue",
      "shadow_saturation",
      "highlight_hue",
      "highlight_saturation",
      "balance"
    ],
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
    nodeType: "lib.pillow.color_grading.Vignette",
    title: "Vignette",
    description:
      "Apply cinematic vignette effect to darken or lighten image edges.\n    vignette, edge, darken, focus, cinematic\n\n    Use cases:\n    - Draw attention to the center of the image\n    - Create a classic cinematic look\n    - Simulate lens light falloff\n    - Add subtle framing to photos",
    basicFields: ["image", "amount", "midpoint", "roundness", "feather"],
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
        name: "roundness",
        options: {
          type: "float",
          default: 0,
          title: "Roundness",
          description:
            "Shape of vignette. 0=oval matching image aspect, 1=circular, -1=rectangular.",
          min: -1,
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

export const LIB_IMAGE_COLOR_GRADING_NODES: readonly NodeClass[] =
  DESCRIPTORS.map(createColorGradingNode);
