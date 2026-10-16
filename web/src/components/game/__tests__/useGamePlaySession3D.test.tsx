import { Profiler, StrictMode } from "react";
import { createHash } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { gameAuthoring, gameDocument3D, type GameDocument3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";
import { useGamePlaySession3D } from "../useGamePlaySession3D";
import { useGameConsoleFeed } from "../panels/console/useGameConsoleFeed";
import { getGameConsoleStore } from "../../../stores/game/GameConsoleStore";
import { FixedTickClock } from "@nodetool-ai/game-renderer";
import { createGameRenderer3D } from "@nodetool-ai/game-renderer/browser3d";
import { GameAudioPlayer, gameAudioSpatialView3D } from "@nodetool-ai/game-renderer/audio";
import { asResolvedMediaUrl, resolveMediaUri } from "../../../utils/resolveMediaUri";

jest.mock("@nodetool-ai/game-runtime", () => {
  const runtime = jest.requireActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  return { ...runtime, createGameSession3D: jest.fn(runtime.createGameSession3D) };
});

const mockRenderers: { render: jest.Mock; dispose: jest.Mock }[] = [];

jest.mock("@nodetool-ai/game-renderer/browser3d", () => ({
  createGameRenderer3D: jest.fn(async () => {
    const renderer = { render: jest.fn(async (_frame: GameRenderFrame3D) => ({})), resize: jest.fn(), invalidateAsset: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}), { virtual: true });
jest.mock("@nodetool-ai/game-renderer/audio", () => ({ gameAudioSpatialView2D: jest.fn(() => ({})), gameAudioSpatialView3D: jest.fn(() => ({})),
  GameAudioPlayer: jest.fn().mockImplementation(() => ({ updateScenes: jest.fn(), updateAssets: jest.fn(), updateMixer: jest.fn(), preload: jest.fn(), sync: jest.fn(), resume: jest.fn(), pause: jest.fn(),
    reset: jest.fn(), handle: jest.fn(), updateSpatial: jest.fn(), dispose: jest.fn() }))
}));
jest.mock("../../../utils/resolveMediaUri", () => ({
  ...jest.requireActual<typeof import("../../../utils/resolveMediaUri")>("../../../utils/resolveMediaUri"), resolveMediaUri: jest.fn()
}));

const colliderBytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }));
const mockAssetBytes = new Map<string, Uint8Array>();
const installedId = "b".repeat(32);
function fixture(): GameDocument3D {
  return gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "hook3d", revision: "saved", entrySceneId: "level",
    tickRate: 60, inputActions: [], presentation: { aspectRatio: 16 / 9, hudWidth: 960, hudHeight: 540 },
    assets: { ground: { mediaKind: "collider", assetId: installedId, digest: createHash("sha256").update(colliderBytes).digest("hex"), required: true,
      shape: "triangleMesh", preparationVersion: "1", vertices: 4, triangles: 4, bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } },
    scenes: ["level", "alternate"].map((id) => ({ id, name: id, activeCameraId: "camera", entities: [
      { id: "camera", transform3d: {}, camera3d: { projection: { kind: "perspective" } } },
      { id: "floor", transform3d: {}, body3d: { type: "static" }, collider3d: { kind: "triangleMesh", assetId: "ground" } }
    ] })) });
}

