// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDocument, type GameDocument, type GameInputFrame, type GameSnapshot } from "@nodetool-ai/protocol";
import { createTopDownRoomGame, type GameSession, type GameSaveRecord } from "@nodetool-ai/game-runtime";

const observed = vi.hoisted(() => ({
  sessions: [] as GameSession[], load: undefined as Promise<GameSaveRecord | null> | undefined,
  nextOpen: undefined as Promise<void> | undefined
}));

vi.mock("@nodetool-ai/game-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/game-runtime")>();
  return {
    ...actual,
    createScriptedGameSession: async (document: GameDocument, seed: number, snapshot?: GameSnapshot) => {
      const session = actual.createGameSession(document, seed, snapshot);
      observed.sessions.push(session);
      const waiting = observed.nextOpen;
      observed.nextOpen = undefined;
      if (waiting) { await waiting; }
      return session;
    },
    GamePlayerSaves: class {
      withLoaded(input: GameInputFrame) { return input; }
      handle() {}
      clear() {}
      async save() {}
      async load() { return null; }
      async remove() {}
      async slots() { return []; }
    }
  };
});
vi.mock("../src/browser.js", () => ({
  loadBrowserGameFonts: async () => ({ dispose() {}, diagnostics: [] }),
  createGameRenderer: async () => ({
    backend: "Canvas2D", capabilities: { gpuEffects: false }, resize() {}, dispose() {},
    render: async () => ({ drawCalls: 0, particles: 0 })
  })
}));
vi.mock("../src/audio.js", () => ({
  gameAudioSpatialView2D: () => undefined,
  GameAudioPlayer: class {
    preload() {}
    sync() {}
    async unlock() {}
    updateSpatial() {}
    mixerState() { return {}; }
    handle() {}
    pause() {}
    resume() {}
    reset() {}
    dispose() {}
  }
}));
vi.mock("../src/frame-budget.js", () => ({ GameFrameBudgetMonitor: class { observe() {} }, gameAudioVoiceCount: () => 0 }));
vi.mock("../src/particles/render2d.js", () => ({ GameParticles2D: class { count = 0; tick() {} clear() {} } }));
vi.mock("../src/save-storage.js", () => ({ createIndexedDbGameSaveStorage: () => ({}), loadQuickSave: async () => observed.load ?? null }));
vi.mock("../src/ui/controller.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/ui/controller.js")>(),
  browserGameUiMeasure: () => () => 0,
  browserGameUiInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

afterEach(() => {
  window.dispatchEvent(new Event("beforeunload"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetModules();
  observed.sessions.length = 0;
  observed.load = undefined;
  observed.nextOpen = undefined;
  Reflect.deleteProperty(window, "nativeGamePlayer");
});

async function startPlayer(): Promise<void> {
  const game = gameDocument.parse(createTopDownRoomGame("Save lifecycle"));
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><div id="touch"></div>' +
    ["pause", "step", "reset", "save", "load", "fullscreen"].map((id) => `<button id="${id}">${id}</button>`).join("");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => game })));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  await import("../src/standalone-player.js");
  await vi.waitFor(() => expect(window.nativeGamePlayer).toBeDefined());
  window.nativeGamePlayer.pause();
}

function delayedSave(snapshot: GameSnapshot) {
  const pending = Promise.withResolvers<GameSaveRecord | null>();
  observed.load = pending.promise;
  document.getElementById("load")?.click();
  return () => pending.resolve({ version: 1, data: {}, snapshot: { ...snapshot, score: 77 } });
}

describe("standalone async save lifecycle", () => {
  it("does not replace a reset session when an older load completes", async () => {
    await startPlayer();
    const completeLoad = delayedSave(window.nativeGamePlayer.snapshot());
    await window.nativeGamePlayer.reset();
    const current = window.nativeGamePlayer.snapshot();
    completeLoad();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(window.nativeGamePlayer.snapshot()).toEqual(current);
    expect(observed.sessions.length).toBe(2);
  });

  it("does not create or render a session from a load completed after teardown", async () => {
    await startPlayer();
    const completeLoad = delayedSave(window.nativeGamePlayer.snapshot());
    window.dispatchEvent(new Event("beforeunload"));
    completeLoad();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(observed.sessions.length).toBe(1);
  });

  it("disposes an obsolete session when its async creation finishes after reset", async () => {
    await startPlayer();
    const open = Promise.withResolvers<void>();
    observed.nextOpen = open.promise;
    observed.load = Promise.resolve({ version: 1, data: {}, snapshot: { ...window.nativeGamePlayer.snapshot(), score: 77 } });
    document.getElementById("load")?.click();
    await vi.waitFor(() => expect(observed.sessions.length).toBe(2));
    const obsoleteDispose = vi.spyOn(observed.sessions[1]!, "dispose");
    await window.nativeGamePlayer.reset();
    const current = window.nativeGamePlayer.snapshot();
    open.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(obsoleteDispose).toHaveBeenCalledTimes(1);
    expect(window.nativeGamePlayer.snapshot()).toEqual(current);
  });

  it("keeps live play available when acquiring legacy localStorage throws", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let acquisitions = 0;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => {
      acquisitions += 1;
      throw new DOMException("Storage blocked", "SecurityError");
    } });
    try {
      await startPlayer();
      expect(acquisitions).toBe(0);
      document.getElementById("pause")?.click();
      await vi.waitFor(() => expect(window.nativeGamePlayer.snapshot().tick).toBeGreaterThan(0));
    } finally {
      if (descriptor) { Object.defineProperty(globalThis, "localStorage", descriptor); }
      else { Reflect.deleteProperty(globalThis, "localStorage"); }
    }
  });

});
