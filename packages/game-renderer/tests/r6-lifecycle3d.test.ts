import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { gameParticleEmitter, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import { blockoutFrame, triangleGlb } from "./fixtures/game3d.js";

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

it("keeps cached decal projections behind real transparent GLB geometry", async () => {
  const image = createCanvas(16, 16); const context = image.getContext("2d"); context.fillStyle = "#ff0000"; context.fillRect(0, 0, 16, 16);
  const imageBytes = new Uint8Array(image.toBuffer("image/png"));
  const prepared = await prepareGameImage3D(imageBytes, { assetId: "paint" });
  if (!prepared.ok) { throw new Error("Fixture image preparation failed"); }
  const frame = blockoutFrame();
  const receiver = frame.entities[0]; if (!receiver) { throw new Error("Fixture receiver is missing"); }
  const projectorTransform = { ...receiver.transform, position: { x: 0, y: 0, z: 1 } };
  const glassTransform = { ...receiver.transform, position: { x: 0, y: 0, z: 2 } };
  frame.images = { paint: prepared.image.binding };
  frame.entities.push({ entityId: "paint-projector", transform: projectorTransform, previousTransform: projectorTransform,
    decal3d: { assetId: "paint", receiverId: "box", size: { x: 1, y: 1, z: 0.5 }, opacity: 1, renderOrder: 0 } },
  { entityId: "glass", transform: glassTransform, previousTransform: glassTransform, model: { assetId: "glass", castShadow: false, receiveShadow: false } });
  const glass = triangleGlb({ meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ alphaMode: "BLEND", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 0.5] }, extensions: { KHR_materials_unlit: {} } }],
    extensionsUsed: ["KHR_materials_unlit"] });
  const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; import * as three from "three"; window.fogHarness3D={factory:createGameRenderer3D,three};',
    resolveDir: resolve("."), sourcefile: "decal-transparent-lifecycle.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
    await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async ({ frame, image, glass }) => {
      const { factory, three } = window.fogHarness3D;
      const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas is missing"); }
      const bytes = (base64: string): Uint8Array => Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      const renderer = await factory({ canvas, preserveDrawingBuffer: true,
        resolveModel: async () => ({ bytes: bytes(glass) }), resolveImage: async () => {
          const binding = frame.images?.paint; if (!binding) { throw new Error("Image binding missing"); }
          return { bytes: bytes(image), binding };
        } });
      renderer.resize(128, 128);
      const read = (): Uint8Array => {
        const gl = canvas.getContext("webgl2"); if (!gl) { throw new Error("WebGL2 is missing"); }
        const output = new Uint8Array(128 * 128 * 4); gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, output); return output;
      };
      const projection = (): import("three").Mesh => {
        const group = renderer.getScene().children.find(object => object.name === "game-decal" && object.userData.gameEntityId === "paint-projector");
        const mesh = group?.children[0]; if (!(mesh instanceof three.Mesh)) { throw new Error("Projected mesh missing"); } return mesh;
      };
      try {
        await renderer.render(frame); const reference = read();
        const depthWrites: boolean[] = [];
        renderer.getEntityObject("glass")?.traverse(object => {
          if (object instanceof three.Mesh) { for (const material of Array.isArray(object.material) ? object.material : [object.material]) { depthWrites.push(material.depthWrite); } }
        });
        const projector = frame.entities.find(entity => entity.decal3d); if (!projector?.decal3d) { throw new Error("Projector missing"); }
        projector.decal3d.renderOrder = 1;
        await renderer.render(frame); const ordered = read();
        projector.decal3d.renderOrder = 0;
        await renderer.render(frame); const geometry = projection().geometry;
        const unrelated = structuredClone(projector); unrelated.entityId = "unrelated"; unrelated.transform.position.x = 40; unrelated.previousTransform = structuredClone(unrelated.transform);
        frame.entities.unshift(unrelated);
        await renderer.render(frame); const reordered = read();
        return { ordered: ordered.every((value, index) => value === reference[index]), reordered: reordered.every((value, index) => value === reference[index]),
          geometryReused: geometry === projection().geometry, depthWrites, center: Array.from(reference.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 4)) };
      } finally { renderer.dispose(); }
    }, { frame, image: Buffer.from(imageBytes).toString("base64"), glass: Buffer.from(glass).toString("base64") });
    expect(result.depthWrites).toEqual([false]); expect(result.center[0]).toBeGreaterThan(0); expect(result.center[1]).toBeGreaterThan(0);
    expect(result.ordered).toBe(true); expect(result.reordered).toBe(true); expect(result.geometryReused).toBe(true); expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);

