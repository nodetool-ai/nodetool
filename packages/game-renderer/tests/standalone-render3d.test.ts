// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gameInputFrame3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createNative3DGame } from "@nodetool-ai/game-runtime";

const observed = vi.hoisted(() => ({ rendered: [] as number[], nextRender: undefined as Promise<void> | undefined,
  failure: undefined as Error | undefined }));
vi.mock("../src/browser3d.js", () => ({ createGameRenderer3D: async () => ({
  capabilities: { deviceStatus: "ready" }, resize() {}, dispose() {},
  render: async (frame: GameRenderFrame3D) => {
    observed.rendered.push(frame.tick);
    const pending = observed.nextRender;
    const failure = observed.failure;
    observed.nextRender = undefined;
    observed.failure = undefined;
    if (pending) { await pending; }
    if (failure) { throw failure; }
    return { drawCalls: 1, triangles: 12 };
  }
}) }));
vi.mock("../src/audio.js", () => ({ gameAudioSpatialView3D: () => undefined,
  GameAudioPlayer: class {
    preload() {} sync() {} async unlock() {} updateSpatial() {} mixerState() { return {}; }
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
const animationCallbacks = new Map<number, FrameRequestCallback>();
let nextAnimationId = 0;
beforeEach(() => {
  vi.resetModules(); observed.rendered.length = 0; observed.nextRender = undefined; observed.failure = undefined;
  Reflect.deleteProperty(window, "nativeGame3DPlayer");
  animationCallbacks.clear(); nextAnimationId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationCallbacks.set(++nextAnimationId, callback);
    return nextAnimationId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { animationCallbacks.delete(id); });
});
afterEach(() => { window.dispatchEvent(new Event("beforeunload")); vi.unstubAllGlobals(); });
async function start(dispatchStartupFrame = false): Promise<void> {
  const game = createNative3DGame("render acknowledgement");
  document.body.innerHTML = '<canvas id="game"></canvas><div id="status"></div><button id="pause"></button><button id="reset"></button>';
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("fetch", async (url: string) => ({ ok: true, json: async () => url.endsWith("manifest.json") ? { assets: {} } : game }));
  await import("../src/standalone-player3d.js");
  await vi.waitFor(() => expect(window.nativeGame3DPlayer).toBeDefined());
  if (dispatchStartupFrame) {
    await vi.waitFor(() => expect(animationCallbacks.size).toBe(1));
    const [id, callback] = animationCallbacks.entries().next().value!;
    animationCallbacks.delete(id);
    callback(performance.now());
    await vi.waitFor(() => expect(observed.rendered).toEqual([0, 0]));
  }
  window.nativeGame3DPlayer.pause();
}
const input = () => gameInputFrame3D.parse({ pressed: [] });

it("waits for a pending initial render and then draws the exact explicit tick", async () => {
  const initial = Promise.withResolvers<void>(); observed.nextRender = initial.promise;
  await start();
  let acknowledged = false;
  const step = window.nativeGame3DPlayer.step(input()).then((receipt) => { acknowledged = true; return receipt; });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(acknowledged).toBe(false);
  initial.resolve();
  expect(await step).toMatchObject({ tick: 1, frameNumber: expect.any(Number) });
  expect(observed.rendered).toEqual([0, 1]);
});

it("propagates render failure without credit and allows the next explicit command", async () => {
  await start();
  observed.failure = new Error("deliberate renderer failure");
  await expect(window.nativeGame3DPlayer.step(input())).rejects.toThrow("deliberate renderer failure");
  const receipt = await window.nativeGame3DPlayer.step(input());
  expect(receipt).toEqual({ tick: 2, frameNumber: 2 });
});

it("serializes concurrent explicit commands and reports reset and advance renders", async () => {
  await start(); observed.rendered.length = 0;
  await Promise.all([window.nativeGame3DPlayer.step(input()), window.nativeGame3DPlayer.step(input())]);
  expect(observed.rendered).toEqual([1, 2]);
  expect(await window.nativeGame3DPlayer.reset()).toMatchObject({ tick: 0 });
  expect(await window.nativeGame3DPlayer.advance([input(), input()])).toMatchObject({ tick: 2 });
});

it("credits a deliberately dispatched startup animation frame", async () => {
  await start(true);
  expect(await window.nativeGame3DPlayer.step(input())).toEqual({ tick: 1, frameNumber: 3 });
});
