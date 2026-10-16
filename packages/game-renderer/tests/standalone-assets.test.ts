// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { Blob } from "node:buffer";
import { URL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";
import type { GameAssetBinding3D } from "@nodetool-ai/protocol";
import { musicWav } from "./fixtures/music-wav.js";

const observed = vi.hoisted(() => ({ audio: undefined as Promise<Uint8Array> | undefined }));
vi.mock("../src/browser3d.js", () => ({ createGameRenderer3D: async () => ({
  capabilities: { deviceStatus: "ready" }, resize() {}, dispose() {},
  render: async () => ({ drawCalls: 1, triangles: 12 })
}) }));
vi.mock("../src/audio.js", () => ({ gameAudioSpatialView3D: () => undefined,
  GameAudioPlayer: class {
    constructor(private readonly options: { assets: Record<string, GameAssetBinding3D>; resolveAsset: (binding: GameAssetBinding3D) => Promise<string | null> }) {}
    preload() {
      const binding = this.options.assets.music;
      if (!binding) { throw new Error("Missing music control"); }
      observed.audio = this.options.resolveAsset(binding).then(async (url) => {
        if (!url) { throw new Error("Missing audio URL"); }
        return new Uint8Array(await (await fetch(url)).arrayBuffer());
      });
    }
    sync() {} async unlock() {} updateSpatial() {} mixerState() { return {}; }
    handle() {} pause() {} resume() {} reset() {} dispose() {}
  }
}));
vi.mock("../src/frame-budget.js", () => ({ GameFrameBudgetMonitor: class { observe() {} }, gameAudioVoiceCount: () => 0 }));
vi.mock("../src/save-storage.js", () => ({ createIndexedDbGameSaveStorage: () => ({}) }));
vi.mock("../src/ui/controller.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/ui/controller.js")>(),
  browserGameUiMeasure: () => () => 0,
  browserGameUiInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
afterEach(() => { window.dispatchEvent(new Event("beforeunload")); vi.unstubAllGlobals(); });

it("feeds audio the same verified bytes when the static asset server changes afterwards", async () => {
  const originalFetch = globalThis.fetch;
  const first = musicWav();
  const replacement = Buffer.from(first); replacement.fill(0, 44);
  expect(createHash("sha256").update(first).digest("hex")).not.toBe(createHash("sha256").update(replacement).digest("hex"));
  const digest = createHash("sha256").update(first).digest("hex");
  const path = `./assets/${digest}.wav`;
  const game = createNative3DGame("verified audio");
  game.assets.music = { assetId: "original-music", digest, mediaKind: "audio", required: true };
  let requests = 0;
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><button id="pause"></button><button id="reset"></button>';
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("Blob", Blob); vi.stubGlobal("URL", URL);
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.startsWith("blob:")) { return originalFetch(url); }
    if (url === path) {
      requests += 1;
      const bytes = requests === 1 ? first : replacement;
      return { ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
    }
    return { ok: true, json: async () => url.endsWith("manifest.json") ? { assets: { music: path } } : game };
  });
  await import("../src/standalone-player3d.js");
  await vi.waitFor(() => expect(observed.audio).toBeDefined());
  expect(Buffer.compare(Buffer.from(await observed.audio!), first)).toBe(0);
  expect(requests).toBe(1);
});