it("binds cascaded lighting before the first draw of new or grown lit particle batches", async () => {
  const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; import * as three from "three"; window.fogHarness3D={factory:createGameRenderer3D,three};',
    resolveDir: resolve("."), sourcefile: "particle-cascade-lifecycle.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<title>Particle cascade controls</title>" }) : route.abort());
    await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async ({ frame, emitter }) => {
      const cases: { lit: boolean; cascades: boolean; first: number; grown: number; foreground: number }[] = [];
      for (const [lit, cascades] of [[true, true], [false, true], [true, false]] as const) {
        const canvas = document.createElement("canvas");
        const renderer = await window.fogHarness3D.factory({ canvas, preserveDrawingBuffer: true }); renderer.resize(128, 128);
        frame.entities = [];
        frame.environment.ambient.intensity = 0.1;
        frame.environment.shadows.enabled = true;
        if (cascades) { frame.environment.shadows.cascades = { count: 4, split: 0.5, maxDistance: 60 }; }
        else { delete frame.environment.shadows.cascades; }
        frame.lights = [{ entityId: "sun", transform: { ...frame.camera.transform, position: { x: 0, y: 0, z: 4 }, rotation: [0, 0, 0, 1] },
          light: { kind: "directional", color: "#ffffff", intensity: 0.5, castShadow: true, shadowBias: 0, shadowNormalBias: 0 } }];
        let count = 1;
        const particleEmitter = { ...emitter, unlit: !lit };
        const field: import("../src/particles/render2d.js").GameParticleField = { forEachParticle: visit => {
          for (let index = 0; index < count; index++) {
            visit({ entityId: "fx", emitterId: "mesh", emitter: particleEmitter,
              x: index === 0 ? 0 : (index % 9 - 4) * 0.18, y: index === 0 ? 0 : (Math.floor(index / 9) - 3) * 0.18, z: 0,
              vx: 0, vy: 0, vz: 0, size: count === 1 ? 0.5 : 0.14, rotation: 0, r: 0.3, g: 0.3, b: 0.3, opacity: 1, life: 0.5 });
          }
        } };
        const read = (): Uint8Array => {
          const gl = canvas.getContext("webgl2"); if (!gl) { throw new Error("WebGL2 is missing"); }
          const bytes = new Uint8Array(128 * 128 * 4); gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
        };
        const difference = (a: Uint8Array, b: Uint8Array): number => a.reduce((total, value, index) => total + Number(value !== b[index]), 0);
        try {
          await renderer.render(frame, 1, field); const first = read();
          await renderer.render(frame, 1, field); const settled = read();
          count = 65;
          await renderer.render(frame, 1, field); const grown = read();
          await renderer.render(frame, 1, field); const grownSettled = read();
          cases.push({ lit, cascades, first: difference(first, settled), grown: difference(grown, grownSettled), foreground: settled[(64 * 128 + 64) * 4] ?? 0 });
        } finally { renderer.dispose(); }
      }
      return cases;
    }, { frame: blockoutFrame(), emitter: gameParticleEmitter.parse({ id: "mesh", blend: "normal", render: { kind: "mesh", shape: "box" } }) });
    expect(result).toHaveLength(3);
    for (const entry of result) { expect(entry.foreground, JSON.stringify(entry)).toBeGreaterThan(0); expect(entry.first, JSON.stringify(entry)).toBe(0); expect(entry.grown, JSON.stringify(entry)).toBe(0); }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);