function Harness({ document, sceneId = "level" }: { document: GameDocument3D; sceneId?: string }) {
  const session = useGamePlaySession3D({ refId: "hook3d", document, active: true, editorSceneId: sceneId });
  useGameConsoleFeed("hot-reload-3d", { runtimeError: session.error, scriptError: null, diagnosticError: null,
    tick: session.inspection?.tick ?? 0, scriptLogs: session.scriptLogs });
  return <>
    <button onClick={session.restart}>Restart</button>
    <canvas ref={session.canvasRef} tabIndex={0} />
    <button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button>
    <button onClick={session.stop}>Stop</button>
    <button onClick={() => session.step()}>Step</button>
    <button onClick={() => {
      const clock = new FixedTickClock(60);
      clock.advance(0, () => undefined);
      clock.advance(40, () => session.step({ pressed: [], justPressed: [], axes: { invalid: 1 }, look: { x: 0, y: 0 } }));
    }}>Fail fixed-clock burst</button>
    <button onClick={session.save}>Save</button>
    <button onClick={() => void session.load()}>Restore</button>
    <button onClick={() => void session.replayBeforeError()}>Replay failure</button>
    <button onClick={() => session.step({ pressed: [], justPressed: [], axes: { moveX: 2 }, look: { x: 0, y: 0 } })}>Fail tick</button>
    <output data-testid="backend">{session.backend}</output>
    <output data-testid="scene">{session.inspection?.sceneId}</output>
    <output data-testid="tick">{session.inspection?.tick}</output>
    <output data-testid="frame-tick">{session.frame?.tick}</output>
    <output data-testid="error">{session.error}</output>
  </>;
}

// Await the real WASM cold start outside the hook polling assertion.
beforeAll(async () => {
  const session = await createGameSession3D(fixture(), 1, undefined, {
    resolveCollider: async (binding) => decodePreparedGameCollider3D(colliderBytes, binding)
  });
  session.dispose();
});

const originalFetch = global.fetch;
const originalClone = global.structuredClone;
beforeEach(() => {
  mockRenderers.length = 0;
  mockAssetBytes.clear();
  localStorage.clear();
  // The shared Jest JSON clone cannot restore optional snapshot fields.
  global.structuredClone = (value) => deserialize(serialize(value));
  jest.mocked(resolveMediaUri).mockResolvedValue(asResolvedMediaUrl("https://owned.example/ground.json") ?? "");
  global.fetch = jest.fn(async (url) => {
    const bytes = mockAssetBytes.get(String(url)) ?? colliderBytes;
    if ("Response" in globalThis) { return new Response(bytes.slice()); }
    return { ok: true, arrayBuffer: async () => bytes.slice().buffer } as Response;
  });
});
afterEach(() => { global.fetch = originalFetch; global.structuredClone = originalClone; jest.clearAllMocks(); });

it("loads installed collider bytes after the runtime parses and clones document bindings", async () => {
  const document = fixture();
  const view = render(<Harness document={document} />);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  expect(screen.getByTestId("scene")).toHaveTextContent("level");
  expect(resolveMediaUri).toHaveBeenCalledWith(`asset://${installedId}`);
  expect(fetch).toHaveBeenCalledWith("https://owned.example/ground.json", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  expect(fetch).toHaveBeenCalledTimes(1);
  view.unmount();
});

it("passes owned image bytes and bindings to the renderer and rejects non-image slots", async () => {
  const document = fixture();
  const imageBytes = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWP4v5ThPzJmIF0AAKAXKjHRs1nSAAAAAElFTkSuQmCC", "base64"));
  const imageUrl = asResolvedMediaUrl("https://owned.example/paint.png");
  if (!imageUrl) { throw new Error("Invalid fixture URL"); }
  mockAssetBytes.set(imageUrl, imageBytes);
  jest.mocked(resolveMediaUri).mockImplementation(async (locator) => locator === `asset://${"c".repeat(32)}`
    ? imageUrl : asResolvedMediaUrl("https://owned.example/ground.json") ?? "");
  document.assets.paint = { mediaKind: "image", assetId: "c".repeat(32), required: true,
    digest: createHash("sha256").update(imageBytes).digest("hex"), format: "png", width: 4, height: 4,
    byteLength: imageBytes.length, preparationVersion: "1" };
  const view = render(<Harness document={document} />);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  const options = jest.mocked(createGameRenderer3D).mock.calls[0]?.[0];
  if (!options?.resolveImage) { throw new Error("Missing image resolver"); }
  const controller = new AbortController();
  expect(await options.resolveImage("paint", controller.signal)).toEqual({ bytes: imageBytes, binding: document.assets.paint });
  expect(resolveMediaUri).toHaveBeenCalledWith(`asset://${"c".repeat(32)}`);
  expect(await options.resolveImage("ground", controller.signal)).toBeNull();
  expect(await options.resolveImage("constructor", controller.signal)).toBeNull();
  view.unmount();
});

it("pins a retained definition and its collider binding until play restarts", async () => {
  const baseline = fixture();
  const document: GameDocument3D = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
    program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
    overrides: [], detached: [], suppressions: [] }) };
  const view = render(<Harness document={document} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Pause" }));
  const calls = jest.mocked(resolveMediaUri).mock.calls.length;
  const replacementId = "c".repeat(32);
  const changed = { ...document, assets: { ...document.assets, ground: { ...document.assets.ground, assetId: replacementId } } };
  view.rerender(<Harness document={changed} />);
  await user.click(screen.getByRole("button", { name: "Step" }));
  expect(mockRenderers).toHaveLength(1);
  expect(jest.mocked(resolveMediaUri).mock.calls).toHaveLength(calls);
  expect(resolveMediaUri).not.toHaveBeenCalledWith(`asset://${replacementId}`);
  await user.click(screen.getByRole("button", { name: "Stop" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  expect(resolveMediaUri).toHaveBeenCalledWith(`asset://${replacementId}`);
  view.unmount();
});

it.each([false, true])("retains the immutable play session when the editor scene changes, running=%s", async (running) => {
  const document = fixture();
  const view = render(<Harness document={document} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Play" }));
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  if (!running) { await user.click(screen.getByRole("button", { name: "Pause" })); }
  for (let index = 0; index < 6; index++) { await user.click(screen.getByRole("button", { name: "Step" })); }
  const previousTick = Number(screen.getByTestId("tick").textContent);
  expect(previousTick).toBeGreaterThan(0);
  const activeRenderer = mockRenderers[0];
  view.rerender(<Harness document={document} sceneId="alternate" />);
  expect(screen.getByTestId("scene")).toHaveTextContent("level");
  expect(Number(screen.getByTestId("tick").textContent)).toBeGreaterThanOrEqual(previousTick);
  expect(mockRenderers).toHaveLength(1);
  expect(activeRenderer.dispose).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: running ? "Pause" : "Play" })).toBeInTheDocument();
  view.unmount();
});

