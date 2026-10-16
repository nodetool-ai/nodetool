// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { gameDocument, type GameDocument, type GameInputFrame } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

const observed = vi.hoisted(() => ({ inputs: [] as GameInputFrame[] }));

vi.mock("@nodetool-ai/game-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/game-runtime")>();
  return {
    ...actual,
    createScriptedGameSession: async (document: GameDocument) => {
      const session = actual.createGameSession(document, 1);
      const step = session.step.bind(session);
      vi.spyOn(session, "step").mockImplementation((input) => {
        observed.inputs.push(structuredClone(input));
        return step(input);
      });
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
vi.mock("../src/save-storage.js", () => ({ createIndexedDbGameSaveStorage: () => ({}), loadQuickSave: async () => null }));
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

it("drops a paused tap through the actual API and toolbar, then delivers one fresh resumed edge", async () => {
  const source = createTopDownRoomGame("Paused input");
  const game = gameDocument.parse({ ...source, inputActions: [...source.inputActions, "fire"],
    inputBindings: { actions: { fire: [{ kind: "key", code: "KeyF" }, { kind: "mouseButton", button: 0 }] } } });
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><div id="touch"></div>' +
    ["pause", "step", "reset", "save", "load", "fullscreen"].map((id) => `<button id="${id}">${id}</button>`).join("");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => game })));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  await import("../src/standalone-player.js");
  await vi.waitFor(() => expect(window.nativeGamePlayer).toBeDefined());
  window.nativeGamePlayer.pause();
  const pausedAt = observed.inputs.length;
  const tap = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF", key: "f" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyF", key: "f" }));
  };
  tap();
  document.getElementById("pause")?.click();
  await vi.waitFor(() => expect(observed.inputs.length).toBeGreaterThan(pausedAt));
  expect(observed.inputs[pausedAt].justPressed).toEqual([]);
  const resumedAt = observed.inputs.length;
  tap();
  await vi.waitFor(() => expect(observed.inputs.length).toBeGreaterThan(resumedAt + 1));
  expect(observed.inputs.slice(resumedAt).filter((input) => input.justPressed.includes("fire"))).toHaveLength(1);
  const mouseAt = observed.inputs.length;
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  canvas.setPointerCapture = vi.fn();
  canvas.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, buttons: 0 }));
  await vi.waitFor(() => expect(observed.inputs.length).toBeGreaterThan(mouseAt));
  expect(observed.inputs[mouseAt].justPressed).toEqual(["fire"]);
});
