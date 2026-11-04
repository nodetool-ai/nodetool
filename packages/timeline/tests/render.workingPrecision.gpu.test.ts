import { expect, it, vi } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { GpuFrameCompositor, HeadlessFrameCompositor, type FrameLayer } from "../src/render/frameCompositor.js";

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


it("opts into FP16 accumulation and keeps byte delivery and versioned source uploads", async () => {
  const device = await getNodeGPUDevice();
  const renderer = new HeadlessFrameCompositor(device, 1, 1, { workingFormat: "rgba16float" });
  const layer: FrameLayer = { id: "source", source: { rgba: new Uint8Array([160, 80, 40, 255]), width: 1, height: 1, version: "" }, opacity: 1, blendMode: "normal", zIndex: 0 };
  device.pushErrorScope("validation");
  try {
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([160, 80, 40, 255]);
    layer.source = { rgba: new Uint8Array([40, 80, 160, 255]), width: 1, height: 1, version: "next" };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([40, 80, 160, 255]);
    layer.source = { rgba: new Uint8Array([20, 60, 100, 255, 20, 60, 100, 255]), width: 2, height: 1, version: "next" };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([20, 60, 100, 255]);
    layer.crop = { left: 0.5, right: 0, top: 0, bottom: 0 };
    expect(Array.from(await renderer.renderFrame([layer]))).toEqual([20, 60, 100, 255]);
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
