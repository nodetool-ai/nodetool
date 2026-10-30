// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDocument, gameInputFrame, type GameDocument, type GameRenderFrame, type GameInputFrame, type GameSnapshot } from "@nodetool-ai/protocol";
import { createTopDownRoomGame, type GameSession, type GameSaveRecord } from "@nodetool-ai/game-runtime";

interface LifecycleObservations {
  readonly sessions: GameSession[];
  load: Promise<GameSaveRecord | null> | undefined;
  nextOpen: Promise<void> | undefined;
  readonly rendered: number[];
  nextRender: Promise<void> | undefined;
  renderFailure: Error | undefined;
}
const observed = vi.hoisted((): LifecycleObservations => ({
  sessions: [], load: undefined, nextOpen: undefined, rendered: [], nextRender: undefined, renderFailure: undefined
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
    render: async (frame: GameRenderFrame) => {
      observed.rendered.push(frame.tick);
      const pending = observed.nextRender;
      const failure = observed.renderFailure;
      observed.nextRender = undefined;
      observed.renderFailure = undefined;
      if (pending) { await pending; }
      if (failure) { throw failure; }
      return { drawCalls: 0, particles: 0 };
    }
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
  observed.rendered.length = 0;
  observed.nextRender = undefined;
  observed.renderFailure = undefined;
  Reflect.deleteProperty(window, "nativeGamePlayer");
});

async function launchPlayer(): Promise<void> {
  const game = gameDocument.parse(createTopDownRoomGame("Save lifecycle"));
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><div id="touch"></div>' +
    ["pause", "step", "reset", "save", "load", "fullscreen"].map((id) => `<button id="${id}">${id}</button>`).join("");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => game })));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  await import("../src/standalone-player.js");
}

async function startPlayer(): Promise<void> {
  await launchPlayer();
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
    const animation = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    vi.spyOn(performance, "now").mockReturnValue(0);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let acquisitions = 0;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => {
      acquisitions += 1;
      throw new DOMException("Storage blocked", "SecurityError");
    } });
    try {
      await startPlayer();
      expect(acquisitions).toBe(0);
      expect(window.nativeGamePlayer.snapshot().tick).toBe(0);
      document.getElementById("pause")?.click();
      const frame = animation.mock.calls[0]?.[0];
      if (!frame) { throw new Error("Live play did not schedule an animation frame"); }
      frame(100);
      expect(window.nativeGamePlayer.snapshot().tick).toBeGreaterThan(0);
      expect(acquisitions).toBe(0);
    } finally {
      if (descriptor) { Object.defineProperty(globalThis, "localStorage", descriptor); }
      else { Reflect.deleteProperty(globalThis, "localStorage"); }
    }
  });

});


