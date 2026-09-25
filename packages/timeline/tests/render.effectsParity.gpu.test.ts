import { createCanvas, ImageData, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { drawTimelineFrame, type CompositeContext2D } from "../src/render/canvas2d.js";
import { HeadlessFrameCompositor } from "../src/render/frameCompositor.js";
import { compileClipAnimations } from "../src/animation/compile.js";
import { resolveAnimatedStyleTracks } from "../src/animation/styleTracks.js";
import * as cubeLut from "../src/render/cubeLut.js";
import type { KnownClipEffect } from "../src/types.js";

function surface(width: number, height: number): { surface: Canvas; ctx: CompositeContext2D<Canvas> } {
  const canvas = createCanvas(width, height);
  return { surface: canvas, ctx: canvas.getContext("2d") as unknown as CompositeContext2D<Canvas> };
}

async function comparePixels(width: number, height: number, rgba: Uint8ClampedArray, effect: KnownClipEffect): Promise<{
  meanError: number;
  maxError: number;
  cpu: Uint8ClampedArray;
  gpu: Uint8Array;
}> {
  const source = createCanvas(width, height);
  source.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0);
  const output = createCanvas(width, height);
  const report = drawTimelineFrame(
    output.getContext("2d") as unknown as CompositeContext2D<Canvas>,
    [{ source, sourceWidth: width, sourceHeight: height, opacity: 1, blendMode: "normal", zIndex: 0, effects: [effect] }],
    { canvasWidth: width, canvasHeight: height },
    { alpha: true, effectSurface: surface, projectiveSurface: surface, maskSurface: surface, maskScratch: surface }
  );
  expect(report.degraded).toEqual([]);
  const cpu = output.getContext("2d").getImageData(0, 0, width, height).data;
  const compositor = new HeadlessFrameCompositor(await getNodeGPUDevice(), width, height);
  try {
    const gpu = await compositor.renderFrame([{
      id: "effect", opacity: 1, blendMode: "normal", zIndex: 0, effects: [effect],
      source: { rgba: new Uint8Array(rgba), width, height, version: "source" }
    }], [], { alpha: true });
    let sum = 0;
    let maxError = 0;
    for (let index = 0; index < gpu.length; index++) {
      const difference = Math.abs(cpu[index]! - gpu[index]!);
      sum += difference;
      maxError = Math.max(maxError, difference);
    }
    return { meanError: sum / gpu.length, maxError, cpu, gpu };
  } finally {
    compositor.dispose();
  }
}

describe("effect parity on diagnostic pixels", () => {
  it("renders an interpolated generator color in both CPU preview and GPU export", async () => {
    const effect: KnownClipEffect = { id: "field", type: "generator", mode: "conicGradient",
      enabled: true, colorA: "#000000", colorB: "#0000ff", scale: 3 };
    const animation = { id: "color", preset: "custom", role: "emphasis" as const, durationMs: 1000,
      styleTracks: [{ target: "effect.field.colorB", keyframes: [
        { t: 0, value: "#0000ff" }, { t: 1, value: "#ff0000" }
      ] }] };
    const clip = { animations: [animation], effects: [effect] };
    const resolved = resolveAnimatedStyleTracks(clip,
      compileClipAnimations([animation], 1000, { width: 32, height: 32 }), 500).effects?.[0];
    expect(resolved).toMatchObject({ colorB: "#800080ff" });
    const rgba = new Uint8ClampedArray(32 * 32 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([0, 0, 0, 255], index);
    const before = await comparePixels(32, 32, rgba, effect);
    const after = await comparePixels(32, 32, rgba, resolved as KnownClipEffect);
    expect(after.cpu).not.toEqual(before.cpu);
    expect(after.gpu).not.toEqual(before.gpu);
    expect(after.meanError).toBeLessThanOrEqual(4);
  });

  it("interpolates out-of-range cube knots before clamping the result", async () => {
    const cube = "LUT_3D_SIZE 2\n-1 -1 -1\n2 -1 -1\n-1 2 -1\n2 2 -1\n-1 -1 2\n2 -1 2\n-1 2 2\n2 2 2";
    const rgba = new Uint8ClampedArray(16 * 16 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([85, 85, 85, 255], index);
    const result = await comparePixels(16, 16, rgba, { id: "lut", type: "lut", enabled: true, cube });
    expect(result.cpu[0]).toBe(0);
    expect(result.maxError, `mean ${result.meanError}`).toBeLessThanOrEqual(2);
  });

  it("uses source pixel units for vertical displacement on a wide image", async () => {
    const width = 192;
    const height = 48;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) rgba.set([y % 8 < 4 ? 255 : 0, x % 8 < 4 ? 255 : 0, 128, 255], (y * width + x) * 4);
    }
    const result = await comparePixels(width, height, rgba, {
      id: "displacement", type: "stylize", mode: "displacement", enabled: true,
      amount: 2, scale: 8, seed: 3, time: 0.5
    });
    expect(result.meanError).toBeLessThanOrEqual(3);
  });

  it("splits straight RGB channels across an alpha edge", async () => {
    const width = 48;
    const height = 48;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) rgba.set([255, 255, 255, x < 24 ? 255 : 32], (y * width + x) * 4);
    }
    const result = await comparePixels(width, height, rgba, {
      id: "rgb", type: "stylize", mode: "rgbSplit", enabled: true, amount: 8, angle: 0
    });
    const index = (16 * width + 16) * 4;
    expect([...result.cpu.slice(index, index + 4)]).toEqual([255, 255, 255, 255]);
    expect([...result.gpu.slice(index, index + 4)]).toEqual([255, 255, 255, 255]);
    expect(result.meanError).toBeLessThanOrEqual(3);
  });
});

describe("GPU LUT cache", () => {
  it("parses each cube once per processor and invalidates on content change or disposal", async () => {
    const parse = vi.spyOn(cubeLut, "parseCubeLut");
    const identity = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1";
    const invert = "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0";
    const rgba = new Uint8Array(4 * 4 * 4);
    for (let index = 0; index < rgba.length; index += 4) rgba.set([85, 85, 85, 255], index);
    const render = async (compositor: HeadlessFrameCompositor, cube: string): Promise<Uint8Array> => compositor.renderFrame([{
      id: "lut", opacity: 1, blendMode: "normal", zIndex: 0,
      effects: [{ id: "cube", type: "lut", enabled: true, cube }],
      source: { rgba, width: 4, height: 4, version: "source" }
    }], [], { alpha: true });
    const device = await getNodeGPUDevice();
    try {
      const first = new HeadlessFrameCompositor(device, 4, 4);
      try {
        expect((await render(first, identity))[0]).toBe(85);
        expect((await render(first, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(1);
        expect((await render(first, invert))[0]).toBe(170);
        expect(parse).toHaveBeenCalledTimes(2);
        expect((await render(first, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(2);
      } finally {
        first.dispose();
      }
      const second = new HeadlessFrameCompositor(device, 4, 4);
      try {
        expect((await render(second, identity))[0]).toBe(85);
        expect(parse).toHaveBeenCalledTimes(3);
      } finally {
        second.dispose();
      }
    } finally {
      parse.mockRestore();
    }
  });
});
