import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
import { gameModel3D, gameAnimator3D, gameNonSpatialBehavior } from "@nodetool-ai/protocol";
import { createGameSession3D, createNative3DGame } from "@nodetool-ai/game-runtime";
import { normalizeGameModel3D } from "../src/preparation3d.js";
import { skinnedGlb } from "./fixtures/game3d.js";
import { buildStandaloneGame3D } from "../src/build3d.js";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function root(): Promise<string> { const path = await mkdtemp(join(tmpdir(), "game3d-export-")); created.push(path); return path; }

describe("offline 3D export", () => {
  it("hashes runtime files and refuses to overwrite a nonempty destination", async () => {
    const directory = await root();
    const output = join(directory, "game");
    const built = await buildStandaloneGame3D({ document: createNative3DGame("offline"), outputDir: output, resolveAsset: async () => null });
    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    expect(manifest.sourceRevision).toBe("native-3d-exploration-v1");
    for (const [file, digest] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(await readFile(join(output, file))).digest("hex")).toBe(digest);
    }
    expect(built.playerPath).toBe(join(output, "game3d-player.js"));
    await writeFile(join(output, "keep.txt"), "user content");
    await expect(buildStandaloneGame3D({ document: createNative3DGame("offline"), outputDir: output, resolveAsset: async () => null })).rejects.toThrow("not empty");
    expect(await readFile(join(output, "keep.txt"), "utf8")).toBe("user content");
  }, 30_000);
  it("runs a recorded route with external network denied and matches Node snapshots", async () => {
    const directory = await root(); const output = join(directory, "game");
    const document = createNative3DGame("offline-replay");
    document.inputActions.push("e");
    for (const scene of document.scenes) { for (const entity of scene.entities) { for (const behavior of entity.behaviors) { if (behavior.kind === "script") { behavior.maxTickMs = 50; } } } }
    const prepared = await normalizeGameModel3D(skinnedGlb(), { assetId: "acceptance-rig", importSettings: { scale: 1.6, forward: "+z", origin: "centerGround" } });
    if (!prepared.ok) { throw new Error(prepared.diagnostics.map((entry) => entry.message).join("; ")); }
    document.assets.character = prepared.binding;
    const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual) { throw new Error("Acceptance visual child is missing"); }
    delete visual.primitive;
    visual.transform3d.position.y = -0.8;
    visual.model = gameModel3D.parse({ assetId: "character", castShadow: true, receiveShadow: true });
    visual.animator3d = gameAnimator3D.parse({ clips: { idle: "clip:0", run: "clip:1", jump: "clip:2" }, initialClip: "idle" });
    visual.behaviors.push(gameNonSpatialBehavior.parse({ kind: "script", maxTickMs: 50, source: `(input) => {
      const clip = input.justPressed.includes("jump") ? "jump" : Math.abs(input.axes.moveX || 0) + Math.abs(input.axes.moveZ || 0) > 0 ? "run" : "idle";
      const customPresses = (input.state && input.state.customPresses || 0) + Number(input.justPressed.includes("e"));
      return { state: { clip, customPresses }, commands: [{ kind: "playAnimation", clip }] };
    }` }));
    document.scenes[0].environment.shadows.enabled = true;
    await buildStandaloneGame3D({ document, outputDir: output, resolveAsset: async (assetId) => assetId === "acceptance-rig" ? { bytes: prepared.bytes, mimeType: "model/gltf-binary" } : null });
    const exportedDocument = JSON.parse(await readFile(join(output, "game.json"), "utf8"));
    expect(exportedDocument).toEqual(document);
    const server = createServer((request, response) => {
      const path = request.url === "/" ? "index.html" : request.url?.slice(1);
      if (!path || path.includes("..") || path.includes("?")) { response.writeHead(404); response.end(); return; }
      void readFile(join(output, path)).then((bytes) => {
        response.setHeader("content-type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : path.endsWith(".css") ? "text/css" : "text/html");
        response.end(bytes);
      }).catch(() => { response.writeHead(404); response.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") { throw new Error("Static server did not bind"); }
    const origin = `http://127.0.0.1:${address.port}`;
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const session = await createGameSession3D(document, 1);
    try {
      const page = await browser.newPage();
      const outside: string[] = [];
      const loaded: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.route("**/*", (route) => {
        if (route.request().url().startsWith(`${origin}/`)) { loaded.push(route.request().url()); return route.continue(); }
        outside.push(route.request().url()); return route.abort();
      });
      await page.goto(origin);
      await page.waitForFunction(() => Boolean(window.nativeGame3DPlayer), { timeout: 30_000 });
      await page.evaluate(() => window.nativeGame3DPlayer.reset());
      expect(await page.evaluate(() => window.nativeGame3DPlayer.snapshot().entities.find((entity) => entity.id === "player-visual")?.animation?.clipId)).toBe("clip:0");
      await page.evaluate(() => window.nativeGame3DPlayer.step({ pressed: ["jump"], justPressed: ["jump"], axes: {}, look: { x: 0, y: 0 } }));
      expect(await page.evaluate(() => window.nativeGame3DPlayer.snapshot().entities.find((entity) => entity.id === "player-visual")?.animation?.clipId)).toBe("clip:2");
      await page.evaluate(() => window.nativeGame3DPlayer.step({ pressed: [], justPressed: [], axes: { moveZ: -1 }, look: { x: 0, y: 0 } }));
      expect(await page.evaluate(() => window.nativeGame3DPlayer.snapshot().entities.find((entity) => entity.id === "player-visual")?.animation?.clipId)).toBe("clip:1");
      await page.evaluate(() => window.nativeGame3DPlayer.reset());
      await page.locator("#pause").click();
      await page.keyboard.down("e");
      await page.waitForFunction(() => Object.values(window.nativeGame3DPlayer.snapshot().scriptState).some((state) => state !== null && typeof state === "object" && !Array.isArray(state) && state.customPresses === 1));
      const heldTick = await page.evaluate(() => window.nativeGame3DPlayer.snapshot().tick);
      await page.waitForFunction((tick) => window.nativeGame3DPlayer.snapshot().tick >= tick + 3, heldTick);
      expect(await page.evaluate(() => Object.values(window.nativeGame3DPlayer.snapshot().scriptState).some((state) => state !== null && typeof state === "object" && !Array.isArray(state) && state.customPresses === 1))).toBe(true);
      await page.keyboard.up("e");
      await page.evaluate(() => window.nativeGame3DPlayer.reset());
      const inputs = Array.from({ length: 195 }, () => ({ pressed: [], justPressed: [], axes: { moveZ: -1 }, look: { x: 0, y: 0 } }));
      inputs.forEach((input) => session.step(input));
      const snapshot = await page.evaluate(async (route) => { await window.nativeGame3DPlayer.advance(route); return window.nativeGame3DPlayer.snapshot(); }, inputs);
      expect(snapshot.won).toBe(true);
      expect(snapshot.score).toBe(2);
      expect(snapshot).toEqual(session.snapshot());
      expect(outside).toEqual([]);
      expect(loaded).toContain(`${origin}/assets/${prepared.binding.digest}.glb`);
      expect(pageErrors).toEqual([]);
    } finally {
      session.dispose(); await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 60_000);
});
