import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gameRenderFrame3D, type GameLight3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { GameShadows3D, planGameShadows3D } from "../src/renderer3d/shadows/index.js";
import { GameCascadedShadows3D, gameCascadeBreaks3D } from "../src/renderer3d/shadows/cascades.js";
import { compareGameCaptures } from "../src/imageDiff.js";

declare global { interface Window { shadowHarness: { readonly factory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D> } } }

const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
const unit = (q: [number, number, number, number]): [number, number, number, number] => {
  const length = Math.hypot(...q);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
};
const down = unit([-0.5, 0.3, 0.1, 0.8]);
const point = (castShadow?: boolean): GameLight3D => ({ kind: "point", color: "#ffffff", intensity: 6, range: 10, decay: 2, ...(castShadow === undefined ? {} : { castShadow }) });
const sun = (castShadow: boolean): GameLight3D => ({ kind: "directional", color: "#ffffff", intensity: 2, castShadow });

function frame(lights: readonly { entityId: string; light: GameLight3D; position?: { x: number; y: number; z: number } }[], shadows: Record<string, unknown> = {}): GameRenderFrame3D {
  const box = (entityId: string, x: number, z: number) => {
    const pose = { ...transform, position: { x, y: 0.5, z } };
    return { entityId, transform: pose, previousTransform: pose, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: { color: "#c0b8a8" } } };
  };
  const ground = { ...transform, position: { x: 0, y: 0, z: -10 } };
  return gameRenderFrame3D.parse({ dimension: "3d", gameId: "shadows", sceneId: "scene", tick: 0,
    presentation: { aspectRatio: 1.5, hudWidth: 192, hudHeight: 128 },
    camera: { entityId: "camera", transform: { ...transform, position: { x: 0, y: 4, z: 8 }, rotation: unit([-0.2, 0, 0, 0.98]) }, projection: { kind: "perspective", fov: 60, near: 0.1, far: 120 } },
    entities: [{ entityId: "ground", transform: ground, previousTransform: ground, primitive: { kind: "plane", dimensions: { x: 60, y: 1, z: 60 }, material: { color: "#9a948a" } } },
      box("near", -1.5, 0), box("mid", 1.5, -6), box("far", -2, -30)],
    lights: lights.map(({ entityId, light, position }) => ({ entityId, light, transform: position ? { ...transform, position } : { ...transform, rotation: down } })),
    environment: { background: "#202838", ambient: { color: "#ffffff", intensity: 0.2 }, shadows: { enabled: true, mapSize: 512, extent: 20, ...shadows } }, hud: [] });
}

