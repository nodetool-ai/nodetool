import * as THREE from "three";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { configureDirectionalShadow } from "../src/renderer3d/shadows/index.js";
import { blockoutFrame } from "./fixtures/game3d.js";

declare global {
  interface Window {
    shadowResizeHarness: { readonly factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D>; readonly three: typeof THREE };
  }
}

it("releases a directional shadow target only when its requested dimensions change", () => {
  const light = new THREE.DirectionalLight();
  const definition = { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true } as const;
  const environment = blockoutFrame().environment;
  environment.shadows.enabled = true;
  configureDirectionalShadow(light, definition, environment);
  const target = new THREE.WebGLRenderTarget(512, 512);
  const depth = new THREE.DepthTexture(512, 512);
  target.depthTexture = depth;
  light.shadow.map = target;
  let targetDisposals = 0;
  let depthDisposals = 0;
  target.addEventListener("dispose", () => { targetDisposals++; });
  depth.addEventListener("dispose", () => { depthDisposals++; });
  try {
    configureDirectionalShadow(light, definition, environment);
    expect(light.shadow.map).toBe(target);
    expect(targetDisposals).toBe(0);
    environment.shadows.mapSize = 1024;
    configureDirectionalShadow(light, definition, environment);
    expect(light.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(light.shadow.map).toBeNull();
    expect(targetDisposals).toBe(1);
    expect(depthDisposals).toBe(1);
  } finally {
    if (targetDisposals === 0) { target.dispose(); }
    if (depthDisposals === 0) { depth.dispose(); }
    light.dispose();
  }
});

it("resizes actual directional shadow targets and matches fresh renderer pixels through growth and shrink", async () => {
  const bundle = await build({ stdin: {
    contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; import * as three from "three"; window.shadowResizeHarness={factory:createGameRenderer3D,three};',
    resolveDir: resolve("."), sourcefile: "shadow-resize-control.ts"
  }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0];
  if (!script) { throw new Error("Renderer bundle missing"); }
  const frame = blockoutFrame();
  frame.camera.transform.position = { x: 0, y: 3, z: 7 };
  frame.camera.transform.rotation = [-Math.sin(0.15), 0, 0, Math.cos(0.15)];
  const ground = { position: { x: 0, y: -1.05, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
  frame.entities.push({ entityId: "ground", transform: ground, previousTransform: ground,
    primitive: { kind: "plane", dimensions: { x: 20, y: 1, z: 20 }, material: { color: "#aaaaaa" } } });
  frame.environment.ambient.intensity = 0.2;
  frame.environment.shadows = { enabled: true, mapSize: 512, extent: 10 };
  const direction = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.8, 0.4, 0));
  frame.lights = [{ entityId: "sun", transform: { ...ground, position: { x: 3, y: 5, z: 4 }, rotation: [direction.x, direction.y, direction.z, direction.w] },
    light: { kind: "directional", color: "#ffffff", intensity: 2, castShadow: true, shadowBias: 0, shadowNormalBias: 0 } }];
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
    await page.goto("http://127.0.0.1/");
    await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async frame => {
      const { factory, three } = window.shadowResizeHarness;
      const canvas = document.querySelector("canvas");
      if (!canvas) { throw new Error("Canvas missing"); }
      const renderer = await factory({ canvas, preserveDrawingBuffer: true });
      renderer.resize(128, 128);
      const read = (canvas: HTMLCanvasElement): Uint8Array => {
        const gl = canvas.getContext("webgl2");
        if (!gl) { throw new Error("WebGL2 missing"); }
        const bytes = new Uint8Array(128 * 128 * 4);
        gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return bytes;
      };
      const cases: { requested: number; width: number; height: number; sameTarget: boolean; equalPixels: boolean }[] = [];
      let prior: import("three").WebGLRenderTarget | undefined;
      let disposed = 0;
      try {
        for (const size of [512, 1024, 1024, 512] as const) {
          frame.environment.shadows.mapSize = size;
          await renderer.render(frame);
          const targets: import("three").WebGLRenderTarget[] = [];
          renderer.getScene().traverse(object => {
            if (object instanceof three.DirectionalLight && object.castShadow && object.shadow.map) { targets.push(object.shadow.map); }
          });
          const target = targets[0];
          if (!target) { throw new Error("Rendered directional shadow target missing"); }
          if (target !== prior) { target.addEventListener("dispose", () => { disposed++; }); }
          const actual = read(canvas);
          const freshCanvas = document.createElement("canvas");
          const fresh = await factory({ canvas: freshCanvas, preserveDrawingBuffer: true });
          fresh.resize(128, 128);
          try {
            await fresh.render(frame);
            const expected = read(freshCanvas);
            cases.push({ requested: size, width: target.width, height: target.height, sameTarget: target === prior,
              equalPixels: actual.every((value, index) => value === expected[index]) });
          } finally { fresh.dispose(); }
          prior = target;
        }
        const shadowed = read(canvas);
        frame.environment.shadows.enabled = false;
        await renderer.render(frame);
        const unshadowed = read(canvas);
        return { cases, disposed, shadowChangedPixels: shadowed.reduce((count, value, index) => count + Number(value !== unshadowed[index]), 0) };
      } finally { renderer.dispose(); }
    }, frame);
    expect(result.cases).toEqual([512, 1024, 1024, 512].map((size, index) => ({ requested: size, width: size, height: size, sameTarget: index === 2, equalPixels: true })));
    expect(result.disposed).toBe(2);
    expect(result.shadowChangedPixels).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);
