import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
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
      renderer.setEffect({ kind: "brightnessContrast", brightness: 0.2, contrast: 1 });
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
  });
});
