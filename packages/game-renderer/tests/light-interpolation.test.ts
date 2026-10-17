import { expect, it } from "vitest";
import { gameRenderFrame, type GameRenderFrame } from "@nodetool-ai/protocol";
import { applyLighting } from "../src/lighting.js";
import { gameLightingUniforms } from "../src/webgpu/lighting.js";

const point = { x: 1, y: 0, previousX: 0, previousY: 0, color: "#ffffff", intensity: 1, radius: 0.75, falloff: 1 };
const frame: GameRenderFrame = { tick: 1, width: 4, height: 4, pixelsPerUnit: 32,
  camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [], hud: [],
  lighting: { ambient: { color: "#000000", intensity: 0 }, points: [point] } };

it.each([0, 0.5, 1])("samples CPU and GPU lights at the same presentation position (alpha=%s)", (alpha) => {
  const pixels = new Uint8ClampedArray(16 * 16 * 4).fill(255);
  const reference = pixels.slice();
  applyLighting(pixels, 16, 16, frame, alpha);
  const fixed: GameRenderFrame = { ...frame, lighting: { ...frame.lighting!, points: [{ ...point, x: alpha, previousX: alpha }] } };
  applyLighting(reference, 16, 16, fixed, alpha);
  expect(pixels).toEqual(reference);
  expect([...gameLightingUniforms(frame, alpha).slice(8, 10)]).toEqual([alpha, 0]);
});

it("preserves light history through the public render-frame schema", () => {
  expect(gameRenderFrame.parse(frame).lighting?.points[0]).toMatchObject({ previousX: 0, previousY: 0 });
});

it("keeps authored fixed lights at their position without presentation history", () => {
  const fixedPoint = { x: 2, y: -1, color: "#ffffff", intensity: 1, radius: 0.75, falloff: 1 };
  const fixed = { ...frame, lighting: { ...frame.lighting!, points: [fixedPoint] } };
  expect([...gameLightingUniforms(fixed, 0).slice(8, 10)]).toEqual([2, -1]);
});

it("keeps actual browser WebGPU lights aligned with Canvas at fractional interpolation", async () => {
  const { createServer } = await import("node:http");
  const { build } = await import("esbuild");
  const { chromium } = await import("@playwright/test");
  const bundle = await build({ stdin: {
    contents: 'export { AssetCache, Canvas2DGameRenderer } from "./src/canvas2d.js"; export { WebGPUGameRenderer } from "./src/webgpu.js";',
    resolveDir: new URL("../", import.meta.url).pathname
  }, bundle: true, write: false, platform: "browser", format: "iife", globalName: "LightInterpolationTest" });
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>Light interpolation regression</title>");
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Regression server did not bind");
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    const script = bundle.outputFiles[0];
    if (!script) throw new Error("Light renderer bundle is missing");
    await page.addScriptTag({ content: script.text });
    const differences = await page.evaluate(async (base) => {
      const api: typeof import("../src/canvas2d.js") & typeof import("../src/webgpu.js") = Reflect.get(window, "LightInterpolationTest");
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error("Browser WebGPU adapter is unavailable");
      const device = await adapter.requestDevice();
      const target = device.createTexture({ size: [64, 64], format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const context = { getCurrentTexture: () => target, unconfigure: () => undefined } as unknown as GPUCanvasContext;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const renderer = new api.WebGPUGameRenderer(canvas, device, context, "rgba8unorm", new api.AssetCache(async () => null));
      const referenceCanvas = document.createElement("canvas");
      referenceCanvas.width = referenceCanvas.height = 64;
      const reference = new api.Canvas2DGameRenderer(referenceCanvas, new api.AssetCache(async () => null));
      const readback = device.createBuffer({ size: 64 * 64 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const results: number[] = [];
      const input = { ...base, sprites: [{ entityId: "floor", assetId: "wall", x: 0, y: 0, previousX: 0, previousY: 0,
        width: 4, height: 4, scaleX: 1, scaleY: 1, rotation: 0, layer: 0 }] };
      try {
        for (const alpha of [0, 0.5, 1]) {
          const fixed = { ...input, lighting: { ...input.lighting!, points: input.lighting!.points.map((light) =>
            ({ ...light, x: alpha, previousX: alpha })) } };
          await reference.render(fixed, 1);
          await renderer.render(input, alpha);
          const encoder = device.createCommandEncoder();
          encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 256 }, [64, 64]);
          device.queue.submit([encoder.finish()]);
          await readback.mapAsync(GPUMapMode.READ);
          const gpu = new Uint8Array(readback.getMappedRange());
          const cpu = referenceCanvas.getContext("2d")?.getImageData(0, 0, 64, 64).data;
          if (!cpu) throw new Error("Canvas reference is unavailable");
          let maximum = 0;
          for (let index = 0; index < gpu.length; index++) maximum = Math.max(maximum, Math.abs(gpu[index]! - cpu[index]!));
          results.push(maximum);
          readback.unmap();
        }
        return results;
      } finally {
        readback.destroy();
        reference.dispose();
        target.destroy();
        renderer.dispose();
      }
    }, frame);
    expect(differences).toHaveLength(3);
    for (const difference of differences) expect(difference).toBeLessThanOrEqual(4);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