it("keeps the restored committed frame when the following tick fails", async () => {
  const view = render(<Harness document={fixture()} />);
  const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  await user.click(screen.getByRole("button", { name: "Step" }));
  await user.click(screen.getByRole("button", { name: "Step" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Step" }));
  expect(screen.getByTestId("frame-tick")).toHaveTextContent("3");
  await user.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.getByTestId("frame-tick")).toHaveTextContent("2"));
  await user.click(screen.getByRole("button", { name: "Fail tick" }));
  expect(screen.getByTestId("error")).not.toBeEmptyDOMElement();
  expect(screen.getByTestId("tick")).toHaveTextContent("2");
  expect(screen.getByTestId("frame-tick")).toHaveTextContent("2");
  view.unmount();
});

it("completes ten distinct preview edits without losing renderer readiness", async () => {
  const document = fixture();
  const backends: string[] = [];
  const onRender = (): void => { backends.push(screen.getByTestId("backend").textContent ?? ""); };
  const view = render(<Profiler id="preview3d" onRender={onRender}><Harness document={document} /></Profiler>);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  const renderer = mockRenderers[0];
  backends.length = 0;
  for (let index = 1; index <= 10; index++) {
    const x = index;
    const edited = { ...document, scenes: document.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => entity.id === "floor"
        ? { ...entity, transform3d: { ...entity.transform3d, position: { ...entity.transform3d.position, x } } } : entity) })) };
    renderer.render.mockClear();
    view.rerender(<Profiler id="preview3d" onRender={onRender}><Harness document={edited} /></Profiler>);
    await waitFor(() => expect(renderer.render.mock.calls.some(([frame]: [GameRenderFrame3D]) =>
      frame.entities.some((entity) => entity.entityId === "floor" && entity.transform.position.x === x))).toBe(true));
    expect(renderer.render.mock.calls.every(([frame]: [GameRenderFrame3D]) =>
      frame.entities.some((entity) => entity.entityId === "floor" && entity.transform.position.x === x))).toBe(true);
    expect(mockRenderers).toEqual([renderer]);
    expect(renderer.dispose).not.toHaveBeenCalled();
    expect(backends.length).toBeGreaterThan(0);
    expect(backends.every((backend) => backend === "WebGL2")).toBe(true);
  }
  console.info("K2 preview readiness", JSON.stringify({ dimension: "3d", editCount: 10, backends }));
  view.unmount();
  await waitFor(() => expect(renderer.dispose).toHaveBeenCalledTimes(1));
});

