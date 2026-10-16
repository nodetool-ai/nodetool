// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { Blob } from "node:buffer";
import { URL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTopDownRoomGame, validateGame } from "@nodetool-ai/game-runtime";
import type { GameAssetBinding, GameDocument } from "@nodetool-ai/protocol";
import { musicWav } from "./fixtures/music-wav.js";

const observed = vi.hoisted(() => ({ kind: "image", consumed: undefined as Promise<unknown> | undefined }));
function track(pending: Promise<unknown>): void { observed.consumed = pending; void pending.catch(() => undefined); }
vi.mock("../src/browser.js", () => ({
  loadBrowserGameFonts: async (game: GameDocument, resolver: (id: string) => Promise<string | null>) => {
    if (observed.kind === "font") {
      track(resolver(game.assets.control!.assetId).then(async (url) => { if (!url) { throw new Error("Missing font"); } return (await fetch(url)).arrayBuffer(); }));
    }
    return { dispose() {}, diagnostics: [] };
  },
  createGameRenderer: async (options: { assets: (id: string) => Promise<unknown> }) => {
    if (observed.kind === "image") { track(options.assets("control")); }
    return { backend: "Canvas2D", capabilities: { gpuEffects: false }, resize() {}, dispose() {},
      render: async () => ({ drawCalls: 0, particles: 0 }) };
  }
}));
vi.mock("../src/audio.js", () => ({ gameAudioSpatialView2D: () => undefined,
  GameAudioPlayer: class {
    constructor(private readonly options: { assets: Record<string, GameAssetBinding>; resolveAsset: (binding: GameAssetBinding) => Promise<string | null> }) {}
    preload() {
      if (observed.kind === "audio") {
        track(this.options.resolveAsset(this.options.assets.control!).then(async (url) => { if (!url) { throw new Error("Missing audio"); } return (await fetch(url)).arrayBuffer(); }));
      }
    }
    sync() {} async unlock() {} updateSpatial() {} mixerState() { return {}; }
    handle() {} pause() {} resume() {} reset() {} dispose() {}
  }
}));
vi.mock("../src/frame-budget.js", () => ({ GameFrameBudgetMonitor: class { observe() {} }, gameAudioVoiceCount: () => 0 }));
vi.mock("../src/save-storage.js", () => ({ createIndexedDbGameSaveStorage: () => ({}), loadQuickSave: async () => null }));
vi.mock("../src/ui/controller.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/ui/controller.js")>(), browserGameUiMeasure: () => () => 0,
  browserGameUiInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
beforeEach(() => { vi.resetModules(); observed.consumed = undefined; });
afterEach(() => { window.dispatchEvent(new Event("beforeunload")); vi.unstubAllGlobals(); });

it.each(["image", "font", "audio"] as const)("rejects substituted valid 2D %s media before its consumer receives it", async (kind) => {
  const originalFetch = globalThis.fetch;
  observed.kind = kind;
  let original: Uint8Array;
  let replacement: Uint8Array;
  if (kind === "font") {
    original = await readFile(resolve("../timeline/fonts/BebasNeue-Regular.ttf"));
    replacement = await readFile(resolve("../timeline/fonts/Inter-SemiBold.ttf"));
  } else if (kind === "audio") {
    original = musicWav(); replacement = Uint8Array.from(original); replacement.fill(0, 44);
  } else {
    const canvas = createCanvas(2, 2); original = canvas.toBuffer("image/png");
    canvas.getContext("2d").fillRect(0, 0, 2, 2); replacement = canvas.toBuffer("image/png");
  }
  const digest = createHash("sha256").update(original).digest("hex");
  const path = `./assets/${digest}.${kind === "image" ? "png" : kind === "font" ? "ttf" : "wav"}`;
  const game = createTopDownRoomGame("2D verified media");
  game.schemaVersion = 2;
  game.assets.control = { assetId: path, digest, mediaKind: kind, width: 2, height: 2, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" };
  if (kind === "font") { game.assets.control.fontFormat = "ttf"; }
  expect(validateGame(game).valid).toBe(true);
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><div id="touch"></div>' +
    ["pause", "step", "reset", "save", "load", "fullscreen"].map((id) => `<button id="${id}">${id}</button>`).join("");
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("Blob", Blob); vi.stubGlobal("URL", URL);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("createImageBitmap", async () => ({ width: 2, height: 2, close() {} }));
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.startsWith("blob:")) { return originalFetch(url); }
    return url === path ? { ok: true, arrayBuffer: async () => Uint8Array.from(replacement).buffer, blob: async () => new Blob([Uint8Array.from(replacement)]) }
      : { ok: true, json: async () => game };
  });
  await import("../src/standalone-player.js");
  await vi.waitFor(() => expect(observed.consumed).toBeDefined());
  const failure = await observed.consumed?.then(() => null, (error: unknown) => error);
  expect(failure instanceof Error ? failure.message : "accepted substituted media").toMatch(/digest/i);
});
