// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { nativeFrame3D, type NativeGame3dDocument, type NativeRuntimeRequest } from "@nodetool-ai/protocol/native-game";
import { nativePlayerStartupDocument } from "./fixtures/nativePlayerStartup.js";

const doubles = vi.hoisted(() => ({ factory: vi.fn(), session: vi.fn() }));
vi.mock("../src/native-cpp/renderer3d.js", () => ({ createNativeRenderer3D: doubles.factory }));
vi.mock("@nodetool-ai/game-runtime/native-browser", async (original) => ({
  ...await original<typeof import("@nodetool-ai/game-runtime/native-browser")>(),
  createNativeBrowserSession: doubles.session,
  createNativeIndexedDbSaveStorage: async () => ({ close() {}, async read() { return null; }, async write() {} }),
  attachNativeBrowserInput: () => ({ releaseAll() {}, pollGamepads() {}, dispose() {} })
}));
vi.mock("../src/native-cpp/audio.js", () => ({ createNativeAudio: async () => ({
  consume() {}, async unlock() {}, async suspend() {}, async resume() {}, async dispose() {}
}) }));
import { startNativeBrowserPlayer } from "../src/native-cpp/player.js";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("prepares the parsed 3D document before the environment-bearing first committed frame", async () => {
  const game = nativePlayerStartupDocument(), scene = game.scenes[0];
  const first = nativeFrame3D.parse({
    dimension: "3d", tick: 0, generation: 1, sceneId: scene.id,
    camera: game.camera, entities: scene.entities, environment: scene.environment,
    presentation: game.presentation, ui: { ...game.ui, safeArea: false, focusNavigation: false },
    score: 0, health: 100, hud: [], events: [], presentationEvents: [], hostRequests: [], queryResults: [],
    music: [], logs: [], lighting: {}, backgrounds: []
  });
  const requests: string[] = [], draws = vi.fn(), close = vi.fn(async () => {});
  let prepared: NativeGame3dDocument | undefined;
  doubles.factory.mockImplementation(async (_options: unknown, document?: NativeGame3dDocument) => {
    if (!document?.scenes[0].environment) { throw new Error("Native 3D environment document was not prepared"); }
    prepared = document;
    return { render: draws, resize() {}, dispose() {} };
  });
  doubles.session.mockResolvedValue({
    async request(request: NativeRuntimeRequest) {
      requests.push(request.operation);
      return { status: "ok", result: request.operation === "start" ? first : {} };
    },
    async releaseAssets() {}, close, metrics() {}
  });
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("fetch", async () => ({ ok: true, async json() { return game; } }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => callbacks.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const canvas = document.createElement("canvas"), hud = document.createElement("div"), status = document.createElement("div");
  const player = await startNativeBrowserPlayer({ canvas, hud, status, baseUrl: "http://localhost/export/" });
  try {
    callbacks.shift()?.(0);
    expect(prepared).toEqual(game);
    expect(requests).toEqual(["open", "start"]);
    expect(draws).toHaveBeenCalledWith(first);
    expect(canvas.dataset.nativeFrames).toBe("1");
    expect(status.textContent).toBe("");
  } finally { await player.dispose(); }
  expect(close).toHaveBeenCalledOnce();
});
