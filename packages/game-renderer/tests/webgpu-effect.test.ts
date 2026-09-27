import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { LabeledTexture } from "@nodetool-ai/gpu/pool";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { describe, expect, it } from "vitest";
import { AssetCache } from "../src/canvas2d.js";
import { WebGPUGameRenderer } from "../src/webgpu.js";

const frame: GameRenderFrame = {
  tick: 1, width: 16, height: 9, pixelsPerUnit: 32,
  camera: { x: 0, y: 0, zoom: 1 },
  sprites: [{ entityId: "player", assetId: "player", x: 2, y: 0, previousX: 2, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, layer: 0 }],
  tiles: [], hud: [],
};

describe("game lighting", () => {
  it("combines a colored point light with unlit sprites before effects", async () => {
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 64;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      const sample: GameRenderFrame = { ...frame, sprites: [
        { ...frame.sprites[0]!, entityId: "lit", assetId: "wall", x: -2, previousX: -2, width: 2, height: 2 },
        { ...frame.sprites[0]!, entityId: "glow", assetId: "gem", x: 2, previousX: 2, width: 2, height: 2, unlit: true }
      ], lighting: { ambient: { color: "#ffffff", intensity: 0 }, points: [
        { x: -2, y: 0, color: "#ff0000", intensity: 1, radius: 3, falloff: 1 },
        { x: -2, y: 0, color: "#00ff00", intensity: 1, radius: 3, falloff: 1 }
      ] } };
      const stats = await renderer.render(sample, 1);
      expect(stats.targetBytes).toBe(width * height * 8);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const lit = [...bytes.slice((32 * width + 24) * 4, (32 * width + 24) * 4 + 4)];
      const glow = [...bytes.slice((32 * width + 40) * 4, (32 * width + 40) * 4 + 4)];
      expect(lit[0]).toBeGreaterThan(50);
      expect(lit[1]).toBeGreaterThan(50);
      expect(lit[2]).toBe(0);
      expect(glow).toEqual([255, 196, 50, 255]);
      expect((await renderer.render(sample, 1)).targetBytes).toBe(width * height * 8);
      const withoutLighting = { ...sample };
      delete withoutLighting.lighting;
      expect((await renderer.render(withoutLighting, 1)).targetBytes).toBe(0);
    } finally {
      readback.unmap();
      readback.destroy();
      target.destroy();
      renderer.dispose();
    }
  }, 30000);
});

describe("shared game GPU effect", () => {
  it("runs brightness and contrast on the sprite device and reports exact target bytes", async () => {
    const device = await createNodeGPUDevice();
    const width = 512;
    const height = 288;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const canvas = { width, height } as HTMLCanvasElement;
    const renderer = new WebGPUGameRenderer(canvas, device, context, "rgba8unorm", new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      expect(renderer.capabilities.gpuEffects).toBe(true);
      expect(renderer.capabilities.minimalRenderSucceeded).toBe(false);
      renderer.setEffects([{ kind: "brightnessContrast", brightness: 0.2, contrast: 1, required: true }]);
      const stats = await renderer.render(frame, 1);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const offset = (144 * width + 320) * 4;
      expect([...bytes.slice(offset, offset + 4)]).toEqual([130, 230, 255, 255]);
      expect(stats.drawCalls).toBe(3);
      expect(stats.targetBytes).toBe(width * height * 8);
      expect(renderer.capabilities.minimalRenderSucceeded).toBe(true);
    } finally {
      readback.unmap();
      readback.destroy();
      target.destroy();
      renderer.dispose();
    }
    expect(renderer.capabilities.deviceStatus).toBe("disposed");
  }, 30000);
});

