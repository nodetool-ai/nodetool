import { Profiler, StrictMode } from "react";
import { createHash } from "node:crypto";
import { deserialize, serialize } from "node:v8";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { gameAuthoring, gameDocument3D, type GameDocument3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, decodePreparedGameCollider3D } from "@nodetool-ai/game-runtime";
import { useGamePlaySession3D } from "../useGamePlaySession3D";
import { FixedTickClock } from "@nodetool-ai/game-renderer";
import { asResolvedMediaUrl, resolveMediaUri } from "../../../utils/resolveMediaUri";

const mockRenderers: { render: jest.Mock; dispose: jest.Mock }[] = [];

jest.mock("@nodetool-ai/game-renderer/browser3d", () => ({
  createGameRenderer3D: jest.fn(async () => {
    const renderer = { render: jest.fn(async (_frame: GameRenderFrame3D) => ({})), resize: jest.fn(), invalidateAsset: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}), { virtual: true });
jest.mock("@nodetool-ai/game-renderer/audio", () => ({
  GameAudioPlayer: jest.fn().mockImplementation(() => ({ updateAssets: jest.fn(), preload: jest.fn(), sync: jest.fn(), resume: jest.fn(), pause: jest.fn(),
    reset: jest.fn(), handle: jest.fn(), dispose: jest.fn() }))
}));
jest.mock("../../../utils/resolveMediaUri", () => ({
  ...jest.requireActual<typeof import("../../../utils/resolveMediaUri")>("../../../utils/resolveMediaUri"), resolveMediaUri: jest.fn()
}));

const colliderBytes = new TextEncoder().encode(JSON.stringify({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] }));
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
  return <>
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
  localStorage.clear();
  // The shared Jest JSON clone cannot restore optional snapshot fields.
  global.structuredClone = (value) => deserialize(serialize(value));
  jest.mocked(resolveMediaUri).mockResolvedValue(asResolvedMediaUrl("https://owned.example/ground.json") ?? "");
  global.fetch = jest.fn(async () => {
    if ("Response" in globalThis) { return new Response(colliderBytes.slice()); }
    return { ok: true, arrayBuffer: async () => colliderBytes.slice().buffer } as Response;
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
