import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { gameLight3D, gamePostProcessing3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D, GameEditorView3D } from "../src/browser3d.js";
import { GAME_EDITOR_DIRECTION_LENGTH_3D, GAME_EDITOR_OVERDRAW_LAYER_3D, gameLightHelperPositions3D, resolveGameEditorView3D } from "../src/renderer3d/passes/editor.js";
import { compareGameCaptures } from "../src/imageDiff.js";
import { blockoutFrame } from "./fixtures/game3d.js";

declare global {
  interface Window {
    editorHarness: { factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D>; editorPasses: CreateGameRenderer3DOptions["editorPasses"] };
  }
}

const EDITOR_MARKER = "GameEditorOutlineShader";

function vertices(positions: Float32Array): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let index = 0; index < positions.length; index += 3) { result.push([positions[index] ?? NaN, positions[index + 1] ?? NaN, positions[index + 2] ?? NaN]); }
  return result;
}

describe("editor pass settings", () => {
  it("defaults to the lit view with no outline and no helpers", () => {
    expect(resolveGameEditorView3D(null)).toEqual({ mode: "lit", selectedIds: [], lightHelpers: false, outlineColor: "#ff9f1a" });
    expect(resolveGameEditorView3D({ mode: "overdraw", selectedIds: ["a"] })).toMatchObject({ mode: "overdraw", selectedIds: ["a"], lightHelpers: false });
  });

  it("draws a point light's range as three circles of that radius", () => {
    const points = vertices(gameLightHelperPositions3D(gameLight3D.parse({ kind: "point", color: "#ffffff", intensity: 1, range: 3 })));
    expect(points.length).toBe(3 * 48 * 2);
    for (const [x, y, z] of points) { expect(Math.hypot(x, y, z)).toBeCloseTo(3, 5); }
  });

  it("draws a spot light's cone out to its range, including a flat cone at the widest angle", () => {
    const narrow = vertices(gameLightHelperPositions3D(gameLight3D.parse({ kind: "spot", color: "#ffffff", intensity: 1, range: 4, angle: Math.PI / 6 })));
    const rim = narrow.slice(0, 96);
    for (const [x, y, z] of rim) { expect(Math.hypot(x, y)).toBeCloseTo(2, 5); expect(z).toBeCloseTo(-4 * Math.cos(Math.PI / 6), 5); }
    for (const [x, y, z] of narrow.slice(96)) { expect([0, 4].map((length) => Math.abs(Math.hypot(x, y, z) - length) < 1e-5).some(Boolean)).toBe(true); }
    const wide = vertices(gameLightHelperPositions3D(gameLight3D.parse({ kind: "spot", color: "#ffffff", intensity: 1, range: 4, angle: Math.PI / 2 })));
    for (const [, , z] of wide) { expect(Math.abs(z)).toBeLessThan(1e-9); }
  });

  it("draws a directional light's direction along -Z", () => {
    const points = vertices(gameLightHelperPositions3D(gameLight3D.parse({ kind: "directional", color: "#ffffff", intensity: 1 })));
    expect(points.at(-1)).toEqual([0, 0, -GAME_EDITOR_DIRECTION_LENGTH_3D]);
  });
});

describe("editor passes stay out of player and capture bundles", () => {
  const bundle = async (contents: string): Promise<string> => {
    const result = await build({ stdin: { contents, resolveDir: resolve("."), sourcefile: "entry.ts" }, bundle: true, format: "esm", platform: "browser",
      target: "es2022", minify: true, write: false, conditions: ["nodetool-dev"], logLevel: "silent" });
    return result.outputFiles[0]?.text ?? "";
  };

  it("bundles the outline shader only when the editor passes are imported", async () => {
    // Positive control: the marker survives minification when the editor passes are used.
    expect(await bundle('import { createGameEditorPasses3D } from "./src/browser3d.ts"; globalThis.passes = createGameEditorPasses3D;')).toContain(EDITOR_MARKER);
    expect(await bundle('import "./src/standalone-player3d.ts";')).not.toContain(EDITOR_MARKER);
    expect(await bundle('import "./src/renderer3d/capture-page.ts";')).not.toContain(EDITOR_MARKER);
  }, 60_000);
});