describe("ordered game effects", () => {
  it("preserves a sprite color through an identity LUT and color conversions", async () => {
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 64;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const lutTexture = device.createTexture({ size: [4, 2], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const pixels = new Uint8Array(4 * 2 * 4);
    for (let b = 0; b < 2; b++) {
      for (let g = 0; g < 2; g++) {
        for (let r = 0; r < 2; r++) {
          const offset = (g * 4 + b * 2 + r) * 4;
          pixels.set([r * 255, g * 255, b * 255, 255], offset);
        }
      }
    }
    device.queue.writeTexture({ texture: lutTexture }, pixels, { bytesPerRow: 16 }, [4, 2]);
    const lut = new LabeledTexture(lutTexture, { label: "identity", format: "rgba8unorm", width: 4, height: 2,
      meta: { colorSpace: "srgb", alpha: "premultiplied", bindingKind: "texture_2d" } });
    Object.defineProperty(renderer, "getLutTexture", { value: async () => lut });
    const readback = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      renderer.setEffects([{ kind: "lut", assetId: "grade", size: 2, intensity: 1,
        domainMin: [0, 0, 0], domainMax: [1, 1, 1], required: true }]);
      const sample = { ...frame, sprites: [{ ...frame.sprites[0]!, x: 0, previousX: 0, y: 0, previousY: 0,
        width: 8, height: 8 }] };
      await renderer.render(sample, 1);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const center = [...bytes.slice((32 * width + 32) * 4, (32 * width + 32) * 4 + 4)];
      expect(center[0]).toBeGreaterThanOrEqual(40);
      expect(center[0]).toBeLessThanOrEqual(45);
      expect(center[1]).toBeGreaterThanOrEqual(198);
      expect(center[1]).toBeLessThanOrEqual(205);
      expect(center[2]).toBeGreaterThanOrEqual(229);
      expect(center[2]).toBeLessThanOrEqual(236);
      expect(center[3]).toBe(255);
    } finally {
      readback.unmap();
      readback.destroy();
      lutTexture.destroy();
      target.destroy();
      renderer.dispose();
    }
  }, 30000);

  it("spreads bloom beyond a bright sprite and keeps the output premultiplied", async () => {
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 64;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      renderer.setEffects([{ kind: "bloom", threshold: 0.2, softness: 0.1, radius: 5, intensity: 2, required: true }]);
      const sample = { ...frame, sprites: [{ ...frame.sprites[0]!, x: 0, previousX: 0, y: 0, previousY: 0,
        width: 4, height: 4 }] };
      const stats = await renderer.render(sample, 1);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const offset = (32 * width + 40) * 4;
      const halo = [...bytes.slice(offset, offset + 4)];
      expect(halo[3]).toBeGreaterThan(0);
      expect(halo[0]).toBeLessThanOrEqual(halo[3]!);
      expect(halo[1]).toBeLessThanOrEqual(halo[3]!);
      expect(halo[2]).toBeLessThanOrEqual(halo[3]!);
      expect(stats.targetBytes).toBe((width + 20) * (height + 20) * 20);
      readback.unmap();
      const offscreen = { ...sample, sprites: [{ ...sample.sprites[0]!, x: 8.4, previousX: 8.4,
        width: 0.5, height: 0.5 }] };
      await renderer.render(offscreen, 1);
      const edgeEncoder = device.createCommandEncoder();
      edgeEncoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([edgeEncoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const edge = new Uint8Array(readback.getMappedRange());
      expect(edge[(32 * width + 63) * 4 + 3]).toBeGreaterThan(0);
    } finally {
      readback.unmap();
      readback.destroy();
      target.destroy();
      renderer.dispose();
    }
  }, 30000);

  it("changes pixels when brightness and contrast order is reversed and releases targets", async () => {
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 64;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const pixel = async (): Promise<number[]> => {
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const result = [...bytes.slice((32 * width + 32) * 4, (32 * width + 32) * 4 + 4)];
      readback.unmap();
      return result;
    };
    const brighten = { kind: "brightnessContrast", brightness: 0.2, contrast: 1, required: true } as const;
    const contrast = { kind: "brightnessContrast", brightness: 0, contrast: 1.5, required: true } as const;
    try {
      const sample = { ...frame, sprites: [{ ...frame.sprites[0]!, x: 0, previousX: 0, y: 0, previousY: 0, width: 8, height: 8 }] };
      renderer.setEffects([brighten, contrast]);
      const firstStats = await renderer.render(sample, 1);
      const first = await pixel();
      renderer.setEffects([contrast, brighten]);
      await renderer.render(sample, 1);
      const second = await pixel();
      expect(first).not.toEqual(second);
      expect(firstStats.targetBytes).toBe(width * height * 8);
      for (let index = 0; index < 6; index++) {
        renderer.setEffects(index % 2 === 0 ? [brighten, contrast] : [contrast, brighten]);
        expect((await renderer.render(sample, 1)).targetBytes).toBe(firstStats.targetBytes);
      }
      renderer.setEffects([]);
      expect((await renderer.render(sample, 1)).targetBytes).toBe(0);
    } finally {
      readback.destroy();
      target.destroy();
      renderer.dispose();
    }
  }, 30000);
});

describe("sprite blending", () => {
  it("adds additive sprites onto what is already drawn", async () => {
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 36;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const sprite = (entityId: string, blend: "normal" | "additive") => ({ entityId, assetId: "wall", x: 0, y: 0, previousX: 0,
      previousY: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 4, height: 4, layer: 0, blend });
    try {
      const stats = await renderer.render({ ...frame, sprites: [sprite("base", "normal"), sprite("glow", "additive")] }, 1);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(readback.getMappedRange());
      const offset = (18 * width + 32) * 4;
      // The wall placeholder is (92, 105, 120); the additive copy doubles it.
      expect([...bytes.slice(offset, offset + 4)]).toEqual([184, 210, 240, 255]);
      expect(stats.drawCalls).toBe(2);
    } finally {
      readback.unmap();
      readback.destroy();
      target.destroy();
      renderer.dispose();
    }
  }, 30000);
});