describe("standalone explicit frame rendering", () => {
  it("renders each concurrently requested simulation tick in order", async () => {
    await startPlayer();
    observed.rendered.length = 0;
    const input = gameInputFrame.parse({ pressed: [], justPressed: [] });
    await Promise.all([window.nativeGamePlayer.step(input), window.nativeGamePlayer.step(input)]);
    expect(observed.rendered).toEqual([1, 2]);
  });

  it("rejects explicit steps while a toolbar load owns session replacement", async () => {
    await startPlayer();
    const completeLoad = delayedSave(window.nativeGamePlayer.snapshot());
    const input = gameInputFrame.parse({ pressed: [], justPressed: [] });
    await expect(window.nativeGamePlayer.step(input)).rejects.toThrow(/replacement|loading/i);
    expect(window.nativeGamePlayer.snapshot().tick).toBe(0);
    completeLoad();
    await vi.waitFor(() => expect(window.nativeGamePlayer.snapshot().score).toBe(77));
  });

  it("waits for an in-flight explicit render before replacing its session", async () => {
    await startPlayer();
    const rendered = Promise.withResolvers<void>();
    observed.nextRender = rendered.promise;
    const pending = window.nativeGamePlayer.step(gameInputFrame.parse({ pressed: [], justPressed: [] }));
    const outcome = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(observed.rendered).toContain(1));
    const oldDispose = vi.spyOn(observed.sessions[0]!, "dispose");
    observed.load = Promise.resolve({ version: 1, data: {}, snapshot: { ...window.nativeGamePlayer.snapshot(), score: 77 } });
    document.getElementById("load")?.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(oldDispose).not.toHaveBeenCalled();
    rendered.resolve();
    expect(await outcome).toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(window.nativeGamePlayer.snapshot().score).toBe(77));
    expect(oldDispose).toHaveBeenCalledTimes(1);
  });

  it("returns a successful render receipt bound to the stepped tick", async () => {
    await startPlayer();
    const receipt = await window.nativeGamePlayer.step(gameInputFrame.parse({ pressed: [], justPressed: [] }));
    expect(receipt).toMatchObject({ tick: 1, frameNumber: expect.any(Number) });
    expect(observed.rendered).toContain(1);
  });

  it("waits for the requested render before acknowledging its tick", async () => {
    await startPlayer();
    const rendered = Promise.withResolvers<void>();
    observed.nextRender = rendered.promise;
    let acknowledged = false;
    const pending = window.nativeGamePlayer.step(gameInputFrame.parse({ pressed: [], justPressed: [] }))
      .then((receipt) => { acknowledged = true; return receipt; });
    await vi.waitFor(() => expect(observed.rendered).toContain(1));
    expect(acknowledged).toBe(false);
    rendered.resolve();
    expect(await pending).toMatchObject({ tick: 1 });
  });

  it("rejects a failed render without crediting it or poisoning the next command", async () => {
    await startPlayer();
    const before = await window.nativeGamePlayer.reset();
    observed.renderFailure = new Error("Deliberately rejected render");
    const input = gameInputFrame.parse({ pressed: [], justPressed: [] });
    await expect(window.nativeGamePlayer.step(input)).rejects.toThrow("Deliberately rejected render");
    const after = await window.nativeGamePlayer.step(input);
    expect(after.tick).toBe(2);
    expect(after.frameNumber).toBe(before.frameNumber + 1);
  });

  it("rejects an in-flight frame superseded by reset, then acknowledges the new session", async () => {
    await startPlayer();
    const rendered = Promise.withResolvers<void>();
    observed.nextRender = rendered.promise;
    const pending = window.nativeGamePlayer.step(gameInputFrame.parse({ pressed: [], justPressed: [] }))
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(observed.rendered).toContain(1));
    const reset = window.nativeGamePlayer.reset();
    rendered.resolve();
    expect(await pending).toMatchObject({ name: "AbortError" });
    expect(await reset).toMatchObject({ tick: 0 });
    expect(window.nativeGamePlayer.snapshot().tick).toBe(0);
  });

});


describe("standalone startup presentation", () => {
  it("does not announce readiness or schedule simulation before the first render succeeds", async () => {
    const first = Promise.withResolvers<void>();
    observed.nextRender = first.promise;
    const animation = vi.spyOn(window, "requestAnimationFrame");
    await launchPlayer();
    await vi.waitFor(() => expect(observed.rendered).toContain(0));
    expect(document.getElementById("status")?.textContent).not.toContain("Ready");
    expect(animation).not.toHaveBeenCalled();
    expect(observed.sessions[0]?.snapshot().tick).toBe(0);
    first.resolve();
    await vi.waitFor(() => expect(document.getElementById("status")?.textContent).toContain("Ready"));
    expect(animation).toHaveBeenCalled();
    window.nativeGamePlayer.pause();
  });

  it("never starts simulation when the initial render rejects", async () => {
    const first = Promise.withResolvers<void>();
    observed.nextRender = first.promise;
    observed.renderFailure = new Error("Required effect presentation failed");
    const animation = vi.spyOn(window, "requestAnimationFrame");
    await launchPlayer();
    await vi.waitFor(() => expect(observed.rendered).toContain(0));
    const session = observed.sessions[0]!;
    expect(session.snapshot().tick).toBe(0);
    const step = vi.spyOn(session, "step");
    first.resolve();
    await vi.waitFor(() => expect(document.getElementById("status")?.textContent).toContain("Required effect presentation failed"));
    expect(animation).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    expect(() => session.snapshot()).toThrow(/disposed/);
  });
});

it("keeps startup render ownership when Reset is clicked before readiness", async () => {
  const first = Promise.withResolvers<void>();
  observed.nextRender = first.promise;
  await launchPlayer();
  await vi.waitFor(() => expect(observed.rendered).toContain(0));
  document.getElementById("reset")?.click();
  first.resolve();
  await vi.waitFor(() => expect(document.getElementById("status")?.textContent).toContain("Ready"));
  expect(window.nativeGamePlayer.snapshot().tick).toBe(0);
  window.nativeGamePlayer.pause();
});
