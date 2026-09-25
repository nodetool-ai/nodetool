import { createCanvas, ImageData, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { BLEND_MODE_TUPLE } from "@nodetool-ai/protocol/blend-modes";
import { KNOWN_CLIP_EFFECT_TYPE_LIST } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { CLIP_EFFECT_TYPES, GENERATOR_MODES, STYLIZE_MODES, type KnownClipEffect } from "../src/types.js";
import {
  drawTimelineFrame,
  unsupportedEffectTypes,
  type CompositeContext2D,
  type Canvas2DLayer
} from "../src/render/canvas2d.js";
import {
  HeadlessFrameCompositor,
  type FrameLayer
} from "../src/render/frameCompositor.js";

const SIZE = 48;
const EFFECTS: KnownClipEffect[] = [
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

function picture(foreground: boolean): Canvas {
  const canvas = createCanvas(SIZE, SIZE);
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const inside = x >= 8 && x < 40 && y >= 8 && y < 40;
      data[i] = foreground ? (x % 8 < 4 ? 32 : 224) : 40 + y * 2;
      data[i + 1] = foreground ? 192 : 60 + x * 2;
      data[i + 2] = foreground ? 96 + y * 2 : 180;
      data[i + 3] = foreground ? (inside ? (x < 24 ? 255 : 160) : 0) : 255;
    }
  }
  canvas.getContext("2d").putImageData(new ImageData(data, SIZE, SIZE), 0, 0);
  return canvas;
}

// The host canvas type accepts more drawImage overloads than our common interface.
function context(canvas: Canvas): CompositeContext2D<Canvas> {
  return canvas.getContext("2d") as unknown as CompositeContext2D<Canvas>;
}

function surface(width: number, height: number): { surface: Canvas; ctx: CompositeContext2D<Canvas> } {
  const canvas = createCanvas(width, height);
  return { surface: canvas, ctx: context(canvas) };
}

async function compare(effect?: KnownClipEffect | KnownClipEffect[], blendMode: FrameLayer["blendMode"] = "normal", scope: "clip" | "group" | "adjustment" = "clip"): Promise<{
  meanError: number;
  maxError: number;
  unsupported: string[];
}> {
  const sources = [picture(false), picture(true)];
  const effectList = effect ? (Array.isArray(effect) ? effect : [effect]) : [];
  const precomposites = scope === "group" ? [{ id: "group", zIndex: 1, opacity: 1, blendMode: "normal" as const, effects: effectList }] : [];
  const adjustments = scope === "adjustment" ? [{ id: "adjust", clipId: "adjust", zIndex: 2, opacity: 0.7, effects: effectList }] : [];
  const layers: Canvas2DLayer<Canvas>[] = sources.map((source, i) => ({
    source, sourceWidth: SIZE, sourceHeight: SIZE,
    opacity: 1, blendMode: i === 0 ? "normal" : blendMode, zIndex: i,
    effects: i === 1 && scope === "clip" ? effectList : [],
    precomposeGroupId: i === 1 && scope === "group" ? "group" : undefined
  }));
  const output = createCanvas(SIZE, SIZE);
  const report = drawTimelineFrame(context(output), layers, { canvasWidth: SIZE, canvasHeight: SIZE }, {
    maskScratch: surface, maskSurface: surface, cropSurface: surface,
    precompositeSurface: surface, adjustmentSurface: surface,
    projectiveSurface: surface, matteSurface: surface, effectSurface: surface,
    precomposites, adjustments
  });
  expect(report.degraded).toEqual([]);
  const preview = output.getContext("2d").getImageData(0, 0, SIZE, SIZE).data;
  const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), SIZE, SIZE);
  try {
    const exported = await compositor.renderFrame(layers.map((layer, i) => ({
      id: String(i), opacity: layer.opacity,
      blendMode: i === 0 ? "normal" : blendMode, zIndex: i, effects: layer.effects,
      precomposeGroupId: layer.precomposeGroupId,
      source: {
        rgba: new Uint8Array(layer.source.getContext("2d").getImageData(0, 0, SIZE, SIZE).data),
        width: SIZE, height: SIZE, version: String(i)
      }
    })), precomposites, {}, adjustments);
    let sum = 0;
    let maxError = 0;
    for (let i = 0; i < exported.length; i++) {
      const difference = Math.abs(exported[i]! - preview[i]!);
      sum += difference;
      maxError = Math.max(maxError, difference);
    }
    return { meanError: sum / exported.length, maxError, unsupported: unsupportedEffectTypes([...layers, ...precomposites, ...adjustments]) };
  } finally {
    compositor.dispose();
  }
}

