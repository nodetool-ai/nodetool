import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameRenderFrame3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { normalizeGameModel3D } from "../src/preparation3d.js";
import { syncGameScene } from "../src/renderer3d/scene-sync.js";
import type { GameModelCache3D } from "../src/renderer3d/assets/cache.js";
import type { RenderInstance } from "../src/renderer3d/types.js";
import { GameCascadedShadows3D } from "../src/renderer3d/shadows/cascades.js";
import { skinnedGlb } from "./fixtures/game3d.js";

afterEach(() => { vi.restoreAllMocks(); });

const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };

/** A frame with one primitive and one animated skinned model, at `tick`. */
function frame(tick: number, animation = { clipId: "clip:1", startTick: 0, playbackRate: 1, loop: true }): GameRenderFrame3D {
  return gameRenderFrame3D.parse({ dimension: "3d", gameId: "cost", sceneId: "scene", tick,
    presentation: { aspectRatio: 1, hudWidth: 64, hudHeight: 64 },
    camera: { entityId: "camera", transform: { ...transform, position: { x: 0, y: 0, z: 5 } }, projection: { kind: "perspective", fov: 60, near: 0.1, far: 100 } },
    entities: [
      { entityId: "box", transform, previousTransform: transform, primitive: { kind: "box", dimensions: { x: 1, y: 1, z: 1 }, material: { color: "#0088ff" } } },
      { entityId: "rig", transform, previousTransform: transform, model: { assetId: "rig", castShadow: false, receiveShadow: false }, animation }
    ],
    lights: [], environment: { background: "#202838", ambient: { color: "#ffffff", intensity: 1 }, shadows: { enabled: false, mapSize: 512, extent: 20 } }, hud: [] });
}

async function rigCache(): Promise<GameModelCache3D> {
  const prepared = await normalizeGameModel3D(skinnedGlb(), { assetId: "rig" });
  if (!prepared.ok) { throw new Error("Rig fixture failed preparation"); }
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(prepared.bytes).buffer, "");
  // The scene sync reads only the parsed glTF of a cached model.
  return { get: async () => ({ prepared, gltf }) } as unknown as GameModelCache3D;
}

describe("per-frame work in the 3D scene sync", () => {
  it("builds descriptor and pose JSON never, and skinned bounds once per tick, across frames of one tick", async () => {
    const scene = new THREE.Scene();
    const instances = new Map<string, RenderInstance>();
    const cache = await rigCache();
    const signal = new AbortController().signal;
    const bounds = vi.spyOn(THREE.SkinnedMesh.prototype, "computeBoundingBox");
    const tickOne = frame(1);
    await syncGameScene(scene, instances, cache, signal, tickOne, 0.25);
    expect(bounds).toHaveBeenCalledTimes(1);
    const stringify = vi.spyOn(JSON, "stringify");
    // Three rendered frames of the same tick at a 180 Hz display.
    await syncGameScene(scene, instances, cache, signal, tickOne, 0.5);
    await syncGameScene(scene, instances, cache, signal, tickOne, 0.75);
    expect(stringify).not.toHaveBeenCalled();
    expect(bounds).toHaveBeenCalledTimes(1);
    await syncGameScene(scene, instances, cache, signal, frame(2), 0.25);
    expect(bounds).toHaveBeenCalledTimes(2);
    // A new frame carries new model objects with the same content, so each entity's JSON is checked once and kept.
    expect(stringify).toHaveBeenCalledTimes(2);
    expect(instances.get("rig")?.object.parent).toBe(scene);
  });

  it("still replaces an instance whose model changes", async () => {
    const scene = new THREE.Scene();
    const instances = new Map<string, RenderInstance>();
    const cache = await rigCache();
    const signal = new AbortController().signal;
    await syncGameScene(scene, instances, cache, signal, frame(1), 1);
    const first = instances.get("box");
    const changed = frame(2);
    const box = changed.entities[0];
    if (!box?.primitive) { throw new Error("Box fixture is missing"); }
    box.primitive = { ...box.primitive, material: { ...box.primitive.material, color: "#ff0000" } };
    await syncGameScene(scene, instances, cache, signal, changed, 1);
    expect(instances.get("box")).not.toBe(first);
    expect(first?.object.parent).toBeNull();
  });
});

describe("cascade material binding", () => {
  it("walks the scene in bindMaterials only, once per frame", () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld(true);
    const cascades = new GameCascadedShadows3D();
    const walks = vi.spyOn(scene, "traverse");
    const sun = new THREE.DirectionalLight();
    cascades.update(scene, sun, { kind: "directional", color: "#ffffff", intensity: 1, castShadow: true }, { count: 2, split: 0.5, maxDistance: 60 }, 512, camera);
    expect(walks).not.toHaveBeenCalled();
    cascades.bindMaterials(scene);
    expect(walks).toHaveBeenCalledTimes(1);
    cascades.detach();
  });
});

describe("per-frame work in the 3D renderer", () => {
  it("walks the scene twice, serializes nothing, and skips the HUD between ticks", async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import("@playwright/test");
    const { resolve } = await import("node:path");
    const bundle = await build({ stdin: { contents: 'import {measureRendererFrameCost3D} from "./tests/fixtures/frame-cost-renderer3d.ts"; window.measureRendererFrameCost3D = measureRendererFrameCost3D;',
      resolveDir: resolve("."), sourcefile: "frame-cost-renderer3d.ts" }, bundle: true, format: "iife", platform: "browser", write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles[0];
    if (!script) { throw new Error("Frame cost bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<title>Frame cost</title>" }) : route.abort());
      await page.goto("http://127.0.0.1/");
      await page.addScriptTag({ content: script.text });
      const cost = await page.evaluate(() => (window as unknown as { measureRendererFrameCost3D: () => Promise<Record<string, number>> }).measureRendererFrameCost3D());
      // One walk binds cascade materials, one attaches height fog. Neither repeats in the same frame.
      expect(cost).toEqual({ walks: 2, stringify: 0, hudUploads: 0, measures: 0, readsAtSubmit: 1, readsAfterDraw: 1 });
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  }, 60_000);
});
