import { expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { GpuFrameCompositor, HeadlessFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";
import { workingCodes } from "./workingCapture.js";

it("keeps default and explicit RGBA8 byte delivery identical", async () => {
  const device = await getNodeGPUDevice();
  const implicit = new HeadlessFrameCompositor(device, 1, 1);
  const explicit = new HeadlessFrameCompositor(device, 1, 1, { workingFormat: "rgba8unorm" });
  const layer: FrameLayer = { id: "source", source: { rgba: new Uint8Array([160, 80, 40, 128]), width: 1, height: 1 }, opacity: 1, blendMode: "normal", zIndex: 0 };
  try {
    const baseline = await implicit.renderFrame([layer]);
    expect(baseline).toEqual(await explicit.renderFrame([layer]));
    expect(Array.from(baseline)).toEqual([80, 40, 20, 255]);
  } finally {
    implicit.dispose();
    explicit.dispose();
  }
});


it("opts into FP16 accumulation and keeps undithered working values and versioned source uploads", async () => {
  const device = await getNodeGPUDevice();
  const renderer = new HeadlessFrameCompositor(device, 1, 1, { workingFormat: "rgba16float" });
  const layer: FrameLayer = { id: "source", source: { rgba: new Uint8Array([160, 80, 40, 255]), width: 1, height: 1, version: "" }, opacity: 1, blendMode: "normal", zIndex: 0 };
  device.pushErrorScope("validation");
  try {
    expect(Array.from(workingCodes(await renderer.renderWorkingFrame([layer])))).toEqual([160, 80, 40, 255]);
    layer.source = { rgba: new Uint8Array([40, 80, 160, 255]), width: 1, height: 1, version: "next" };
    expect(Array.from(workingCodes(await renderer.renderWorkingFrame([layer])))).toEqual([40, 80, 160, 255]);
    layer.source = { rgba: new Uint8Array([20, 60, 100, 255, 20, 60, 100, 255]), width: 2, height: 1, version: "next" };
    expect(Array.from(workingCodes(await renderer.renderWorkingFrame([layer])))).toEqual([20, 60, 100, 255]);
    layer.crop = { left: 0.5, right: 0, top: 0, bottom: 0 };
    expect(Array.from(workingCodes(await renderer.renderWorkingFrame([layer])))).toEqual([20, 60, 100, 255]);
    expect((await renderer.renderFrame([])).length).toBe(4);
  } finally {
    renderer.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
});


it("declares encoded premultiplied accumulation independently of storage precision", async () => {
  const device = await getNodeGPUDevice();
  for (const workingFormat of ["rgba8unorm", "rgba16float"] as const) {
    const renderer = new GpuFrameCompositor(device, 1, 1, {
      workingFormat,
      upload: () => null
    });
    try {
      const { frame } = renderer.composite([]);
      expect(frame.interpretation).toBe("encoded-sdr");
      expect(frame.alpha).toBe("premultiplied");
      expect(frame.representation).toBe("gpu-texture");
      if (frame.representation === "gpu-texture") {
        expect(frame.format).toBe(workingFormat);
      }
    } finally {
      renderer.dispose();
    }
  }
});

it("preserves full-frame identity through source promotion, crop and subpixel placement", async () => {
  const device = await getNodeGPUDevice();
  const rgba = new Uint8Array(32 * 24 * 4);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 32; x++) {
      const coverage = Math.max(0, Math.min(1, 8.5 - Math.hypot(x - 16, y - 12)));
      rgba.set([coverage > 0 ? 220 : 0, coverage > 0 ? 80 : 0, coverage > 0 ? 35 : 0, Math.round(coverage * (x < 16 ? 255 : 3))], (y * 32 + x) * 4);
    }
  }
  const allocations = vi.spyOn(device, "createTexture");
  const original = rgba.slice();
  const layer: FrameLayer = {
    id: "edge", source: { rgba, width: 32, height: 24, version: "edge" },
    opacity: 1, blendMode: "normal", zIndex: 0,
    crop: { left: 0.125, right: 0.125, top: 0, bottom: 0 },
    transform: { position: { x: 0.375, y: -0.625 }, scale: { x: 0.8, y: 0.8 }, rotation: 13, anchor: { x: 0.5, y: 0.5 } }
  };
  const byte = new HeadlessFrameCompositor(device, 48, 32);
  const half = new HeadlessFrameCompositor(device, 48, 32, { workingFormat: "rgba16float" });
  device.pushErrorScope("validation");
  try {
    const a = await byte.renderFrame([layer]);
    const b = await half.renderFrame([layer]);
    const errors = a.map((value, i) => Math.abs(value - b[i]));
    const max = Math.max(...errors);
    process.stderr.write(`full-frame identity: ${48 * 32} pixels, max ${max} codes, mean ${errors.reduce((sum, v) => sum + v, 0) / errors.length}\n`);
    expect(max).toBeLessThanOrEqual(1);
    expect(b.some((value, i) => i % 4 !== 3 && value > 0 && value < 4)).toBe(true);
    expect(rgba).toEqual(original);
    const targets = allocations.mock.calls.map(([descriptor]) => descriptor);
    expect(targets.find((target) => target.label?.endsWith("promoted-edge"))?.format).toBe("rgba16float");
    expect(targets.filter((target) => target.label?.endsWith("crop-edge")).map((target) => target.format)).toEqual(["rgba8unorm", "rgba16float"]);
    expect(await half.renderFrame([layer])).toEqual(b);
  } finally {
    allocations.mockRestore();
    byte.dispose(); half.dispose();
    expect(await device.popErrorScope()).toBeNull();
  }
});

it("recovers all ramp codes through inverse Levels in FP16", async () => {
  const device = await getNodeGPUDevice();
  const rgba = new Uint8Array(256 * 4);
  for (let x = 0; x < 256; x++) rgba.set([x, x, x, 255], x * 4);
  const layer: FrameLayer = {
    id: "ramp", source: { rgba, width: 256, height: 1 },
    opacity: 1, blendMode: "normal", zIndex: 0,
    effects: [0.5, 2].map((gamma, i) => ({
      id: String(i), type: "levels", enabled: true,
      inBlack: 0, inWhite: 1, gamma, outBlack: 0, outWhite: 1
    }))
  };
  const byte = new HeadlessFrameCompositor(device, 256, 1);
  const half = new HeadlessFrameCompositor(device, 256, 1, { workingFormat: "rgba16float" });
  try {
    const a = await byte.renderFrame([layer]);
    const b = workingCodes(await half.renderWorkingFrame([layer]));
    expect(new Set(a.filter((_, i) => i % 4 === 0)).size).toBe(192);
    expect(new Set(b.filter((_, i) => i % 4 === 0)).size).toBe(256);
    expect(Math.max(...b.map((v, i) => Math.abs(v - rgba[i])))).toBeLessThanOrEqual(1);
  } finally {
    byte.dispose(); half.dispose();
  }
});

it("retains FP16 through glow recipes, group effects and adjustments", async () => {
  const device = await getNodeGPUDevice();
  const allocations = vi.spyOn(device, "createTexture");
  const half = new HeadlessFrameCompositor(device, 8, 8, { workingFormat: "rgba16float" });
  device.pushErrorScope("validation");
  const levels = { id: "l", type: "levels" as const, enabled: true, inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 0.5 };
  try {
    const result = await half.renderFrame([{
      id: "nested", source: { rgba: new Uint8Array([128, 64, 32, 255]), width: 1, height: 1 },
      opacity: 1, blendMode: "normal", zIndex: 0, precomposeGroupId: "g",
      effects: [{ id: "glow", type: "glow", enabled: true, radius: 2, intensity: 0.1 }]
    }], [{ id: "g", zIndex: 0, opacity: 1, blendMode: "normal", effects: [levels] }], {},
    [{ id: "a", zIndex: 1, opacity: 1, effects: [levels] }]);
    expect(result.some((v, i) => i % 4 !== 3 && v > 0)).toBe(true);
    const effects = allocations.mock.calls.map(([d]) => d).filter(d => d.label?.startsWith("preview-effects"));
    expect(effects.length).toBeGreaterThanOrEqual(6);
    expect(effects.every(d => d.format === "rgba16float")).toBe(true);
  } finally {
    half.dispose(); allocations.mockRestore();
    const error = await device.popErrorScope();
    expect(error?.message).toBeUndefined();
  }
});

it("releases removed promotions, bounds retained bytes and releases on dispose", async () => {
  const device = await getNodeGPUDevice();
  const source = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: source }, new Uint8Array([128, 64, 32, 255]), { bytesPerRow: 4 }, [1, 1]);
  const allocations = vi.spyOn(device, "createTexture");
  const renderer = new GpuFrameCompositor(device, 1, 1, {
    workingFormat: "rgba16float", maxPromotionCacheBytes: 16,
    upload: () => ({ texture: source, width: 1, height: 1 })
  });
  const layer: FrameLayer = { id: "first", source: { rgba: new Uint8Array(4), width: 1, height: 1 }, opacity: 1, blendMode: "normal", zIndex: 0 };
  try {
    renderer.composite([layer]);
    const promoted = allocations.mock.results[allocations.mock.calls.findIndex(([d]) => d.label?.endsWith("promoted-first"))].value as GPUTexture;
    const destroyed = vi.spyOn(promoted, "destroy");
    renderer.composite([]);
    expect(destroyed).toHaveBeenCalledOnce();
    renderer.composite(Array.from({ length: 20 }, (_, i) => ({ ...layer, id: String(i) })));
    // Two eight-byte textures fit. The next frame must allocate the evicted 18 again.
    const count = () => allocations.mock.calls.filter(([d]) => d.label?.includes("-promoted-")).length;
    expect(count()).toBe(21);
    renderer.composite(Array.from({ length: 20 }, (_, i) => ({ ...layer, id: String(i) })));
    expect(count()).toBe(39);
    const retained = allocations.mock.results[allocations.mock.calls.findLastIndex(([d]) => d.label?.includes("-promoted-"))].value as GPUTexture;
    const dispose = vi.spyOn(retained, "destroy");
    renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    renderer.dispose(); source.destroy(); allocations.mockRestore();
  }
});

