import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { describe, expect, it, vi } from "vitest";
import { captureGameFrame } from "../src/node.js";
import { AssetCache } from "../src/canvas2d.js";
import { WebGPUGameRenderer } from "../src/webgpu.js";

const frame: GameRenderFrame = {
  tick: 0, width: 8, height: 8, pixelsPerUnit: 8,
  camera: { x: 0, y: 0, zoom: 1 },
  sprites: [{ entityId: "gem", assetId: "gem", x: 0, y: 0, previousX: 0, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 2, height: 2, layer: 0 }],
  tiles: [], hud: []
};

async function pixels(png: Uint8Array): Promise<Uint8ClampedArray> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height).data;
}

describe("headless game effect capture", () => {
  function lut(invert = false): Uint8Array {
    const canvas = createCanvas(4, 2);
    const context = canvas.getContext("2d");
    const image = context.createImageData(4, 2);
    for (let b = 0; b < 2; b += 1) {
      for (let g = 0; g < 2; g += 1) {
        for (let r = 0; r < 2; r += 1) {
          const offset = (g * 4 + b * 2 + r) * 4;
          image.data.set([invert ? 255 - r * 255 : r * 255, invert ? 255 - g * 255 : g * 255,
            invert ? 255 - b * 255 : b * 255, 255], offset);
        }
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toBuffer("image/png");
  }

  it("reports optional effects and rejects required effects on Canvas2D", async () => {
    const effect = { kind: "bloom", threshold: 0.2, softness: 0.1, radius: 5, intensity: 2 } as const;
    const diagnostic = vi.fn();
    await captureGameFrame(frame, { effects: [{ ...effect, required: false }], onDiagnostic: diagnostic });
    expect(diagnostic).toHaveBeenCalledWith("Optional GPU effects omitted in Canvas2D capture");
    await expect(captureGameFrame(frame, { effects: [{ ...effect, required: true }] })).rejects.toThrow("Required GPU effect");
  });

  it("runs bloom on Dawn and retains a halo outside the sprite bounds", async () => {
    const effect = { kind: "bloom", threshold: 0.2, softness: 0.1, radius: 5, intensity: 2, required: true } as const;
    const plain = await captureGameFrame(frame);
    const bloomed = await captureGameFrame(frame, { backend: "webgpu", effects: [effect] });
    expect((await pixels(plain))[(32 * 64 + 42) * 4 + 3]).toBe(0);
    expect((await pixels(bloomed))[(32 * 64 + 42) * 4 + 3]).toBeGreaterThan(0);
  }, 30000);

  it("includes bright sprites just outside the viewport in bloom capture", async () => {
    const outside = { ...frame, sprites: [{ ...frame.sprites[0]!, x: 4.75, previousX: 4.75, width: 1, height: 1 }] };
    const effect = { kind: "bloom", threshold: 0.2, softness: 0.1, radius: 5, intensity: 2, required: true } as const;
    const plain = await captureGameFrame(outside);
    const bloomed = await captureGameFrame(outside, { backend: "webgpu", effects: [effect] });
    expect((await pixels(plain))[(32 * 64 + 63) * 4 + 3]).toBe(0);
    expect((await pixels(bloomed))[(32 * 64 + 63) * 4 + 3]).toBeGreaterThan(0);
  }, 30000);

  it("keeps HUD pixels outside the effect chain in afterEffects mode", async () => {
    const sample = { ...frame, sprites: [], hud: [{ id: "label", text: "A", x: 8, y: 36, size: 28, color: "#ffffff" }] };
    const effect = { kind: "brightnessContrast", brightness: -1, contrast: 1, required: true } as const;
    const after = await captureGameFrame(sample, { backend: "webgpu", effects: [effect], hudEffectOrder: "afterEffects" });
    const before = await captureGameFrame(sample, { backend: "webgpu", effects: [effect], hudEffectOrder: "beforeEffects" });
    expect(after).not.toEqual(before);
    const hasWhite = async (png: Uint8Array): Promise<boolean> => {
      const rgba = await pixels(png);
      for (let y = 0; y < 42; y += 1) {
        for (let x = 0; x < 36; x += 1) {
          const offset = (y * 64 + x) * 4;
          if ((rgba[offset] ?? 0) > 200 && (rgba[offset + 3] ?? 0) > 0) return true;
        }
      }
      return false;
    };
    expect(await hasWhite(after)).toBe(true);
    expect(await hasWhite(before)).toBe(false);
  }, 30000);

  it("loads an offline identity LUT and preserves source colors", async () => {
    const effect = { kind: "lut", assetId: "identity", size: 2, intensity: 1,
      domainMin: [0, 0, 0], domainMax: [1, 1, 1], required: true } as const;
    const source = await captureGameFrame(frame);
    const graded = await captureGameFrame(frame, { backend: "webgpu", effects: [effect],
      resolveAsset: async (id) => id === "identity" ? lut() : null });
    const before = await pixels(source);
    const after = await pixels(graded);
    const offset = (32 * 64 + 32) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      expect(Math.abs((before[offset + channel] ?? 0) - (after[offset + channel] ?? 0))).toBeLessThanOrEqual(4);
    }
  }, 30000);

  it("respects LUT chain order and rejects missing required LUTs", async () => {
    const grade = { kind: "lut", assetId: "invert", size: 2, intensity: 1,
      domainMin: [0, 0, 0], domainMax: [1, 1, 1], required: true } as const;
    const brighten = { kind: "brightnessContrast", brightness: 0.2, contrast: 1, required: true } as const;
    const resolveAsset = async (id: string): Promise<Uint8Array | null> => id === "invert" ? lut(true) : null;
    const first = await captureGameFrame(frame, { backend: "webgpu", effects: [grade, brighten], resolveAsset });
    const second = await captureGameFrame(frame, { backend: "webgpu", effects: [brighten, grade], resolveAsset });
    expect((await pixels(first))[(32 * 64 + 32) * 4]).not.toBe((await pixels(second))[(32 * 64 + 32) * 4]);
    await expect(captureGameFrame(frame, { backend: "webgpu", effects: [grade] })).rejects.toThrow("Required GPU capture effect failed");
  }, 30000);

  it("matches the browser GPU effect path at opaque and halo pixels within 8 bytes", async () => {
    const effects = [
      { kind: "brightnessContrast", brightness: 0.1, contrast: 1, required: true },
      { kind: "bloom", threshold: 0.2, softness: 0.1, radius: 5, intensity: 2, required: true }
    ] as const;
    const captured = await pixels(await captureGameFrame(frame, { backend: "webgpu", effects }));
    const device = await createNodeGPUDevice();
    const width = 64;
    const height = 64;
    const target = device.createTexture({ size: [width, height], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    // A headless target stands in for the browser canvas's current texture.
    const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
    const renderer = new WebGPUGameRenderer({ width, height } as HTMLCanvasElement, device, context, "rgba8unorm",
      new AssetCache(async () => null));
    const readback = device.createBuffer({ size: width * height * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      renderer.setEffects(effects);
      await renderer.render(frame, 1);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const browser = new Uint8Array(readback.getMappedRange());
      for (const [x, y] of [[32, 32], [42, 32]] as const) {
        const offset = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          const capturedPremul = channel === 3 ? captured[offset + channel] ?? 0 :
            Math.round((captured[offset + channel] ?? 0) * (captured[offset + 3] ?? 0) / 255);
          const difference = Math.abs(capturedPremul - (browser[offset + channel] ?? 0));
          expect(difference, `pixel ${x},${y} channel ${channel}`).toBeLessThanOrEqual(8);
        }
      }
    } finally {
      readback.unmap();
      readback.destroy();
      renderer.dispose();
      target.destroy();
      device.destroy();
    }
  }, 30000);
});