it("initializes after StrictMode replays mount effects", async () => {
  const view = render(<StrictMode><Harness document={fixture()} /></StrictMode>);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  view.unmount();
});

it("discards keys and mouse look collected while paused before resuming", () => {
  const document = fixture();
  const { result } = renderHook(() => useGamePlaySession3D({ refId: "paused", document, active: true }));
  act(() => result.current.beginPlay());
  act(() => result.current.beginPlay());
  result.current.inputRef.current.keyDown("KeyW");
  result.current.inputRef.current.look(12, 8);
  act(() => result.current.beginPlay());
  const input = result.current.inputRef.current.sample(document);
  expect(Object.values(input.axes).every((value) => value === 0)).toBe(true);
  expect(input.justPressed).toEqual([]);
  expect(input.look).toEqual({ x: 0, y: 0 });
});

it("reports storage failures and clears them after a successful save (F29)", async () => {
  const view = render(<Harness document={fixture()} />);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
  const user = userEvent.setup();
  const write = jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("Storage quota exceeded"); });
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByTestId("error")).toHaveTextContent("Storage quota exceeded");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  write.mockRestore();
  const read = jest.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => { throw new Error("Storage access denied"); });
  await user.click(screen.getByRole("button", { name: "Restore" }));
  expect(screen.getByTestId("error")).toHaveTextContent("Storage access denied");
  read.mockRestore();
  view.unmount();
});

it("moves spatial audio to every displayed frame", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const view = render(<Harness document={fixture()} />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
    const audio = (GameAudioPlayer as unknown as jest.Mock).mock.results.at(-1)?.value as { updateSpatial: jest.Mock };
    const spatialView = jest.mocked(gameAudioSpatialView3D);
    spatialView.mockClear();
    audio.updateSpatial.mockClear();
    const renders = mockRenderers[0].render.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(mockRenderers[0].render.mock.calls.length).toBeGreaterThan(renders));
    const [frame, alpha] = mockRenderers[0].render.mock.calls.at(-1) ?? [];
    expect(spatialView).toHaveBeenCalledWith(frame, alpha);
    expect(audio.updateSpatial).toHaveBeenCalledWith(spatialView.mock.results.at(-1)?.value);
  } finally {
    view.unmount(); animation.mockRestore();
  }
});

it("publishes Play updates only at crossed HUD tick boundaries", async () => {
  const user = userEvent.setup();
  mockRenderers.length = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextRequest = 0;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextRequest; callbacks.set(id, callback); return id;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { callbacks.delete(id); });
  const commits: string[] = [];
  const view = render(<Profiler id="hook-cadence" onRender={() => {
    commits.push(screen.getByTestId("tick").textContent ?? "");
  }}><Harness document={fixture()} /></Profiler>);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
    const renderer = mockRenderers[0];
    renderer.render.mockClear();
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(renderer.render).toHaveBeenCalled());
    let now = 0;
    const advance = async (): Promise<void> => {
      const pending = [...callbacks.values()]; callbacks.clear();
      await act(async () => { for (const callback of pending) { callback(now); } });
      now += 1000 / 120;
    };
    await advance();
    commits.length = 0;
    renderer.render.mockClear();
    let previousTick = 0;
    for (let callback = 0; callback < 130 && previousTick < 60; callback++) {
      const before = commits.length;
      await advance();
      const frame: GameRenderFrame3D | undefined = renderer.render.mock.calls.at(-1)?.[0];
      const tick = frame?.tick ?? previousTick;
      expect(tick - previousTick).toBeLessThanOrEqual(1);
      const boundary = Math.floor(tick / 6) - Math.floor(previousTick / 6);
      expect(commits.length - before).toBe(boundary);
      if (boundary) { expect(screen.getByTestId("tick").textContent).toBe(String(tick)); }
      previousTick = tick;
    }
    expect(previousTick).toBe(60);
    expect(renderer.render.mock.calls.length).toBeGreaterThanOrEqual(60);
    expect(commits).toEqual(Array.from({ length: 10 }, (_, index) => String((index + 1) * 6)));
    for (let callback = 0; callback < 10 && previousTick < 63; callback++) {
      await advance();
      previousTick = renderer.render.mock.calls.at(-1)?.[0].tick ?? previousTick;
    }
    expect(previousTick).toBe(63);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByTestId("tick").textContent).toBe("63");
    expect(screen.getByTestId("frame-tick").textContent).toBe("63");
    console.info("K2 hook cadence", JSON.stringify({ dimension: "3d", ticks: previousTick, clockAdvanceMs: now, renderCalls: renderer.render.mock.calls.length, commits }));
  } finally {
    view.unmount(); request.mockRestore(); cancel.mockRestore();
  }
});