describe("shadow planning", () => {
  it("keeps every shadow-casting directional light without cascades and drops nothing else", () => {
    const plan = planGameShadows3D(frame([{ entityId: "a", light: sun(true) }, { entityId: "b", light: sun(true) }, { entityId: "lamp", light: point() }]));
    expect([...plan.casting]).toEqual(["a", "b"]);
    expect(plan.cascadedLightId).toBeUndefined();
    expect(plan.diagnostics).toEqual([]);
  });
  it("casts the first four shadowed local lights in frame order and reports the rest", () => {
    const lamps = ["l0", "l1", "l2", "l3", "l4", "l5"].map((entityId) => ({ entityId, light: point(true) }));
    const plan = planGameShadows3D(frame([{ entityId: "plain", light: point(false) }, ...lamps]));
    expect([...plan.casting]).toEqual(["l0", "l1", "l2", "l3"]);
    expect(plan.overflow).toEqual({ local: 2, directional: 0 });
    expect(plan.diagnostics).toEqual(["Shadow budget exceeded: 2 point and spot lights render without shadows (at most 4 cast shadows per scene)"]);
  });
  it("keeps one overflow diagnostic per kind while spawned lights get new ids", () => {
    const diagnostics: string[] = ["earlier diagnostic"];
    const notified: string[] = [];
    const shadows = new GameShadows3D(diagnostics, (message) => notified.push(message));
    const lamps = (wave: number, count: number) => Array.from({ length: count }, (_, index) => ({ entityId: `lamp-${wave}-${index}`, light: point(true) }));
    for (let wave = 0; wave < 50; wave++) { shadows.prepare(frame(lamps(wave, 6))); }
    expect(diagnostics).toEqual(["earlier diagnostic", "Shadow budget exceeded: 2 point and spot lights render without shadows (at most 4 cast shadows per scene)"]);
    expect(notified).toHaveLength(1);
    shadows.prepare(frame([...lamps(50, 9), { entityId: "sun", light: sun(true) }, { entityId: "moon", light: sun(true) }], { cascades: { count: 2 } }));
    shadows.prepare(frame(lamps(51, 5)));
    expect(diagnostics).toEqual(["earlier diagnostic",
      "Shadow budget exceeded: 5 point and spot lights render without shadows (at most 4 cast shadows per scene)",
      "Cascaded shadows support one directional light: 1 other shadowed directional light renders without shadows"]);
    expect(notified).toHaveLength(3);
    shadows.dispose();
  });
  it("cascades one directional light and casts nothing while shadows are disabled", () => {
    const lights = [{ entityId: "sun", light: sun(true) }, { entityId: "moon", light: sun(true) }];
    const cascaded = planGameShadows3D(frame(lights, { cascades: { count: 3 } }));
    expect(cascaded.cascadedLightId).toBe("sun");
    expect([...cascaded.casting]).toEqual(["sun"]);
    expect(cascaded.diagnostics).toEqual(["Cascaded shadows support one directional light: 1 other shadowed directional light renders without shadows"]);
    const disabled = planGameShadows3D(frame([...lights, { entityId: "lamp", light: point(true) }], { enabled: false, cascades: { count: 3 } }));
    expect(disabled.casting.size).toBe(0);
    expect(disabled.diagnostics).toEqual([]);
  });
  it("splits cascades between even and logarithmic ranges", () => {
    expect(gameCascadeBreaks3D(4, 1, 100, 0)).toEqual([0.2575, 0.505, 0.7525, 1]);
    const logarithmic = gameCascadeBreaks3D(2, 1, 100, 1);
    expect(logarithmic[0]).toBeCloseTo(0.1);
    const practical = gameCascadeBreaks3D(4, 0.1, 200, 0.7);
    expect(practical).toHaveLength(4);
    for (let index = 1; index < practical.length; index++) { expect(practical[index]).toBeGreaterThan(practical[index - 1] ?? 0); }
  });
});

describe("cascade material hooks", () => {
  it("runs a material's own compile hook first, keys on both and restores the hook on release", () => {
    const calls: string[] = [];
    const material = new THREE.MeshStandardMaterial();
    const ownHook = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
      calls.push(shader.fragmentShader.includes("#include <lights_fragment_begin>") ? "own-before-cascades" : "own-after-cascades");
      shader.uniforms.ownTint = { value: 1 };
    };
    const ownKey = (): string => "own-key";
    material.onBeforeCompile = ownHook;
    material.customProgramCacheKey = ownKey;
    const plain = new THREE.MeshStandardMaterial();
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material), new THREE.Mesh(new THREE.BoxGeometry(), plain));
    const sunLight = new THREE.DirectionalLight();
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 120);
    camera.updateMatrixWorld();
    const cascades = new GameCascadedShadows3D();
    cascades.update(scene, sunLight, { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true }, { count: 2, split: 0.5, maxDistance: 100 }, 512, camera);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "#include <lights_pars_begin>",
      fragmentShader: "#include <lights_pars_begin>\n#include <lights_fragment_begin>"
    };
    // The hook reads only the uniforms and shader sources, so a partial program description stands in for three's.
    Reflect.apply(material.onBeforeCompile, material, [shader, {}]);
    expect(calls).toEqual(["own-before-cascades"]);
    expect(Object.keys(shader.uniforms).sort()).toEqual(["CSM_cascades", "cameraNear", "ownTint", "shadowFar"]);
    expect(shader.fragmentShader).not.toContain("#include <lights_fragment_begin>");
    expect(material.customProgramCacheKey()).toBe("own-key|game-shadow-cascades");
    expect(plain.customProgramCacheKey()).toBe(`${THREE.Material.prototype.customProgramCacheKey.call(plain)}|game-shadow-cascades`);
    expect(material.defines).toMatchObject({ USE_CSM: 1, CSM_CASCADES: 2 });
    cascades.detach();
    expect(material.onBeforeCompile).toBe(ownHook);
    expect(material.customProgramCacheKey).toBe(ownKey);
    expect(material.defines).not.toHaveProperty("USE_CSM");
    expect(Object.hasOwn(plain, "onBeforeCompile")).toBe(false);
    expect(Object.hasOwn(plain, "customProgramCacheKey")).toBe(false);
  });
});