it("matches fresh rendering after height fog and cascades are toggled on persistent materials", async () => {
  const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; import * as three from "three"; window.fogHarness3D={factory:createGameRenderer3D,three};',
    resolveDir: resolve("."), sourcefile: "fog-cascade-lifecycle.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
  const script = bundle.outputFiles?.[0];
  if (!script) { throw new Error("Renderer bundle is missing"); }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") { errors.push(message.text()); } });
    await page.route("**/*", route => route.request().url() === "http://127.0.0.1/"
      ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
    await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
    const result = await page.evaluate(async (frame: GameRenderFrame3D) => {
      const { factory, three } = window.fogHarness3D;
      const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas is missing"); }
      const persistent = await factory({ canvas, preserveDrawingBuffer: true }); persistent.resize(128, 128);
      const read = (element: HTMLCanvasElement): Uint8Array => {
        const gl = element.getContext("webgl2"); if (!gl) { throw new Error("WebGL2 is missing"); }
        const bytes = new Uint8Array(128 * 128 * 4); gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
      };
      const transform = frame.camera.transform;
      frame.environment.ambient.intensity = 0.2;
      frame.lights = [{ entityId: "sun", transform: { ...transform, position: { x: 0, y: 4, z: 4 }, rotation: [0, 0, 0, 1] },
        light: { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true, shadowBias: 0, shadowNormalBias: 0 } }];
      const cases: { fog: string; cascades: number; different: number; foreground: number; heightHook: boolean; cascadeHook: boolean; retainedMaterial: boolean }[] = [];
      let retainedMaterial: import("three").Material | undefined;
      try {
        for (const [fog, cascades] of [["none", 0], ["none", 2], ["height", 2], ["height", 0], ["none", 0], ["height", 0], ["height", 2], ["height", 4], ["height", 0],
          ["linear", 2], ["none", 2], ["height", 2], ["linear", 4], ["none", 0]] as const) {
          frame.environment.shadows.enabled = cascades !== 0;
          if (cascades === 0) { delete frame.environment.shadows.cascades; }
          else { frame.environment.shadows.cascades = { count: cascades, split: 0.5, maxDistance: 60 }; }
          if (fog === "none") { delete frame.environment.fog; }
          else if (fog === "linear") { frame.environment.fog = { color: "#e04020", near: 1, far: 15 }; }
          else { frame.environment.fog = { kind: "height", color: "#e04020", density: 0.2, baseHeight: 0, heightFalloff: 1, maxOpacity: 0.8 }; }
          await persistent.render(frame);
          const actual = read(canvas);
          const box = persistent.getEntityObject("box");
          if (!(box instanceof three.Mesh) || Array.isArray(box.material)) { throw new Error("Persistent box material is missing"); }
          retainedMaterial ??= box.material;
          const shader = { uniforms: {} as Record<string, import("three").IUniform>,
            vertexShader: "#include <lights_pars_begin>\n#include <fog_pars_vertex>\n#include <fog_vertex>",
            fragmentShader: "#include <lights_pars_begin>\n#include <lights_fragment_begin>\n#include <fog_pars_fragment>\n#include <fog_fragment>" };
          Reflect.apply(box.material.onBeforeCompile, box.material, [shader, {}]);
          const freshCanvas = document.createElement("canvas");
          const fresh = await factory({ canvas: freshCanvas, preserveDrawingBuffer: true }); fresh.resize(128, 128);
          try {
            await fresh.render(frame);
            const expected = read(freshCanvas);
            let different = 0;
            for (let index = 0; index < actual.length; index++) { if (actual[index] !== expected[index]) { different++; } }
            const center = (64 * 128 + 64) * 4;
            cases.push({ fog, cascades, different, foreground: (expected[center] ?? 0) + (expected[center + 1] ?? 0) + (expected[center + 2] ?? 0),
              heightHook: Object.hasOwn(shader.uniforms, "gameHeightFogDensity"), cascadeHook: Object.hasOwn(shader.uniforms, "CSM_cascades"), retainedMaterial: retainedMaterial === box.material });
          } finally { fresh.dispose(); }
        }
        return cases;
      } finally { persistent.dispose(); }
    }, blockoutFrame());
    expect(result).toHaveLength(14);
    for (const entry of result) {
      expect(entry.foreground, JSON.stringify(entry)).toBeGreaterThan(0); expect(entry.different, JSON.stringify(entry)).toBe(0);
      expect(entry.heightHook, JSON.stringify(entry)).toBe(entry.fog === "height");
      expect(entry.cascadeHook, JSON.stringify(entry)).toBe(entry.cascades !== 0);
      expect(entry.retainedMaterial, JSON.stringify(entry)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 40_000);