it("refreshes FP16 temporal neighbors across seeks, source changes and cache reset", async () => {
  const device = await getNodeGPUDevice();
  const renderer = new HeadlessFrameCompositor(device, 8, 8, { workingFormat: "rgba16float" });
  const allocations = vi.spyOn(device, "createTexture");
  const source = (value: number) => ({ rgba: new Uint8Array(8 * 8 * 4).map((_, i) => i % 4 === 3 ? 255 : value), width: 8, height: 8, version: String(value) });
  const scene = (value: number): FrameLayer => ({
    id: "temporal", source: source(value), opacity: 1, blendMode: "normal", zIndex: 0,
    crop: { left: 0.125, right: 0.125, top: 0, bottom: 0 },
    temporalSources: { before: source(value - 2), after: source(value + 2) },
    effects: [{ id: "denoise", type: "denoise", enabled: true, temporalStrength: 1 }]
  });
  device.pushErrorScope("validation");
  try {
    const first = await renderer.renderFrame([scene(80)]);
    const changed = await renderer.renderFrame([scene(160)]);
    expect(changed).not.toEqual(first);
    expect(await renderer.renderFrame([scene(80)])).toEqual(first);
    await renderer.renderFrame([]);
    expect(await renderer.renderFrame([scene(80)])).toEqual(first);
    const neighbors = allocations.mock.calls.map(([d]) => d).filter(d => d.label?.includes("#denoise-"));
    expect(neighbors.filter(d => d.label?.includes("-promoted-")).length).toBe(4);
    expect(neighbors.filter(d => d.label?.includes("-crop-")).every(d => d.format === "rgba16float")).toBe(true);
  } finally {
    renderer.dispose(); allocations.mockRestore();
    expect((await device.popErrorScope())?.message).toBeUndefined();
  }
});

