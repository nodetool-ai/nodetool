import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { blockoutFrame } from "./fixtures/game3d.js";

interface FogHarness3D {
  readonly factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D>;
  readonly three: typeof import("three");
}
declare global { interface Window { fogHarness3D: FogHarness3D } }

it("fogs actual instanced world positions and restores exact clear and linear pixels", async () => {
  const bundle = await build({ stdin: { contents: `import {createGameRenderer3D} from "./src/browser3d.ts";
    import * as three from "three"; window.fogHarness3D = {factory:createGameRenderer3D,three};`,
    resolveDir: resolve("."), sourcefile: "fog-lifecycle.ts" }, bundle: true, format: "iife", platform: "browser",
    write: false, minify: true, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0];
  if (!script) { throw new Error("Renderer bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async (frame: GameRenderFrame3D) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) { throw new Error("Canvas is missing"); }
      const { factory, three } = window.fogHarness3D;
      const renderer = await factory({ canvas, preserveDrawingBuffer: true });
      renderer.resize(128, 128);
      frame.entities = [];
      frame.camera.transform.position.y = 0.75;
      const geometry = new three.BoxGeometry(1, 1, 1);
      const material = new three.MeshStandardMaterial({ color: "#0088ff", metalness: 0, roughness: 1 });
      const originalHook = material.onBeforeCompile;
      const instances = new three.InstancedMesh(geometry, material, 2);
      instances.setMatrixAt(0, new three.Matrix4().makeTranslation(-0.8, 0, 0));
      instances.setMatrixAt(1, new three.Matrix4().makeTranslation(0.8, 1.5, 0));
      renderer.getScene().add(instances);
      const read = (): Uint8Array => {
        const gl = canvas.getContext("webgl2");
        if (!gl) { throw new Error("WebGL2 context is missing"); }
        const pixels = new Uint8Array(128 * 128 * 4);
        gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
      };
      try {
        await renderer.render(frame);
        const clear = read();
        frame.environment.fog = { kind: "height", color: "#ff0000", density: 1, baseHeight: 0, heightFalloff: 1, maxOpacity: 1 };
        await renderer.render(frame);
        const height = read();
        const lowRed = height[((127 - 81) * 128 + 46) * 4];
        const highRed = height[((127 - 47) * 128 + 82) * 4];
        delete frame.environment.fog;
        await renderer.render(frame);
        const clearRestored = read().every((value, index) => value === clear[index]);
        const hookRestored = material.onBeforeCompile === originalHook;
        frame.environment.fog = { color: "#cad9e4", near: 1, far: 10 };
        await renderer.render(frame);
        const linear = read();
        frame.environment.fog = { kind: "height", color: "#ffffff", density: 1, baseHeight: 0, heightFalloff: 1, maxOpacity: 1 };
        await renderer.render(frame);
        frame.environment.fog = { color: "#cad9e4", near: 1, far: 10 };
        await renderer.render(frame);
        return { lowRed, highRed, clearRestored, hookRestored,
          linearRestored: read().every((value, index) => value === linear[index]) };
      } finally { instances.removeFromParent(); geometry.dispose(); material.dispose(); renderer.dispose(); }
    }, blockoutFrame());
    expect(result.lowRed).toBeGreaterThan((result.highRed ?? 255) + 30);
    expect(result.clearRestored).toBe(true);
    expect(result.linearRestored).toBe(true);
    expect(result.hookRestored).toBe(true);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);