describe("editor passes in real Chromium", () => {
  it("draws view modes, the selection outline and light helpers, and restores the lit render", async () => {
    const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D, createGameEditorPasses3D} from "./src/browser3d.ts"; window.editorHarness = { factory: createGameRenderer3D, editorPasses: createGameEditorPasses3D };',
      resolveDir: resolve("."), sourcefile: "editor3d.ts" }, bundle: true, format: "iife", platform: "browser", minify: true, write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      const base = blockoutFrame();
      const identity = { position: { x: 0, y: 0, z: 2 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
      const front: GameRenderFrame3D["entities"][number] = { entityId: "front", transform: identity, previousTransform: identity,
        primitive: { ...base.entities[0]!.primitive!, dimensions: { x: 0.5, y: 0.5, z: 0.5 } } };
      const frame: GameRenderFrame3D = { ...base, entities: [...base.entities, front],
        lights: [{ entityId: "lamp", transform: { position: { x: 0, y: 0, z: 3 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } },
          light: gameLight3D.parse({ kind: "point", color: "#00ff00", intensity: 0, range: 1 }) }] };
      const post: GameRenderFrame3D = { ...frame, environment: { ...frame.environment, postProcessing: gamePostProcessing3D.parse({ bloom: { threshold: 0, intensity: 2 }, vignette: { intensity: 1 } }) } };
      const views: Array<{ frame: GameRenderFrame3D; view: GameEditorView3D | null }> = [
        { frame, view: null },
        { frame, view: { mode: "lit", selectedIds: [], lightHelpers: false } },
        { frame, view: { selectedIds: ["box"] } },
        { frame, view: { selectedIds: ["missing"] } },
        { frame, view: { mode: "unlit" } },
        { frame, view: { mode: "wireframe" } },
        { frame, view: { mode: "overdraw" } },
        { frame, view: { lightHelpers: true } },
        { frame: post, view: { mode: "unlit" } },
        { frame, view: null }
      ];
      const result = await page.evaluate(async ({ frame: plainFrame, views: rendered }) => {
        const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas missing"); }
        const read = (): number[] => {
          const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height;
          const context = copy.getContext("2d"); if (!context) { throw new Error("2D context missing"); }
          context.drawImage(canvas, 0, 0);
          return [...context.getImageData(0, 0, copy.width, copy.height).data];
        };
        const plain = await window.editorHarness.factory({ canvas, preserveDrawingBuffer: true });
        let withoutPasses: { image: string; pixels: number[]; error: string };
        try {
          plain.resize(128, 128);
          await plain.render(plainFrame, 1);
          let error = "";
          try { plain.setEditorView({ mode: "wireframe" }); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
          withoutPasses = { image: canvas.toDataURL("image/png"), pixels: read(), error };
        } finally { plain.dispose(); }
        const renderer = await window.editorHarness.factory({ canvas, preserveDrawingBuffer: true, editorPasses: window.editorHarness.editorPasses });
        try {
          renderer.resize(128, 128);
          const captures: Array<{ image: string; pixels: number[] }> = [];
          for (const item of rendered) {
            renderer.setEditorView(item.view);
            await renderer.render(item.frame, 1);
            captures.push({ image: canvas.toDataURL("image/png"), pixels: read() });
          }
          return { withoutPasses, captures };
        } finally { renderer.dispose(); }
      }, { frame, views });
      expect(pageErrors).toEqual([]);
      expect(result.withoutPasses.error).toBe("This 3D renderer was created without editor passes");
      const png = (dataUrl: string): Buffer => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const pixel = (pixels: number[], x: number, y: number): number[] => pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3);
      const plain = png(result.withoutPasses.image);
      const [nullView, litView, outlined, missing, unlit, wireframe, overdraw, helpers, unlitPost, restored] = result.captures;
      if (!nullView || !litView || !outlined || !missing || !unlit || !wireframe || !overdraw || !helpers || !unlitPost || !restored) { throw new Error("Editor captures are missing"); }
      const changed = async (image: string): Promise<number> => (await compareGameCaptures(plain, png(image), 0)).changedPixels;
      // Installed but idle editor passes leave the lit render untouched.
      expect(await changed(nullView.image)).toBe(0);
      expect(await changed(litView.image)).toBe(0);
      expect(await changed(missing.image)).toBe(0);
      expect(await changed(restored.image)).toBe(0);
      // The outline hugs the selected box: the background just left of its silhouette turns orange, the box itself does not change.
      const background = pixel(result.withoutPasses.pixels, 2, 2);
      let edge = 0; while (edge < 64 && pixel(result.withoutPasses.pixels, edge, 64).every((value, index) => Math.abs(value - (background[index] ?? 0)) <= 2)) { edge++; }
      expect(edge).toBeGreaterThan(8);
      expect(pixel(outlined.pixels, edge - 1, 64)).toEqual([255, 159, 26]);
      expect(pixel(outlined.pixels, edge - 8, 64)).toEqual(background);
      expect(pixel(outlined.pixels, 64, 64)).toEqual(pixel(result.withoutPasses.pixels, 64, 64));
      // Unlit shows the material colour as authored, without lighting or tone mapping.
      for (const [index, value] of [0, 136, 255].entries()) { expect(Math.abs((pixel(unlit.pixels, 64, 64)[index] ?? 0) - value)).toBeLessThanOrEqual(1); }
      // Post-processing is bypassed in debug view modes.
      expect((await compareGameCaptures(png(unlit.image), png(unlitPost.image), 0)).changedPixels).toBe(0);
      // Wireframe leaves the face interiors empty.
      expect(pixel(wireframe.pixels, 50, 60)).toEqual(background);
      // Overdraw: black background, two layers (front and back faces) over the big box, four where the small box covers it.
      expect(pixel(overdraw.pixels, 2, 2)).toEqual([0, 0, 0]);
      const twoLayers = pixel(overdraw.pixels, edge + 4, 64)[0] ?? 0;
      const fourLayers = pixel(overdraw.pixels, 64, 64)[0] ?? 0;
      expect(Math.abs(twoLayers - 2 * GAME_EDITOR_OVERDRAW_LAYER_3D.r * 255)).toBeLessThanOrEqual(3);
      expect(Math.abs(fourLayers - 4 * GAME_EDITOR_OVERDRAW_LAYER_3D.r * 255)).toBeLessThanOrEqual(3);
      // The point light's range circle is drawn in its colour on top of the box.
      expect(await changed(helpers.image)).toBeGreaterThan(0);
      const green = [];
      for (let index = 0; index < helpers.pixels.length; index += 4) {
        if ((helpers.pixels[index + 1] ?? 0) > 200 && (helpers.pixels[index] ?? 255) < 80) { green.push(index); }
      }
      expect(green.length).toBeGreaterThan(50);
    } finally { await browser.close(); }
  }, 60_000);
});
