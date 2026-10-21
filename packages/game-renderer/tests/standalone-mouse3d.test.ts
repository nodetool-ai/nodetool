// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameDocument3D, type GameInputFrame3D } from "@nodetool-ai/protocol";
import { blockoutFrame } from "./fixtures/game3d.js";

const observed = vi.hoisted(() => ({ inputs: [] as GameInputFrame3D[] }));
vi.mock("@nodetool-ai/game-runtime", () => ({
  decodePreparedGameCollider3D: vi.fn(),
  createGameSession3D: async () => {
    const frame = blockoutFrame();
    return { frame: () => frame, snapshot: () => ({}), audioState: () => ({ tick: 0, sceneId: "scene", music: null }), inspect: () => ({}), dispose() {}, takePresentationEvents: () => [],
      step: (input: GameInputFrame3D) => { observed.inputs.push(structuredClone(input)); return { frame, events: [] }; } };
  },
  GamePlayerSaves: class {
    withLoaded(input: GameInputFrame3D) { return input; }
    handle() {} clear() {} async save() {} async load() { return null; } async remove() {} async slots() { return []; }
  }
}));
vi.mock("../src/browser3d.js", () => ({ createGameRenderer3D: async () => ({
  capabilities: { deviceStatus: "ready" }, resize() {}, dispose() {}, render: async () => ({ drawCalls: 0, triangles: 0 })
}) }));
vi.mock("../src/audio.js", () => ({ gameAudioSpatialView3D: () => undefined, GameAudioPlayer: class {
  preload() {} sync() {} async unlock() {} updateSpatial() {} mixerState() { return {}; } handle() {}
  pause() {} resume() {} reset() {} dispose() {}
} }));
vi.mock("../src/frame-budget.js", () => ({ GameFrameBudgetMonitor: class { observe() {} }, gameAudioVoiceCount: () => 0 }));
vi.mock("../src/particles/particles3d.js", () => ({ GameParticles3D: class { count = 0; tick() {} clear() {} } }));
vi.mock("../src/save-storage.js", () => ({ createIndexedDbGameSaveStorage: () => ({}) }));
vi.mock("../src/ui/controller.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/ui/controller.js")>(),
  browserGameUiMeasure: () => () => 0,
  browserGameUiInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

beforeEach(() => {
  vi.resetModules();
  observed.inputs = [];
  Reflect.deleteProperty(window, "nativeGame3DPlayer");
});

afterEach(() => {
  window.dispatchEvent(new Event("beforeunload"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pointer(target: EventTarget, type: string, buttons: number, button = 0): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, buttons, button });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" },
    movementX: { value: 0 }, movementY: { value: 0 } });
  target.dispatchEvent(event);
}

async function openHost() {
  const game = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "mouse-test", revision: "draft",
    entrySceneId: "scene", tickRate: 60, presentation: { aspectRatio: 1, hudWidth: 128, hudHeight: 128 }, inputActions: ["fire", "alt"], assets: {},
    inputBindings: { actions: { fire: [{ kind: "mouseButton", button: 0 }], alt: [{ kind: "mouseButton", button: 2 }] }, look: [] },
    scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } }
    ] }] });
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><button id="pause">Pause</button>';
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("manifest.json") ? { assets: {} } : game })));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  let locked = true;
  Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked ? canvas : null });
  const capture = vi.fn(() => { if (locked) { throw new DOMException("Pointer is locked", "InvalidStateError"); } });
  canvas.setPointerCapture = capture;
  canvas.requestPointerLock = vi.fn();
  const errors: ErrorEvent[] = [];
  const error = (event: ErrorEvent) => { errors.push(event); event.preventDefault(); };
  window.addEventListener("error", error);
  await import("../src/standalone-player3d.js");
  await vi.waitFor(() => expect(window.nativeGame3DPlayer).toBeDefined());
  return { canvas, capture, errors, unlock: () => { locked = false; document.dispatchEvent(new Event("pointerlockchange")); },
    lock: () => { locked = true; document.dispatchEvent(new Event("pointerlockchange")); },
    cleanup: () => window.removeEventListener("error", error) };
}

async function sampleAfter(action: () => void): Promise<GameInputFrame3D> {
  const start = observed.inputs.length;
  action();
  await vi.waitFor(() => expect(observed.inputs.length).toBeGreaterThan(start));
  return observed.inputs[start];
}

it("samples every locked click without attempting forbidden pointer capture, including reacquisition", async () => {
  const host = await openHost();
  try {
    const click = async () => {
      const frame = await sampleAfter(() => { pointer(host.canvas, "pointerdown", 1); pointer(window, "pointerup", 0); });
      expect(frame.justPressed).toEqual(["fire"]);
      expect((await sampleAfter(() => {})).justPressed).toEqual([]);
    };
    await click();
    await click();
    host.unlock();
    host.lock();
    await click();
    expect(host.capture).not.toHaveBeenCalled();
    expect(host.canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(host.errors).toEqual([]);
  } finally { host.cleanup(); }
});

it.each([[1, 3, 2, 0], [2, 3, 1, 0]])("reconciles a real host mouse chord %j including intermediate moves", async (first, both, remaining, none) => {
  const host = await openHost();
  host.unlock();
  try {
    const names = (mask: number) => ["fire", "alt"].filter((_, index) => (mask & [1, 2][index]) !== 0);
    const firstFrame = await sampleAfter(() => pointer(host.canvas, "pointerdown", first, first === 1 ? 0 : 2));
    expect(firstFrame.pressed).toEqual(names(first));
    const chord = await sampleAfter(() => pointer(host.canvas, "pointermove", both));
    expect(chord.pressed).toEqual(names(both));
    expect(chord.justPressed).toEqual(names(remaining));
    const release = await sampleAfter(() => pointer(window, "pointermove", remaining));
    expect(release.pressed).toEqual(names(remaining));
    expect(release.justPressed).toEqual([]);
    expect((await sampleAfter(() => pointer(window, "pointerup", none))).pressed).toEqual([]);
    expect(host.canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(host.errors).toEqual([]);
  } finally { host.cleanup(); }
});

it("clears actual host mouse holds on blur, cancel, unlock and pause before accepting a fresh resumed click", async () => {
  const host = await openHost();
  try {
    for (const stop of [() => window.dispatchEvent(new Event("blur")), () => host.canvas.dispatchEvent(new Event("blur")),
      () => pointer(host.canvas, "pointercancel", 0), () => host.unlock()]) {
      expect((await sampleAfter(() => pointer(host.canvas, "pointerdown", 1))).pressed).toEqual(["fire"]);
      expect((await sampleAfter(stop)).pressed).toEqual([]);
      expect((await sampleAfter(() => pointer(host.canvas, "pointermove", 1))).pressed).toEqual([]);
    }
    host.lock();
    window.nativeGame3DPlayer.pause();
    pointer(host.canvas, "pointerdown", 1);
    pointer(window, "pointerup", 0);
    const resumed = await sampleAfter(() => document.getElementById("pause")?.click());
    expect(resumed.pressed).toEqual([]);
    expect(resumed.justPressed).toEqual([]);
    const fresh = await sampleAfter(() => { pointer(host.canvas, "pointerdown", 1); pointer(window, "pointerup", 0); });
    expect(fresh.justPressed).toEqual(["fire"]);
  } finally { host.cleanup(); }
});