it("keeps full-frame identity with effects and nearly transparent edges against encoded references", async () => {
  const device = await getNodeGPUDevice();
  const width = 16, height = 16;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba.set([220, 80, 35, [0, 1, 2, 3, 8, 16, 128, 255][i % 8]], i * 4);
  }
  const half = new HeadlessFrameCompositor(device, width, height, { workingFormat: "rgba16float" });
  const byte = new HeadlessFrameCompositor(device, width, height);
  const layer: FrameLayer = {
    id: "alpha", source: { rgba, width, height }, opacity: 1, blendMode: "normal", zIndex: 1,
    effects: [{ id: "identity", type: "levels", enabled: true, inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1 }],
    shapeMask: { rgba: new Uint8Array(width * height * 4).fill(255), width, height },
    matte: { mode: "luma", invert: false, layer: {
      id: "matte", source: { rgba: new Uint8Array(width * height * 4).fill(255), width, height },
      opacity: 1, blendMode: "normal", zIndex: 0
    } }
  };
  try {
    for (const ground of [0, 255, null]) {
      const layers: FrameLayer[] = ground === null ? [layer] : [{
        id: "ground", source: { rgba: new Uint8Array([ground, ground, ground, 255]), width: 1, height: 1 },
        opacity: 1, blendMode: "normal", zIndex: 0
      }, layer];
      const result = await half.renderFrame(layers, [], { alpha: ground === null });
      const baseline = await byte.renderFrame(layers, [], { alpha: ground === null });
      let max = 0, total = 0, byteDelta = 0;
      for (let i = 0; i < result.length; i++) {
        const a = rgba[i - i % 4 + 3] / 255;
        const expected = i % 4 === 3 ? (ground === null ? Math.round(a * 255) : 255)
          : ground === null ? (a === 0 ? 0 : rgba[i]) : Math.round(rgba[i] * a + ground * (1 - a));
        const error = Math.abs(result[i] - expected);
        max = Math.max(max, error); total += error;
        byteDelta = Math.max(byteDelta, Math.abs(result[i] - baseline[i]));
      }
      process.stderr.write(`effect identity ground=${ground}: max=${max}, mean=${total / result.length}, byteDelta=${byteDelta}
`);
      expect(max).toBeLessThanOrEqual(1);
    }
    const opaque = { ...layer, source: { rgba: rgba.map((v, i) => i % 4 === 3 ? 255 : v), width, height } };
    const a = await byte.renderFrame([opaque]);
    const b = await half.renderFrame([opaque]);
    expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeLessThanOrEqual(1);
  } finally { half.dispose(); byte.dispose(); }
});

it("preserves intentional Posterize quantization in FP16", async () => {
  const device = await getNodeGPUDevice();
  const rgba = new Uint8Array(256 * 4);
  for (let x = 0; x < 256; x++) rgba.set([x, x, x, 255], x * 4);
  const renderer = new HeadlessFrameCompositor(device, 256, 1, { workingFormat: "rgba16float" });
  try {
    const result = workingCodes(await renderer.renderWorkingFrame([{
      id: "posterize", source: { rgba, width: 256, height: 1 },
      opacity: 1, blendMode: "normal", zIndex: 0,
      effects: [{ id: "p", type: "posterize", enabled: true, levels: 4 }]
    }]));
    expect([...new Set(result.filter((_, i) => i % 4 === 0))].sort((a, b) => a - b)).toEqual([0, 85, 170, 255]);
  } finally { renderer.dispose(); }
});
