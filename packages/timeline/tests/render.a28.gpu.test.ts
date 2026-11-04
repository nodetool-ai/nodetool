import { expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { BLEND_MODE_TUPLE } from "@nodetool-ai/protocol/blend-modes";
import { CLIP_EFFECT_TYPES, GENERATOR_MODES, STYLIZE_MODES, type KnownClipEffect } from "../src/types.js";
import { HeadlessFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";
import { makeClip } from "../src/defaults.js";
import { resolveAnalysisEffects } from "../src/render/clipAnalysis.js";
import { workingValues } from "./workingCapture.js";
const SIZE = 48;
// Same authored non-neutral fixtures as render.parity.gpu.test.ts. The byte
// comparison measures compatibility only, never precision improvement.
const SOURCE_CORRECTIONS: KnownClipEffect[] = [
  { id: "deband", type: "deband", enabled: true, strength: 0.7, range: 4, threshold: 0.1, dither: 0.3 },
  { id: "denoise", type: "denoise", enabled: true, lumaStrength: 0.6, chromaStrength: 0.4, radius: 2 },
  { id: "exposure", type: "exposure", enabled: true, exposure: 0.6, rolloff: 0.2, whites: 0.1 },
  { id: "secondaryColor", type: "secondaryColor", enabled: true, hueCenter: 140, hueWidth: 100, hueShift: 25, saturation: 0.6, lightness: 0.1 },
  { id: "deflicker", type: "deflicker", enabled: true, analysis: {
    version: 1, source: { assetId: "source", mediaPath: "" }, rangeStartMs: 0, rangeEndMs: 1000,
    windowMs: 500, maxCorrection: 1, frameRate: 30, samples: [{ timeMs: 0, stops: 0.5 }]
  } },
  { id: "stabilize", type: "stabilize", enabled: true, maxZoom: 1.2, analysis: {
    version: 1, kind: "stabilize", source: { assetId: "source", mediaPath: "" }, rangeStartMs: 0, rangeEndMs: 1000,
    windowMs: 500, frameRate: 30, width: 48, height: 48, requiredZoom: 1.1, trackedFrames: 1,
    samples: [{ timeMs: 0, x: 0.02, y: -0.01, angle: 0.01, scale: 1 }]
  } },
];

const EFFECTS: KnownClipEffect[] = [
  ...SOURCE_CORRECTIONS,
  { id: "color", type: "color", enabled: true, saturation: 0.3, contrast: 1.2 },
  { id: "color-all-channels", type: "color", enabled: true, brightness: 0.1, contrast: 1.3,
    saturation: 1.4, hue: 37, temperature: -0.3, tint: 0.2, shadows: 0.3, highlights: -0.2 },
  { id: "blur", type: "blur", enabled: true, radius: 6 },
  { id: "glow", type: "glow", enabled: true, radius: 6, intensity: 0.6 },
  { id: "dropShadow", type: "dropShadow", enabled: true, offsetX: 4, offsetY: 3, blur: 4, color: "#ff8040", opacity: 0.7 },
  { id: "vignette", type: "vignette", enabled: true, amount: 0.7, softness: 0.5 },
  { id: "sharpen", type: "sharpen", enabled: true, amount: 0.8, radius: 2 },
  { id: "chromaKey", type: "chromaKey", enabled: true, color: "#20c060", tolerance: 0.3, softness: 0.1 },
  { id: "curves", type: "curves", enabled: true, master: [{ x: 0, y: 0 }, { x: 0.5, y: 0.3 }, { x: 1, y: 1 }] },
  { id: "levels", type: "levels", enabled: true, inBlack: 0.1, inWhite: 0.9, gamma: 1.2, outBlack: 0, outWhite: 1 },
  { id: "liftGammaGain", type: "liftGammaGain", enabled: true, lift: [0.04, 0, 0], gamma: [1, 1.2, 1], gain: [1, 1, 0.8] },
  { id: "grain", type: "grain", enabled: true, amount: 0.3, size: 1, seed: 7 },
  { id: "pixelate", type: "pixelate", enabled: true, cellSize: 7 },
  { id: "posterize", type: "posterize", enabled: true, levels: 3 },
  { id: "directionalBlur", type: "directionalBlur", enabled: true, radius: 6, angle: 35 },
  { id: "lensDistortion", type: "lensDistortion", enabled: true, amount: 0.4 },
  { id: "lut", type: "lut", enabled: true, intensity: 0.7,
    cube: "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0" },
  ...STYLIZE_MODES.map((mode): KnownClipEffect => ({
    id: `stylize-${mode}`, type: "stylize", mode, enabled: true,
    amount: 0.6, scale: 6, time: 0.4, seed: 7
  })),
  ...GENERATOR_MODES.map((mode): KnownClipEffect => ({
    id: `generator-${mode}`, type: "generator", mode, enabled: true,
    amount: 0.8, scale: 6, time: 0.4, seed: 7,
    colorA: "#204080", colorB: "#ff8040"
  })),
  ...STYLIZE_MODES.map((mode): KnownClipEffect => ({
    id: `stylize-${mode}-defaults`, type: "stylize", mode, enabled: true
  })),
  ...GENERATOR_MODES.map((mode): KnownClipEffect => ({
    id: `generator-${mode}-defaults`, type: "generator", mode, enabled: true
  }))
];


function extreme(effect: KnownClipEffect): KnownClipEffect {
  switch (effect.type) {
    case "color": return { ...effect, brightness: -0.5, contrast: 4, saturation: 4, hue: 180, temperature: 1, tint: -1 };
    case "blur": return { ...effect, radius: 48 };
    case "glow": return { ...effect, radius: 24, intensity: 4 };
    case "dropShadow": return { ...effect, offsetX: -24, offsetY: 24, blur: 24, opacity: 1 };
    case "vignette": return { ...effect, amount: 1, softness: 0 };
    case "sharpen": return { ...effect, amount: 2, radius: 16 };
    case "chromaKey": return { ...effect, tolerance: 1, softness: 0 };
    case "curves": return { ...effect, master: [{x:0,y:1},{x:0.5,y:0},{x:1,y:1}] };
    case "levels": return { ...effect, inBlack: 0.45, inWhite: 0.55, gamma: 0.1 };
    case "liftGammaGain": return { ...effect, lift: [-0.5,0.5,0], gamma: [0.1,4,1], gain: [4,0.1,2] };
    case "grain": return { ...effect, amount: 1, size: 16, softness: 1 };
    case "pixelate": return { ...effect, cellSize: 48 };
    case "posterize": return { ...effect, levels: 2 };
    case "directionalBlur": return { ...effect, radius: 48, angle: 137 };
    case "lensDistortion": return { ...effect, amount: -1 };
    case "lut": return { ...effect, intensity: 1 };
    case "stylize": case "generator": return { ...effect, amount: 1, scale: 1, time: 10, seed: 91 };
    case "exposure": return { ...effect, exposure: 5, whites: 2, rolloff: 1 };
    case "secondaryColor": return { ...effect, hueWidth: 360, hueShift: 180, saturation: 4, lightness: -1 };
    case "deband": return { ...effect, strength: 1, range: 32, threshold: 1, dither: 1 };
    case "denoise": return { ...effect, lumaStrength: 1, chromaStrength: 1, radius: 4 };
    case "deflicker": case "stabilize": return effect;
  }
}
it("qualifies non-neutral effects and blend modes on opaque and transparent edges", async () => {
  const device = await getNodeGPUDevice();
  const adapter = { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device, description: device.adapterInfo.description };
  console.log("A28 timeline adapter", adapter);
  expect([...new Set(EFFECTS.map(e => e.type))].sort()).toEqual([...CLIP_EFFECT_TYPES].sort());
  const results: object[] = [];
  const cases = [
    ...EFFECTS.filter(e => !e.id.endsWith("-defaults")).map(effect => ({ name: effect.id, effects: [effect], blendMode: "normal" as const })),
    ...EFFECTS.filter(e => !e.id.endsWith("-defaults")).map(effect => ({ name: `${effect.id}-extreme`, effects: [extreme(effect)], blendMode: "normal" as const })),
    ...["normal", "screen", "multiply"].map(blendMode => ({
      name: `stack-${blendMode}`, blendMode: blendMode as "normal" | "screen" | "multiply",
      effects: [...EFFECTS.filter(e => ["color-all-channels", "blur", "glow", "curves"].includes(e.id)),
        // Authored payload from agents/tests/capabilities-timelines-grain.test.ts.
        { id: "agent-grain", type: "grain" as const, enabled: true, amount: 0.25, size: 2,
          colorAmount: 0.1, roughness: 0.7, softness: 0.3, seed: 42, animate: true }]
    })),
    ...BLEND_MODE_TUPLE.map(blendMode => ({ name: `blend-${blendMode}`, effects: [], blendMode }))
  ];
  const clip = makeClip({ mediaType: "video", currentAssetId: "source", durationMs: 1000 });
  try {
    for (const test of cases) for (const transparent of [false, true]) {
      const layers: FrameLayer[] = [false, true].map((foreground, index) => {
        const rgba = new Uint8Array(SIZE * SIZE * 4);
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const alpha = transparent && foreground ? [0,1,2,128,254,255][Math.floor(y / 8)] : 255;
          rgba.set(foreground ? [[0,1,64,128,254,255][Math.floor(x/8)], 192, 96+y*2, alpha] : [40+y*2,60+x*2,180,255], (y*SIZE+x)*4);
        }
        const combined = foreground && test.name.startsWith("stack-");
        const mask = Uint8Array.from({ length: SIZE * SIZE * 4 }, (_, i) =>
          i % 4 === 3 && Math.floor(i / 4 / SIZE) >= 8 ? 255 : 0);
        return { ...(combined ? {
          shapeMask: { rgba: mask, width: SIZE, height: SIZE },
          transition: { type: "wipe" as const, role: "incoming" as const, progress: 0.6, opacity: 1,
            mask: { direction: "left" as const, progress: 0.6, softness: 0 } }
        } : {}), id: String(index), source: { rgba, width: SIZE, height: SIZE, version: "1" }, zIndex: index, opacity: 1, blendMode: foreground ? test.blendMode : "normal", effects: foreground ? resolveAnalysisEffects(clip, test.effects, 0) : [] };
      });
      const outputs: Uint8Array[] = [];
      const backgrounds: Uint8Array[] = [];
      let range = { min: 0, max: 0, nonfinite: 0 };
      for (const workingFormat of ["rgba8unorm", "rgba16float"] as const) {
        const compositor = new HeadlessFrameCompositor(device, SIZE, SIZE, { workingFormat });
        try {
          outputs.push(await compositor.renderFrame(layers));
          if (test.name.startsWith("stack-")) {
            backgrounds.push(await compositor.renderFrame([layers[0]]));
            // An omitted effect must change the visible scene. This checks
            // execution separately from byte/float compatibility.
            for (const effect of layers[1].effects ?? []) {
              const without = await compositor.renderFrame([layers[0], { ...layers[1],
                effects: layers[1].effects?.filter(e => e.id !== effect.id) }]);
              expect(without.some((v, i) => Math.abs(v - outputs[outputs.length - 1][i]) > 1), effect.id).toBe(true);
            }
          }
          if (workingFormat === "rgba16float") {
            const frame = await compositor.renderWorkingFrame(layers);
            if (frame.representation === "rgba16float") {
              expect(Array.from(frame.data).every(word => ((word >> 10) & 31) !== 31), test.name).toBe(true);
            }
            const values = workingValues(frame);
            range = { min: Math.min(...values), max: Math.max(...values), nonfinite: values.filter(v => !Number.isFinite(v)).length };
          }
        } finally { compositor.dispose(); }
      }
      if (test.name.startsWith("stack-")) {
        // The hard shape mask excludes the top eight rows irrespective of
        // colour precision or blur spread. Compare an independent background
        // render with the same final delivery quantizer.
        for (const [index, output] of outputs.entries()) for (let y = 0; y < 8; y++) for (let x = 0; x < SIZE; x++) {
          expect(Array.from(output.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)))
            .toEqual(Array.from(backgrounds[index].slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)));
        }
      }
      const errors = outputs[0].map((v,i) => Math.abs(v-outputs[1][i]));
      const result = { name: test.name, transparent, ...range, maxError: Math.max(...errors), meanError: errors.reduce((a,b) => a+b,0)/errors.length };
      if (test.name.startsWith("stack-")) {
        // Local compatibility bound is declared separately from the existing
        // mean bound. Geometry is checked above against authored mask coverage.
        expect.soft(result.maxError, JSON.stringify(result)).toBeLessThanOrEqual(4);
      }
      results.push({ ...result, byte: Array.from(outputs[0]), floatDelivery: Array.from(outputs[1]) });
      expect.soft(range.nonfinite, JSON.stringify(result)).toBe(0);
      expect.soft(range.min, JSON.stringify(result)).toBeGreaterThanOrEqual(0);
      expect.soft(range.max, JSON.stringify(result)).toBeLessThanOrEqual(1);
      // Existing preview/export mean tolerance is 3 codes. Apply it unchanged
      // to delivered pictures over an opaque background, including low alpha.
      expect.soft(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
    }
  } finally {
    if (process.env.A28_OUTPUT) writeFileSync(process.env.A28_OUTPUT, JSON.stringify({ adapter, results }, null, 2));
  }
}, 240000);
