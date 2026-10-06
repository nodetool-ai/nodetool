import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import type { GameRenderFrame3D } from "@nodetool-ai/protocol";
import type { CreateGameRenderer3DOptions, GameRenderer3D } from "../src/browser3d.js";
import { blockoutFrame, skinnedGlb } from "./fixtures/game3d.js";

declare global { interface Window { gameRendererFactory: (options: CreateGameRenderer3DOptions) => Promise<GameRenderer3D>; lifecycleRenderer: GameRenderer3D; rendererLossExtension: WEBGL_lose_context; } }

describe("3D renderer lifecycle", () => {
  it("recovers a lost context, retains picking and disposes/reopens with measured render timings", async () => {
    const bundle = await build({ stdin: { contents: 'import {createGameRenderer3D} from "./src/browser3d.ts"; window.gameRendererFactory = createGameRenderer3D;',
      resolveDir: resolve("."), sourcefile: "lifecycle3d.ts" }, bundle: true, format: "iife", platform: "browser", minify: true, write: false, conditions: ["nodetool-dev"] });
    const script = bundle.outputFiles?.[0]; if (!script) { throw new Error("Renderer bundle is missing"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => route.request().url() === "http://127.0.0.1/"
        ? route.fulfill({ contentType: "text/html", body: "<canvas></canvas>" }) : route.abort());
      await page.goto("http://127.0.0.1/"); await page.addScriptTag({ content: script.text });
      const initial = await page.evaluate(async (frame: GameRenderFrame3D) => {
        const canvas = document.querySelector("canvas"); if (!canvas) { throw new Error("Canvas missing"); }
        const started = performance.now();
        const renderer = await window.gameRendererFactory({ canvas });
        window.lifecycleRenderer = renderer;
        renderer.resize(128, 128);
        const transform = { position: { x: 2, y: 3, z: 4 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
        frame.entities.push({ entityId: "physics-root", transform, previousTransform: transform });
        const stats = await renderer.render(frame, 1);
        const picked = renderer.pick(0, 0);
        const moving = { ...frame, camera: { ...frame.camera, previousTransform: { ...frame.camera.transform, position: { ...frame.camera.transform.position, x: frame.camera.transform.position.x - 2 } } } };
        await renderer.render(moving, 0.5);
        const cameraOffset = renderer.getCamera().position.x - frame.camera.transform.position.x;
        await renderer.render(frame, 1);
        return { initializationMs: performance.now() - started, capabilities: renderer.capabilities, picked, rootPosition: renderer.getEntityObject("physics-root")?.position.toArray(), stats, cameraOffset };
      }, blockoutFrame());
      expect(initial.picked).toBe("box");
      expect(initial.rootPosition).toEqual([2, 3, 4]);
      expect(initial.cameraOffset).toBeCloseTo(-1);
      await page.evaluate(() => {
        const canvas = window.lifecycleRenderer.canvas;
        const gl = canvas.getContext("webgl2"); const extension = gl?.getExtension("WEBGL_lose_context");
        if (!extension) { throw new Error("Context loss test requires WEBGL_lose_context"); }
        window.rendererLossExtension = extension;
        extension.loseContext();
      });
      await page.waitForFunction(() => window.lifecycleRenderer.capabilities.deviceStatus === "lost");
      await page.evaluate(() => {
        window.rendererLossExtension.restoreContext();
      });
      await page.waitForFunction(() => window.lifecycleRenderer.capabilities.deviceStatus === "ready");
      const recovered = await page.evaluate(async ({ frame, model, font }) => {
        const renderer = window.lifecycleRenderer;
        await renderer.render(frame, 1);
        const capabilities = renderer.capabilities;
        const times: number[] = [];
        for (let index = 0; index < 30; index++) {
          const started = performance.now(); await renderer.render(frame, 1); times.push(performance.now() - started);
        }
        renderer.dispose();
        const disposed = renderer.capabilities.deviceStatus;
        const replacement = await window.gameRendererFactory({ canvas: renderer.canvas });
        await replacement.render(frame, 1);
        const picked = replacement.pick(0, 0); replacement.dispose();
        const interrupted = await window.gameRendererFactory({ canvas: renderer.canvas });
        const pending = interrupted.render(frame, 1);
        // First-frame cancellation must not leave Three's shader polling timers accessing disposed programs.
        queueMicrotask(() => interrupted.dispose());
        const failure = await pending.then(() => "unexpected-success", (error: unknown) => error instanceof Error ? error.name : "unknown");
        await new Promise((resolve) => setTimeout(resolve, 20));
        let fontBytes: Uint8Array | null = new Uint8Array(font);
        let modelLoads = 0;
        const skinRenderer = await window.gameRendererFactory({ canvas: renderer.canvas, preserveDrawingBuffer: true,
          resolveModel: async () => { modelLoads++; return { bytes: new Uint8Array(model) }; },
          resolveFont: async () => fontBytes ? { bytes: fontBytes } : null });
        const transform = frame.entities[0].transform;
        frame.entities = [{ entityId: "skin", transform, previousTransform: transform, model: { assetId: "rig", castShadow: true, receiveShadow: true },
          animation: { clipId: "clip:1", startTick: 0, playbackRate: 1, loop: false } }];
        frame.tick = 0; await skinRenderer.render(frame, 1);
        const initialBounds = skinRenderer.projectedBounds()[0];
        const initialSkinPixels = skinRenderer.canvas.toDataURL();
        frame.tick = 30; await skinRenderer.render(frame, 1);
        const animatedBounds = skinRenderer.projectedBounds()[0];
        if (!initialBounds || !animatedBounds) { throw new Error("Skin fixture projected bounds are missing"); }
        const center = (animatedBounds.minX + animatedBounds.maxX) / 2;
        skinRenderer.getEntityObject("skin")?.traverse((object) => { if (object.type === "SkinnedMesh") { object.userData.gameEntityId = "spoofed-imported-entity"; } });
        const skinPicked = skinRenderer.pick(center / skinRenderer.canvas.width * 2 - 1, 0);
        const animatedPixels = skinRenderer.canvas.toDataURL();
        frame.tick = 12; await skinRenderer.render(frame, 1);
        const rewoundBounds = skinRenderer.projectedBounds()[0];
        frame.tick = 30; await skinRenderer.render(frame, 1);
        const restoredPixels = skinRenderer.canvas.toDataURL();
        frame.tick = 31; delete frame.entities[0].animation; await skinRenderer.render(frame, 1);
        const removedAnimationX = skinRenderer.getEntityObject("skin")?.getObjectByName("joint")?.position.x;
        const restoredOriginalPixels = skinRenderer.canvas.toDataURL() === initialSkinPixels;
        frame.entities[0].animation = { clipId: "clip:1", startTick: 0, playbackRate: 1, loop: false };
        frame.tick = 61; await skinRenderer.render(frame, 1);
        const previousInstance = skinRenderer.getEntityObject("skin");
        frame.sceneId = "next-scene"; frame.tick = 0; delete frame.entities[0].animation; await skinRenderer.render(frame, 1);
        const newSceneX = skinRenderer.getEntityObject("skin")?.getObjectByName("joint")?.position.x;
        const newSceneInstance = skinRenderer.getEntityObject("skin") !== previousInstance;
        frame.entities[0].animation = { clipId: "clip:1", startTick: 0, playbackRate: 1, loop: false };
        frame.tick = 30; await skinRenderer.render(frame, 1);
        const beforeReset = skinRenderer.getEntityObject("skin");
        frame.tick = 0; delete frame.entities[0].animation; await skinRenderer.render(frame, 1);
        const resetX = skinRenderer.getEntityObject("skin")?.getObjectByName("joint")?.position.x;
        const resetInstance = skinRenderer.getEntityObject("skin") !== beforeReset;
        const loadsBeforeInvalidation = modelLoads;
        const objectBeforeInvalidation = skinRenderer.getEntityObject("skin");
        skinRenderer.invalidateAsset("rig");
        await skinRenderer.render(frame, 1);
        const reloadedInstance = skinRenderer.getEntityObject("skin") !== objectBeforeInvalidation;
        const fontCounts: number[] = [];
        const bindFont = async (bytes: Uint8Array, required: boolean): Promise<void> => {
          const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
          const digest = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
          frame.fonts = { display: { mediaKind: "font", assetId: "font", fontFormat: "ttf", digest, required } };
        };
        for (let index = 0; index < 10; index++) {
          fontBytes = new Uint8Array([...font, ...new Array<number>(index).fill(0)]);
          await bindFont(fontBytes, true);
          await skinRenderer.render(frame, 1);
          fontCounts.push(document.fonts.size);
        }
        frame.fonts = {};
        await skinRenderer.render(frame, 1);
        const fontsAfterRemoval = document.fonts.size;
        fontBytes = null;
        await bindFont(new Uint8Array(font), false);
        await skinRenderer.render(frame, 1);
        fontBytes = new Uint8Array(font);
        await bindFont(fontBytes, true);
        await skinRenderer.render(frame, 1);
        const requiredFontCount = document.fonts.size;
        skinRenderer.dispose();
        return { fontCounts, fontsAfterRemoval, requiredFontCount, modelLoads, loadsBeforeInvalidation, reloadedInstance, removedAnimationX, restoredOriginalPixels, newSceneX, newSceneInstance, resetX, resetInstance, initialBounds, animatedBounds, rewoundBounds, skinPicked, matchingRewind: animatedPixels === restoredPixels, capabilities, disposed, picked, times, failure, interruptedStatus: interrupted.capabilities.deviceStatus, userAgent: navigator.userAgent };
      }, { frame: blockoutFrame(), model: Array.from(skinnedGlb()),
        font: Array.from(await readFile(resolve("../timeline/fonts/BebasNeue-Regular.ttf"))) });
      expect(recovered.fontCounts).toEqual(new Array<number>(10).fill(1));
      expect(recovered.fontsAfterRemoval).toBe(0);
      expect(recovered.requiredFontCount).toBe(1);
      expect(recovered.loadsBeforeInvalidation).toBe(1);
      expect(recovered.modelLoads).toBe(2);
      expect(recovered.reloadedInstance).toBe(true);
      expect(recovered.capabilities).toMatchObject({ deviceStatus: "ready", deviceLossCount: 1, minimalRenderSucceeded: true });
      expect(recovered.disposed).toBe("disposed"); expect(recovered.picked).toBe("box");
      expect(recovered.failure).toBe("AbortError"); expect(recovered.interruptedStatus).toBe("disposed");
      expect(recovered.animatedBounds.minX - recovered.initialBounds.minX).toBeGreaterThan(10);
      expect(recovered.rewoundBounds?.minX).toBeLessThan(recovered.animatedBounds.minX);
      expect(recovered.skinPicked).toBe("skin"); expect(recovered.matchingRewind).toBe(true);
      expect(recovered.removedAnimationX).toBe(0); expect(recovered.restoredOriginalPixels).toBe(true);
      expect(recovered.newSceneX).toBe(0); expect(recovered.newSceneInstance).toBe(true);
      expect(recovered.resetX).toBe(0); expect(recovered.resetInstance).toBe(true);
      expect(pageErrors).toEqual([]);
      const sorted = [...recovered.times].sort((a, b) => a - b);
      await writeFile(join(tmpdir(), "game3d-renderer-spike.json"), JSON.stringify({ backend: recovered.capabilities, browser: recovered.userAgent,
        resolution: [128, 128], fixture: "primitive-box", rendererBundleBytes: script.contents.length, initializationMs: initial.initializationMs,
        renderP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], stats: initial.stats }, null, 2));
    } finally { await browser.close(); }
  }, 40_000);
});