describe("preview/export pixel comparison matrix", () => {
  it("documents encoded-sRGB alpha blending rather than linear-light blending", async () => {
    const opaque = (value: number): FrameLayer["source"] => {
      const rgba = new Uint8Array(SIZE * SIZE * 4);
      for (let i = 0; i < SIZE * SIZE; i++) {
        rgba.set([value, value, value, 255], i * 4);
      }
      return { rgba, width: SIZE, height: SIZE, version: `gray-${value}` };
    };
    const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), SIZE, SIZE);
    try {
      const pixels = await compositor.renderFrame([
        { id: "black", source: opaque(0), opacity: 1, blendMode: "normal", zIndex: 0 },
        { id: "white", source: opaque(255), opacity: 0.5, blendMode: "normal", zIndex: 1 }
      ]);
      // Halfway in encoded sRGB is ~128; linear-light mixing would encode ~188.
      expect(pixels[0]).toBeGreaterThanOrEqual(126);
      expect(pixels[0]).toBeLessThanOrEqual(129);
      expect(pixels[1]).toBe(pixels[0]);
      expect(pixels[2]).toBe(pixels[0]);
    } finally {
      compositor.dispose();
    }
  });

  it("enumerates every persisted effect and blend mode", () => {
    expect(EFFECTS.length).toBeGreaterThan(0);
    const covered = [...new Set(EFFECTS.map((e) => e.type))].sort();
    expect(covered).toEqual([...CLIP_EFFECT_TYPES].sort());
    expect(covered).toEqual([...KNOWN_CLIP_EFFECT_TYPE_LIST].sort());
    expect(BLEND_MODE_TUPLE.length).toBeGreaterThan(0);
  });

  for (const mode of BLEND_MODE_TUPLE) {
    it(`compares ${mode} blending on colored translucent edges`, async () => {
      const result = await compare(undefined, mode);
      expect(result.maxError, JSON.stringify(result)).toBeLessThanOrEqual(3);
      expect(result.meanError).toBeLessThanOrEqual(0.6);
    });
  }

  for (const effect of EFFECTS) {
    it(`measures ${effect.id} through both compositors`, async () => {
      const result = await compare(effect);
      expect(result.unsupported).toEqual([]);
      expect(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
    });
    for (const scope of ["group", "adjustment"] as const) {
      it(`compares ${effect.id} on ${scope === "group" ? "a group" : "an adjustment"}`, async () => {
        const result = await compare(effect, "normal", scope);
        expect(result.unsupported).toEqual([]);
        expect(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
      });
    }
  }

  it("preserves effect order across old and new types", async () => {
    const effects: KnownClipEffect[] = [
      { id: "glitch", type: "stylize", mode: "glitch", enabled: true, amount: 0.3, scale: 4, seed: 2 },
      { id: "levels", type: "levels", enabled: true, inBlack: 0.1, inWhite: 0.8, gamma: 1.2, outBlack: 0.05, outWhite: 0.9 },
      { id: "pixels", type: "pixelate", enabled: true, cellSize: 5 },
      { id: "vignette", type: "vignette", enabled: true, amount: 0.4, softness: 0.6 },
      { id: "grade", type: "color", enabled: true, hue: 20, brightness: 0.1 }
    ];
    for (let length = 1; length <= effects.length; length++) {
      const result = await compare(effects.slice(0, length));
      expect(result.unsupported).toEqual([]);
      expect(result.meanError, `${effects[length - 1]!.id}: ${JSON.stringify(result)}`).toBeLessThanOrEqual(3);
    }
  });

  it("composites both authored drop shadows", async () => {
    const result = await compare([
      { id: "red-shadow", type: "dropShadow", enabled: true, offsetX: -3, offsetY: 2, blur: 3, color: "#ff0000", opacity: 0.8 },
      { id: "blue-shadow", type: "dropShadow", enabled: true, offsetX: 5, offsetY: -2, blur: 6, color: "#0000ff", opacity: 0.7 }
    ]);
    expect(result.unsupported).toEqual([]);
    expect(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
  });

  it("casts later shadows from the preceding effect output", async () => {
    const result = await compare([
      { id: "pixels", type: "pixelate", enabled: true, cellSize: 5 },
      { id: "first-shadow", type: "dropShadow", enabled: true, offsetX: -3, offsetY: 2, blur: 3, color: "#ff0000", opacity: 0.8 },
      { id: "second-shadow", type: "dropShadow", enabled: true, offsetX: 5, offsetY: -2, blur: 6, color: "#0000ff", opacity: 0.7 }
    ]);
    expect(result.meanError, JSON.stringify(result)).toBeLessThanOrEqual(3);
  });
});
