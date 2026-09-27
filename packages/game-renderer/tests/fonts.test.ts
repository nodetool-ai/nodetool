import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { chromium } from "@playwright/test";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { buildStandaloneGame } from "../src/build.js";
import { gameFontFamily } from "../src/fonts.js";
import { captureGameFrame } from "../src/node.js";

const directories: string[] = [];
const fontPath = fileURLToPath(new URL("../../timeline/fonts/BebasNeue-Regular.ttf", import.meta.url));

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fontFrame(required: boolean): GameRenderFrame {
  return { gameId: "font-game", tick: 0, width: 8, height: 4, pixelsPerUnit: 32,
    camera: { x: 0, y: 0, zoom: 1 }, sprites: [], tiles: [],
    hud: [{ id: "title", text: "GAME", x: 8, y: 8, size: 40, fontId: "display" }],
    fonts: { display: { assetId: "font-source", digest: "a".repeat(64), mediaKind: "font", fontFormat: "ttf", width: 1, height: 1,
      pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required } } };
}

describe("embedded game fonts", () => {
  it("uses a collision-free family name for each game and logical font", () => {
    expect(gameFontFamily("ab", "c")).not.toBe(gameFontFamily("a", "bc"));
  });

  it("exports required font bytes under the offline CSP", async () => {
    const fontBytes = await readFile(fontPath);
    const digest = createHash("sha256").update(fontBytes).digest("hex");
    const game = createTopDownRoomGame("font-game");
    game.schemaVersion = 2;
    game.assets.display = { assetId: "font-source", digest, mediaKind: "font", fontFormat: "ttf",
      width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required: true };
    const directory = await mkdtemp(join(tmpdir(), "nodetool-font-"));
    directories.push(directory);
    const outputDir = join(directory, "build");
    const built = await buildStandaloneGame({ document: game, outputDir,
      resolveAsset: async (id) => id === "font-source" ? { bytes: fontBytes, mimeType: "font/ttf" } : null });
    expect(built.assetPaths.display).toBe(`./assets/${digest}.ttf`);
    expect(await readFile(join(outputDir, "assets", `${digest}.ttf`))).toEqual(fontBytes);
    expect(await readFile(join(outputDir, "index.html"), "utf8")).toContain("font-src 'self'");
  });

  it("rejects invalid font data during export", async () => {
    const bytes = Buffer.from([0, 1, 0, 0, 4, 5, 6, 7]);
    const game = createTopDownRoomGame("font-game");
    game.schemaVersion = 2;
    game.assets.display = { assetId: "font-source", digest: createHash("sha256").update(bytes).digest("hex"),
      mediaKind: "font", fontFormat: "ttf", width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest", required: true };
    const directory = await mkdtemp(join(tmpdir(), "nodetool-font-"));
    directories.push(directory);
    await expect(buildStandaloneGame({ document: game, outputDir: join(directory, "build"),
      resolveAsset: async () => ({ bytes, mimeType: "font/ttf" }) })).rejects.toThrow("Invalid font bytes for display");
  });

  it("loads the same font in headless capture and rejects a missing required font", async () => {
    const bytes = await readFile(fontPath);
    const frame = fontFrame(true);
    const image = await loadImage(Buffer.from(await captureGameFrame(frame, { resolveAsset: async () => bytes })));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    await expect(captureGameFrame(frame, { resolveAsset: async () => null })).rejects.toThrow("Required font display could not load");
  });

  it("reports optional fallback before capture", async () => {
    const diagnostics: string[] = [];
    await captureGameFrame(fontFrame(false), { resolveAsset: async () => null, onDiagnostic: (message) => diagnostics.push(message) });
    expect(diagnostics).toEqual(["Optional font display could not load; using system font"]);
  });

  it.skipIf(!process.env.NODETOOL_BROWSER_FONT_TEST)("keeps browser and headless label width within two pixels", async () => {
    const bytes = await readFile(fontPath);
    const family = gameFontFamily("font-game", "display");
    const key = GlobalFonts.register(bytes, family);
    expect(key).not.toBeNull();
    const headless = createCanvas(256, 128).getContext("2d");
    headless.font = `600 40px "${family}"`;
    const headlessWidth = headless.measureText("GAME").width;
    if (key) GlobalFonts.remove(key);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const width = await page.evaluate(async ({ font, name }) => {
        const face = new FontFace(name, `url(data:font/ttf;base64,${font})`);
        await face.load();
        document.fonts.add(face);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas2D unavailable");
        context.font = `600 40px "${name}"`;
        return context.measureText("GAME").width;
      }, { font: bytes.toString("base64"), name: family });
      expect(Math.abs(width - headlessWidth)).toBeLessThanOrEqual(2);
    } finally {
      await browser.close();
    }
  });
});
