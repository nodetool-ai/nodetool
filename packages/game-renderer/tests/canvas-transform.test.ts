import { createCanvas } from "@napi-rs/canvas";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { afterEach, expect, it, vi } from "vitest";
import { AssetCache, Canvas2DGameRenderer } from "../src/canvas2d.js";

const frame: GameRenderFrame = {
  tick: 1, width: 100, height: 100, pixelsPerUnit: 1,
  camera: { x: 0, y: 0, zoom: 1 }, hud: [], tiles: [],
  sprites: [{ entityId: "wall", assetId: "wall", x: 0, y: 0, previousX: 0, previousY: 0,
    rotation: 0, scaleX: 1, scaleY: 1, width: 20, height: 10, layer: 0 }],
};

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("scales rotated geometry after rotation, including lighting bounds (lit=%s)", async (lit) => {
  vi.stubGlobal("document", { createElement: () => createCanvas(1, 1) });
  const canvas = createCanvas(100, 100);
  const renderer = new Canvas2DGameRenderer(canvas as unknown as HTMLCanvasElement, new AssetCache(async () => null));
  try {
    for (const [width, height] of [[100, 100], [200, 100], [100, 200], [100, 100]]) {
      renderer.resize(width, height);
      for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
        const input: GameRenderFrame = { ...frame, sprites: [{ ...frame.sprites[0]!, rotation }] };
        if (lit) input.lighting = { ambient: { color: "#ffffff", intensity: 1 }, points: [] };
        await renderer.render(input, 1);
        const reference = createCanvas(width, height);
        const context = reference.getContext("2d");
        context.translate(width / 2, height / 2);
        context.scale(width / frame.width, height / frame.height);
        context.rotate(-rotation);
        context.fillStyle = "#5c6978";
        context.fillRect(-10, -5, 20, 10);
        expect(canvas.getContext("2d").getImageData(0, 0, width, height).data,
          `${width}x${height}, rotation ${rotation}`).toEqual(context.getImageData(0, 0, width, height).data);
      }
    }
  } finally {
    renderer.dispose();
  }
});

it("matches world rotation followed by viewport scaling in browser Canvas2D", async () => {
  const { build } = await import("esbuild");
  const { chromium } = await import("@playwright/test");
  const bundle = await build({ entryPoints: [new URL("../src/canvas2d.ts", import.meta.url).pathname],
    bundle: true, write: false, platform: "browser", format: "iife", globalName: "CanvasResizeTest" });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const script = bundle.outputFiles[0];
    if (!script) throw new Error("Canvas renderer bundle is missing");
    await page.addScriptTag({ content: script.text });
    const failures = await page.evaluate(async (baseFrame) => {
      const api: typeof import("../src/canvas2d.js") = Reflect.get(window, "CanvasResizeTest");
      const canvas = document.createElement("canvas");
      const renderer = new api.Canvas2DGameRenderer(canvas, new api.AssetCache(async () => null));
      const mismatches: string[] = [];
      try {
        for (const lit of [false, true]) {
          for (const [width, height] of [[100, 100], [200, 100], [100, 200], [100, 100]]) {
            renderer.resize(width, height);
            for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
              const input = { ...baseFrame, sprites: [{ ...baseFrame.sprites[0]!, rotation }],
                ...(lit ? { lighting: { ambient: { color: "#ffffff", intensity: 1 }, points: [] } } : {}) };
              await renderer.render(input, 1);
              const reference = document.createElement("canvas");
              reference.width = width;
              reference.height = height;
              const expected = reference.getContext("2d");
              const actual = canvas.getContext("2d");
              if (!expected || !actual) throw new Error("Canvas2D unavailable");
              expected.translate(width / 2, height / 2);
              expected.scale(width / baseFrame.width, height / baseFrame.height);
              expected.rotate(-rotation);
              expected.fillStyle = "#5c6978";
              expected.fillRect(-10, -5, 20, 10);
              const a = actual.getImageData(0, 0, width, height).data;
              const b = expected.getImageData(0, 0, width, height).data;
              if (a.some((value, index) => value !== b[index])) mismatches.push(`${width}x${height}/${rotation}/lit=${lit}`);
            }
          }
        }
      } finally {
        renderer.dispose();
      }
      return mismatches;
    }, frame);
    expect(failures).toEqual([]);
  } finally {
    await browser.close();
  }
});

it("retains device-pixel snapping through fractional zoom and zero-size resize recovery", async () => {
  const canvas = createCanvas(100, 100);
  const renderer = new Canvas2DGameRenderer(canvas as unknown as HTMLCanvasElement, new AssetCache(async () => null));
  const tile = { entityId: "tile", assetId: "wall", x: 0.37, y: 0.21, width: 3.3, height: 2.1, layer: 0 };
  const input: GameRenderFrame = { ...frame, camera: { ...frame.camera, zoom: 1.3 }, sprites: [], tiles: [tile] };
  try {
    renderer.resize(0, 0);
    await renderer.render(input, 1);
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    renderer.resize(200, 100);
    await renderer.render(input, 1);
    const reference = createCanvas(200, 100);
    const context = reference.getContext("2d");
    const centerX = 100 + tile.x * 1.3 * 2;
    const centerY = 50 - tile.y * 1.3;
    const left = Math.round(centerX - tile.width * 1.3);
    const right = Math.round(centerX + tile.width * 1.3);
    const top = Math.round(centerY - tile.height * 1.3 / 2);
    const bottom = Math.round(centerY + tile.height * 1.3 / 2);
    context.fillStyle = "#5c6978";
    context.fillRect(left, top, right - left, bottom - top);
    expect(canvas.getContext("2d").getImageData(0, 0, 200, 100).data).toEqual(context.getImageData(0, 0, 200, 100).data);
  } finally {
    renderer.dispose();
  }
});