describe("shadows in real Chromium", () => {
  it("renders cascades and local shadows, reports budget overflow and restores pixels when cascades turn off", async () => {
    const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; window.shadowHarness = { factory: createGameRenderer3D };',
      resolveDir: resolve("."), sourcefile: "shadows3d.ts" }, bundle: true, format: "iife", platform: "browser", minify: true, write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      const lamps = [0, 1, 2, 3, 4, 5].map((index) => ({ entityId: `lamp${index}`, light: point(true), position: { x: index * 2 - 5, y: 3, z: -2 } }));
      const frames = {
        plain: frame([{ entityId: "sun", light: sun(true) }]),
        cascaded: frame([{ entityId: "sun", light: sun(true) }], { cascades: { count: 4, split: 0.6, maxDistance: 60 } }),
        unshadowed: frame([{ entityId: "sun", light: sun(false) }]),
        lamps: frame(lamps),
        lampsUnshadowed: frame(lamps.map((lamp) => ({ ...lamp, light: point(false) })))
      };
      const result = await page.evaluate(async (input) => {
        const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas missing"); }
        const renderer = await window.shadowHarness.factory({ canvas, preserveDrawingBuffer: true });
        try {
          renderer.resize(192, 128);
          const shot = async (rendered: GameRenderFrame3D) => {
            const stats = await renderer.render(rendered, 1);
            return { image: canvas.toDataURL("image/png"), diagnostics: stats.diagnostics };
          };
          const plain = await shot(input.plain);
          const cascaded = await shot(input.cascaded);
          const cascadeLights = renderer.getScene().children[0]?.children.filter((child) => child.type === "DirectionalLight").length ?? 0;
          const restored = await shot(input.plain);
          const groupRemoved = renderer.getScene().getObjectByName("game-shadow-cascades") === undefined;
          const unshadowed = await shot(input.unshadowed);
          const lamps = await shot(input.lamps);
          const lampsAgain = await shot(input.lamps);
          const lampsUnshadowed = await shot(input.lampsUnshadowed);
          return { plain, cascaded, cascadeLights, restored, groupRemoved, unshadowed, lamps, lampsAgain, lampsUnshadowed };
        } finally { renderer.dispose(); }
      }, frames);
      expect(pageErrors).toEqual([]);
      const png = (dataUrl: string): Buffer => Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      expect(result.cascadeLights).toBe(4);
      expect(result.groupRemoved).toBe(true);
      // Turning cascades off returns every material to its original program.
      expect((await compareGameCaptures(png(result.plain.image), png(result.restored.image), 0)).changedPixels).toBe(0);
      // Cascades shadow the far box that the single 20 m map does not reach.
      expect((await compareGameCaptures(png(result.unshadowed.image), png(result.cascaded.image), 16)).changedFraction)
        .toBeGreaterThan((await compareGameCaptures(png(result.unshadowed.image), png(result.plain.image), 16)).changedFraction);
      const overflow = ["Shadow budget exceeded: 2 point and spot lights render without shadows (at most 4 cast shadows per scene)"];
      expect(result.lamps.diagnostics).toEqual(overflow);
      expect(result.lampsAgain.diagnostics).toEqual(overflow);
      expect((await compareGameCaptures(png(result.lampsUnshadowed.image), png(result.lamps.image), 16)).changedFraction).toBeGreaterThan(0.01);
    } finally { await browser.close(); }
  }, 60_000);
});