it.each(["Restore", "Replay failure", "Restart"])("preserves the first 3D failure in a burst and allows %s recovery", async (recovery) => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const view = render(<Harness document={fixture()} />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
    const renders = mockRenderers[0].render.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(mockRenderers[0].render.mock.calls.length).toBeGreaterThan(renders));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Fail fixed-clock burst" }));
    expect(screen.getByTestId("error")).toHaveTextContent("Unknown 3D input");
    expect(screen.getByTestId("error")).not.toHaveTextContent("stopped after a failed step");
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    if (recovery === "Restart") {
      await user.click(screen.getByRole("button", { name: "Stop" }));
      await user.click(screen.getByRole("button", { name: "Play" }));
      await user.click(screen.getByRole("button", { name: "Pause" }));
    } else { await user.click(screen.getByRole("button", { name: recovery })); }
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByTestId("tick").textContent).toBe("1");
  } finally { view.unmount(); animation.mockRestore(); }
});

it("delivers edited scenes to the retained 3D audio player", async () => {
  const document = fixture();
  const initialCalls = jest.mocked(GameAudioPlayer).mock.calls.length;
  const view = render(<Harness document={document} />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
    const audio = jest.mocked(GameAudioPlayer).mock.results[initialCalls].value;
    expect(audio.updateScenes).toHaveBeenCalledWith(document.scenes);
    const edited = { ...document, assets: { ...document.assets, music: { mediaKind: "audio" as const, assetId: "a".repeat(32), digest: "music", required: false } },
      scenes: document.scenes.map(scene => ({ ...scene, music: { assetId: "music", volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 } })) };
    view.rerender(<Harness document={edited} />);
    await waitFor(() => expect(audio.updateScenes).toHaveBeenLastCalledWith(edited.scenes));
    expect(jest.mocked(GameAudioPlayer).mock.calls).toHaveLength(initialCalls + 1);
  } finally { view.unmount(); }
});

function hotReloadFixture3D(source: string): GameDocument3D {
  const base = fixture();
  return gameDocument3D.parse({ ...base, scenes: base.scenes.map((scene) => ({ ...scene, entities: scene.entities.map((entity) =>
    entity.id === "floor" ? { ...entity, behaviors: [{ kind: "script", source, maxTickMs: 20 }] } : entity) })) });
}

