import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import { buildStandaloneGame3D } from "../src/build3d.js";

declare global {
  interface Window { simulatedPad: { buttons: { pressed: boolean; value: number }[]; axes: number[] }; cspViolations: string[] }
}

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

/** Builds the 3D fixture, serves it, and opens it with one simulated standard gamepad. */
async function withPlayer(name: string, run: (page: Page, output: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), `game3d-${name}-`)); created.push(directory);
  const output = join(directory, "game");
  const document = createNative3DGame(name);
  // Movement and jumping come from character3d. Scripts are removed so the wall-clock script budget cannot stop play on a busy host.
  for (const scene of document.scenes) { for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); } }
  await buildStandaloneGame3D({ document, outputDir: output, resolveAsset: async () => null });
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
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Playwright has no gamepad device, so the page sees one standard-mapping pad that the test moves.
    await page.addInitScript(() => {
      window.cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.violatedDirective.startsWith("style-src")) { window.cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`); }
      });
      window.simulatedPad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
      Object.defineProperty(Navigator.prototype, "getGamepads", { configurable: true, value: () => [{
        id: "simulated", index: 0, connected: true, mapping: "standard", timestamp: performance.now(),
        buttons: window.simulatedPad.buttons, axes: window.simulatedPad.axes }] });
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => Boolean(window.nativeGame3DPlayer), { timeout: 30_000 });
    await run(page, output);
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function playerPosition(page: Page): Promise<{ x: number; y: number; z: number } | undefined> {
  return page.evaluate(() => window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player")?.transform.position);
}

/** Waits until the player has moved right of x by more than one unit. */
async function movesRightOf(page: Page, x: number): Promise<number> {
  const moved = await page.waitForFunction((startX) => {
    const player = window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player");
    return player && player.transform.position.x > startX + 1 ? player.transform.position.x : null;
  }, x, { timeout: 20_000 });
  return Number(await moved.jsonValue());
}

describe("3D standalone gamepad input", () => {
  it("drives the 3D fixture from a simulated gamepad through the default bindings", async () => {
    await withPlayer("gamepad-drive", async (page) => {
      await page.evaluate(() => window.nativeGame3DPlayer.reset());
      const start = await playerPosition(page);
      if (!start) { throw new Error("Fixture player is missing"); }
      await page.evaluate(() => { window.simulatedPad.axes[0] = 1; });
      await page.locator("#pause").click();
      expect(await movesRightOf(page, start.x)).toBeGreaterThan(start.x + 1);
      await page.evaluate(() => { window.simulatedPad.axes[0] = 0; window.simulatedPad.buttons[0] = { pressed: true, value: 1 }; });
      await page.waitForFunction((y) => {
        const player = window.nativeGame3DPlayer.inspect().entities.find((entity) => entity.id === "player");
        return Boolean(player && player.transform.position.y > y + 0.3);
      }, start.y, { timeout: 20_000 });
    });
  }, 60_000);

  it("styles touch controls from style.css, keeps the toolbar and mouse clicks reachable, and accepts input after Reset from Pause", async () => {
    await withPlayer("touch-reset", async (page, output) => {
      // The export CSP allows same-origin styles only, so the touch rules ship in style.css and the player injects no <style>.
      expect(await readFile(join(output, "style.css"), "utf8")).toContain(".touch-look-zone{");
      expect(await readFile(join(output, "game3d-player.js"), "utf8")).not.toMatch(/createElement\(["']style["']\)/);
      await page.evaluate(() => window.dispatchEvent(new Event("touchstart")));
      const touch = await page.evaluate(() => {
        const center = (id: string): { x: number; y: number } => {
          const box = document.getElementById(id)?.getBoundingClientRect();
          if (!box) { throw new Error(`${id} is missing`); }
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        const canvas = center("game");
        const overCanvas = document.elementFromPoint(canvas.x, canvas.y)?.className;
        document.getElementById("pause")?.scrollIntoView({ block: "center" });
        const pause = center("pause");
        const zone = document.querySelector(".touch-look-zone");
        return { styles: document.querySelectorAll("style").length, zonePosition: zone ? getComputedStyle(zone).position : null,
          overCanvas, overPause: document.elementFromPoint(pause.x, pause.y)?.id };
      });
      expect(touch).toMatchObject({ styles: 0, zonePosition: "absolute", overPause: "pause" });
      expect(touch.overCanvas).toMatch(/^touch-(look|stick)-zone$/);
      // Once a mouse moves, the touch zones let it through to the canvas, so a click can capture the mouse.
      await page.evaluate(() => window.scrollTo(0, 0));
      const canvasBox = await page.locator("#game").boundingBox();
      if (!canvasBox) { throw new Error("Canvas is not visible"); }
      const point = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 4 };
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, point)).toMatch(/^touch-(look|stick)-zone$/);
      await page.mouse.move(point.x, point.y);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point)).toBe("game");
      expect(await page.evaluate(() => window.cspViolations)).toEqual([]);

      await page.locator("#pause").click();
      await page.locator("#reset").click();
      await page.waitForFunction(() => document.getElementById("pause")?.textContent === "Pause", undefined, { timeout: 20_000 });
      const start = await playerPosition(page);
      if (!start) { throw new Error("Fixture player is missing"); }
      await page.evaluate(() => { window.simulatedPad.axes[0] = 1; });
      expect(await movesRightOf(page, start.x)).toBeGreaterThan(start.x + 1);
    });
  }, 90_000);
});
