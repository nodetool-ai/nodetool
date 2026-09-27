import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createNodeGPUDevice } from "@nodetool-ai/gpu/node";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { describe, expect, it, vi } from "vitest";
import { AssetCache, Canvas2DGameRenderer } from "../src/canvas2d.js";
import { captureGameFrame } from "../src/node.js";
import { WebGPUGameRenderer } from "../src/webgpu.js";

const frame: GameRenderFrame = {
  tick: 1, width: 8, height: 8, pixelsPerUnit: 8,
  camera: { x: 0, y: 0, zoom: 1 }, hud: [], tiles: [],
  sprites: [
    { entityId: "gem", assetId: "gem", x: 0, y: 0, previousX: 0, previousY: 0,
      rotation: 0, scaleX: 1, scaleY: 1, width: 4, height: 4, layer: 0, unlit: true },
    { entityId: "wall", assetId: "wall", x: 0, y: 0, previousX: 0, previousY: 0,
      rotation: 0, scaleX: 1, scaleY: 1, width: 2, height: 2, layer: 1 },
  ],
  lighting: { ambient: { color: "#ffffff", intensity: 1 }, points: [] },
};

it("keeps a foreground lit sprite above an unlit sprite in headless capture", async () => {
  const image = await loadImage(Buffer.from(await captureGameFrame(frame)));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  expect([...context.getImageData(32, 32, 1, 1).data]).toEqual([92, 105, 120, 255]);
  expect([...context.getImageData(20, 32, 1, 1).data]).toEqual([255, 196, 50, 255]);
});

it("keeps a foreground lit sprite above an unlit sprite in Canvas2D", async () => {
  const canvas = createCanvas(64, 64);
  vi.stubGlobal("document", { createElement: () => createCanvas(1, 1) });
  try {
    const renderer = new Canvas2DGameRenderer(canvas as unknown as HTMLCanvasElement, new AssetCache(async () => null));
    expect((await renderer.render(frame, 1)).targetBytes).toBe(64 * 64 * 4);
    expect([...canvas.getContext("2d").getImageData(32, 32, 1, 1).data]).toEqual([92, 105, 120, 255]);
    expect([...canvas.getContext("2d").getImageData(20, 32, 1, 1).data]).toEqual([255, 196, 50, 255]);
    const unlitFrame = { ...frame };
    delete unlitFrame.lighting;
    expect((await renderer.render(unlitFrame, 1)).targetBytes).toBe(0);
    renderer.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("composites translucent and additive lit sprites over earlier unlit layers", async () => {
  const translucent: GameRenderFrame = { ...frame, sprites: [frame.sprites[0]!,
    { ...frame.sprites[1]!, opacity: 0.5 }] };
  const additive: GameRenderFrame = { ...frame, sprites: [frame.sprites[0]!,
    { ...frame.sprites[1]!, opacity: 0.5, blend: "additive" }] };
  const sample = async (input: GameRenderFrame): Promise<number[]> => {
    const image = await loadImage(Buffer.from(await captureGameFrame(input)));
    const canvas = createCanvas(64, 64);
    canvas.getContext("2d").drawImage(image, 0, 0);
    return [...canvas.getContext("2d").getImageData(32, 32, 1, 1).data];
  };
  const blended = await sample(translucent);
  const added = await sample(additive);
  expect(blended[0]).toBeGreaterThan(92);
  expect(blended[0]).toBeLessThan(255);
  expect(blended[2]).toBeGreaterThan(50);
  expect(added[1]).toBeGreaterThan(196);
  expect(added[2]).toBeGreaterThan(50);
});

it("matches CPU capture when overlapping point lights exceed unit irradiance", async () => {
  const sample: GameRenderFrame = { ...frame, sprites: [frame.sprites[1]!],
    lighting: { ambient: { color: "#ffffff", intensity: 0 }, points: [
      { x: 0, y: 0, color: "#ffffff", intensity: 2, radius: 10, falloff: 1 },
      { x: 0, y: 0, color: "#ffffff", intensity: 2, radius: 10, falloff: 1 },
    ] } };
  const captured = await loadImage(Buffer.from(await captureGameFrame(sample)));
  const cpuCanvas = createCanvas(64, 64);
  cpuCanvas.getContext("2d").drawImage(captured, 0, 0);
  const cpu = cpuCanvas.getContext("2d").getImageData(32, 32, 1, 1).data;
  const device = await createNodeGPUDevice();
  const target = device.createTexture({ size: [64, 64], format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
  const renderer = new WebGPUGameRenderer({ width: 64, height: 64 } as HTMLCanvasElement, device, context,
    "rgba8unorm", new AssetCache(async () => null));
  const readback = device.createBuffer({ size: 64 * 64 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    await renderer.render(sample, 1);
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 64 * 4 }, [64, 64]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const gpu = new Uint8Array(readback.getMappedRange()).slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4);
    for (let channel = 0; channel < 4; channel += 1) {
      expect(Math.abs((cpu[channel] ?? 0) - (gpu[channel] ?? 0)), `channel ${channel}`).toBeLessThanOrEqual(4);
    }
  } finally {
    readback.unmap();
    readback.destroy();
    renderer.dispose();
    target.destroy();
  }
}, 30000);

it("keeps each lit sprite's pixels when a later lit sprite reuses the light buffer", async () => {
  // The later additive sprite covers the earlier one, so a capture that replays
  // earlier draws from the shared light buffer would show only the later sprite.
  const layered: GameRenderFrame = { ...frame, sprites: [
    { ...frame.sprites[0]!, unlit: false, width: 2, height: 2 },
    { ...frame.sprites[1]!, width: 8, height: 8, blend: "additive" }
  ] };
  const image = await loadImage(Buffer.from(await captureGameFrame(layered)));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  // Gem (255, 196, 50) plus the additive wall (92, 105, 120), clamped.
  expect([...canvas.getContext("2d").getImageData(32, 32, 1, 1).data]).toEqual([255, 255, 170, 255]);
});