it("hot reloads 3D source without recreating play, logs invalid edits, and restarts from the latest draft", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const source = (speed: number) => `(input) => ({ state: (input.state ?? 0) + 1, commands: [{ kind: "log", message: "speed ${speed} state " + (input.state ?? 0) }] })`;
  const actual = jest.requireActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  const store = getGameConsoleStore("hot-reload-3d");
  store.getState().clear();
  jest.mocked(createGameSession3D).mockImplementation(async (candidate, seed, snapshot, options) => {
    const silent = { ...candidate, scenes: candidate.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => ({ ...entity, behaviors: entity.behaviors.filter((behavior) => behavior.kind !== "script") })) })) };
    let session = await actual.createGameSession3D(silent, seed, undefined, options);
    if (snapshot) {
      expect(snapshot.gameRevision).toBe(candidate.revision);
      expect(snapshot.contentDigest).toBe(createHash("sha256").update(candidate.revision).digest("hex"));
      // The mocked compiler removes script behaviors. Its backing physics session needs that fixture's digest.
      const backingSnapshot = { ...snapshot, contentDigest: session.snapshot().contentDigest };
      session.dispose();
      session = await actual.createGameSession3D(silent, seed, backingSnapshot, options);
    }
    let effective = candidate;
    let count = snapshot?.tick ?? 0;
    return { ...session, snapshot: () => ({ ...session.snapshot(), gameRevision: effective.revision,
      contentDigest: createHash("sha256").update(effective.revision).digest("hex") }), reloadScripts: jest.fn(async (edited) => {
      const code = edited.scenes[0].entities.find((entity) => entity.id === "floor")?.behaviors[0];
      if (code?.kind === "script" && code.source === "(input) => {") { return { ok: false as const, error: "Game script compilation failed" }; }
      effective = { ...edited, revision: `script:test-speed-${code?.kind === "script" ? code.source.match(/speed (\d+)/)?.[1] : "unknown"}` };
      return { ok: true as const, changed: true, document: effective };
    }), step: (input) => {
      const result = session.step(input);
      const code = effective.scenes[0].entities.find((entity) => entity.id === "floor")?.behaviors[0];
      const speed = code?.kind === "script" ? code.source.match(/speed (\d+)/)?.[1] : undefined;
      return { ...result, scriptLogs: [{ level: "log" as const, message: `speed ${speed} state ${count++}`, tick: result.tick }] };
    } };
  });
  const view = render(<Harness document={hotReloadFixture3D(source(1))} />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("WebGL2"));
    const previewCreations = jest.mocked(createGameSession3D).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(jest.mocked(createGameSession3D)).toHaveBeenCalledTimes(previewCreations + 1));
    await user.click(screen.getByRole("button", { name: "Step" }));
    const creations = jest.mocked(createGameSession3D).mock.calls.length;
    view.rerender(<Harness document={hotReloadFixture3D(source(4))} />);
    await waitFor(() => expect(jest.mocked(createGameSession3D).mock.results.at(-1)).toBeDefined());
    await act(async () => { await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByTestId("tick")).toHaveTextContent("2");
    expect(store.getState().groups.at(-1)?.message).toBe("speed 4 state 1");
    expect(jest.mocked(createGameSession3D)).toHaveBeenCalledTimes(creations);
    await user.click(screen.getByRole("button", { name: "Play" }));
    view.rerender(<Harness document={hotReloadFixture3D("(input) => {")} />);
    await waitFor(() => expect(store.getState().groups.some((entry) => entry.level === "error")).toBe(true));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 4 state 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    view.rerender(<Harness document={hotReloadFixture3D(source(4))} />);
    await user.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(screen.getByTestId("tick")).toHaveTextContent("0"));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.getByTestId("tick")).toHaveTextContent("3"));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 4 state 3");
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[0].scenes[0].entities.find((entity) => entity.id === "floor")?.behaviors[0]).toMatchObject({ source: source(4) });
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[0].revision).toBe("script:test-speed-4");
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[0].revision).not.toBe(fixture().revision);
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[2]?.gameRevision).toBe("script:test-speed-4");
    await user.click(screen.getByRole("button", { name: "Replay failure" }));
    await act(async () => { await jest.mocked(createGameSession3D).mock.results.at(-1)?.value; });
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[0].revision).toBe("script:test-speed-4");
    expect(jest.mocked(createGameSession3D).mock.calls.at(-1)?.[2]?.gameRevision).toBe("script:test-speed-4");
    view.rerender(<Harness document={hotReloadFixture3D(source(8))} />);
    await act(async () => { await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(screen.getByTestId("tick")).toHaveTextContent("0"));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 8 state 0");
  } finally { view.unmount(); animation.mockRestore(); jest.mocked(createGameSession3D).mockImplementation(actual.createGameSession3D); }
});
