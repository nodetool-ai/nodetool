import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import { buildStandaloneGame3D } from "../src/build3d.js";

declare global {
  interface Window { simulatedPad: { buttons: { pressed: boolean; value: number }[]; axes: number[] } }
}

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("3D standalone gamepad input", () => {
  it("drives the 3D fixture from a simulated gamepad through the default bindings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "game3d-gamepad-")); created.push(directory);
    const output = join(directory, "game");
    const document = createNative3DGame("gamepad-drive");
    // Movement and jumping come from character3d. Scripts are removed so the wall-clock script budget cannot stop play on a busy host.
    for (const scene of document.scenes) { for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); } }
    await buildStandaloneGame3D({ document, outputDir: output, resolveAsset: async () => null });
    const server = createServer((request, response) => {
      const path = request.url === "/" ? "index.html" : request.url?.slice(1);
      if (!path || path.includes("..") || path.includes("?")) { response.writeHead(404); response.end(); return; }
      void readFile(join(output, path)).then((bytes) => {
        response.setHeader("content-type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".json") ? "application/json" : "text/html");
        response.end(bytes);
      }).catch(() => { response.writeHead(404); response.end(); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") { throw new Error("Static server did not bind"); }
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      // Playwright has no gamepad device, so the page sees one standard-mapping pad that the test moves.
      await page.addInitScript(() => {
        window.simulatedPad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
        Object.defineProperty(Navigator.prototype, "getGamepads", { configurable: true, value: () => [{
          id: "simulated", index: 0, connected: true, mapping: "standard", timestamp: performance.now(),
          buttons: window.simulatedPad.buttons, axes: window.simulatedPad.axes }] });
      });
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(() => Boolean(window.nativeGame3DPlayer), { timeout: 30_000 });
      await page.evaluate(() => window.nativeGame3DPlayer.reset());
      const start = await page.evaluate(() => window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player")?.transform.position);
      if (!start) { throw new Error("Fixture player is missing"); }
      await page.evaluate(() => { window.simulatedPad.axes[0] = 1; });
      await page.locator("#pause").click();
      const moved = await page.waitForFunction((x) => {
        const player = window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player");
        return player && player.transform.position.x > x + 1 ? player.transform.position : null;
      }, start.x, { timeout: 20_000 });
      expect((await moved.jsonValue())?.x).toBeGreaterThan(start.x + 1);
      await page.evaluate(() => { window.simulatedPad.axes[0] = 0; window.simulatedPad.buttons[0] = { pressed: true, value: 1 }; });
      await page.waitForFunction((y) => {
        const player = window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player");
        return Boolean(player && player.transform.position.y > y + 0.3);
      }, start.y, { timeout: 20_000 });
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 60_000);
});
