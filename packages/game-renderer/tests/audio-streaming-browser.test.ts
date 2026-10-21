import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { expect, it } from "vitest";
import { gameUiTree } from "@nodetool-ai/protocol";
import { musicWav } from "./fixtures/music-wav.js";
import { buildStandaloneGame } from "../src/build.js";
import { buildStandaloneGame3D } from "../src/build3d.js";

declare global {
  interface Window {
    streamingTestMedia: HTMLAudioElement[];
    streamingTestDecodes: number;
    streamingTestAudioFetches: number;
    streamingTestMediaSources: number;
  }
}


it.each(["2D", "3D"])("plays exported %s streaming music after a gesture and loops without PCM decoding", async (dimension) => {
  const directory = await mkdtemp(join(tmpdir(), "game-streaming-music-"));
  const output = join(directory, "game");
  const bytes = musicWav();
  const digest = createHash("sha256").update(bytes).digest("hex");
  const document = dimension === "3D" ? createNative3DGame("streaming-browser3d") :
    { ...createTopDownRoomGame("streaming-browser"), schemaVersion: 2 as const };
  document.ui = gameUiTree.parse({ focusNavigation: true, nodes: [
    { kind: "button", id: "start", action: document.inputActions[0], width: 100, height: 100 }
  ] });
  document.scenes[0].music = { assetId: "music", volume: 0.4, fadeInTicks: 6, fadeOutTicks: 6,
    streaming: { loopStartSeconds: 10, loopEndSeconds: 20 } };
  if (document.schemaVersion === 3) {
    document.assets.music = { assetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", digest, mediaKind: "audio", required: true };
  } else {
    document.assets.music = { assetId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", digest, mediaKind: "audio", width: 1, height: 1,
      pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
  }
  const server = createServer((request, response) => {
    const file = request.url === "/" ? "index.html" : request.url?.slice(1);
    if (!file || file.includes("..") || file.includes("?")) { response.writeHead(404); response.end(); return; }
    void readFile(join(output, file)).then((data) => {
      response.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".wasm") ? "application/wasm" :
        file.endsWith(".wav") ? "audio/wav" : file.endsWith(".json") ? "application/json" : file.endsWith(".css") ? "text/css" : "text/html");
      response.end(data);
    }).catch(() => { response.writeHead(404); response.end(); });
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const resolveAsset = async (id: string) => id === "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" ? { bytes, mimeType: "audio/wav" } : null;
    if (document.schemaVersion === 3) {
      await buildStandaloneGame3D({ document, outputDir: output, resolveAsset });
    } else {
      await buildStandaloneGame({ document, outputDir: output, resolveAsset });
    }
    const exported = JSON.parse(await readFile(join(output, "game.json"), "utf8"));
    expect(exported.scenes[0].music).toEqual(document.scenes[0].music);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Static game server did not bind");
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true,
      args: dimension === "3D" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [] });
    const page = await browser.newPage();
    const outside: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(`${origin}/`)) return route.continue();
      outside.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(() => {
      window.streamingTestMedia = [];
      window.streamingTestDecodes = 0;
      window.streamingTestAudioFetches = 0;
      window.streamingTestMediaSources = 0;
      const mediaSource = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function(...args: Parameters<AudioContext["createMediaElementSource"]>) {
        window.streamingTestMediaSources++;
        return mediaSource.apply(this, args);
      };
      const NativeAudio = window.Audio;
      window.Audio = class extends NativeAudio {
        constructor(src?: string) { super(src); window.streamingTestMedia.push(this); }
      };
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function(...args: Parameters<AudioContext["decodeAudioData"]>) {
        window.streamingTestDecodes++;
        return decode.apply(this, args);
      };
      const fetch = window.fetch.bind(window);
      window.fetch = (...args: Parameters<typeof fetch>) => {
        const input = args[0];
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith(".wav")) window.streamingTestAudioFetches++;
        return fetch(...args);
      };
    });
    await page.goto(origin);
    await page.waitForFunction((is3D) => Boolean(is3D ? window.nativeGame3DPlayer : window.nativeGamePlayer), dimension === "3D");
    expect(await page.evaluate(() => window.streamingTestMedia.every(media => media.paused))).toBe(true);
    const canvas = page.locator("canvas").first();
    // Press the HUD start button in the top-left of the rendered image, which the
    // exported page letterboxes inside the canvas element with object-fit: contain.
    const imageOrigin = await canvas.evaluate((element: HTMLCanvasElement) => {
      const scale = Math.min(element.clientWidth / element.width, element.clientHeight / element.height);
      return { x: (element.clientWidth - element.width * scale) / 2, y: (element.clientHeight - element.height * scale) / 2 };
    });
    await canvas.click({ position: { x: imageOrigin.x + 10, y: imageOrigin.y + 10 } });
    await page.waitForFunction(() => window.streamingTestMedia.length === 1 && !window.streamingTestMedia[0].paused && window.streamingTestMedia[0].currentTime > 0);
    const startup = await page.evaluate(() => ({ decodes: window.streamingTestDecodes, encodedFetches: window.streamingTestAudioFetches,
      mediaSources: window.streamingTestMediaSources, mediaUrl: window.streamingTestMedia[0].src, duration: window.streamingTestMedia[0].duration }));
    expect(startup).toMatchObject({ decodes: 0, mediaSources: 1, duration: 120 });
    expect(startup.encodedFetches).toBe(1);
    expect(startup.mediaUrl).toMatch(/^blob:/);
    console.info(`${dimension} streaming music startup`, startup);
    await page.evaluate(() => { window.streamingTestMedia[0].currentTime = 19.95; });
    await page.waitForFunction(() => window.streamingTestMedia[0].currentTime >= 10 && window.streamingTestMedia[0].currentTime < 11);
    await page.locator("#pause").click();
    await page.waitForFunction(() => window.streamingTestMedia[0].paused);
    await page.locator("#pause").click();
    await page.waitForFunction(() => !window.streamingTestMedia[0].paused);
    expect(await page.evaluate(() => window.streamingTestMedia.length)).toBe(1);
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
