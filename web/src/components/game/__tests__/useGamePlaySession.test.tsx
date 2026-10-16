import { Profiler } from "react";
import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTopDownRoomGame, createScriptedGameSession, withGameScriptLogs, type GameSession } from "@nodetool-ai/game-runtime";
import { useGamePlaySession } from "../useGamePlaySession";
import { useGameConsoleFeed } from "../panels/console/useGameConsoleFeed";
import { getGameConsoleStore } from "../../../stores/game/GameConsoleStore";
import { gameAuthoring, gameAssetBinding, gameDocument, type GameDocument } from "@nodetool-ai/protocol";
import { loadBrowserGameFonts } from "@nodetool-ai/game-renderer/browser";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";
import { FixedTickClock } from "@nodetool-ai/game-renderer";

const mockRenderers: Array<{ assets: (slot: string) => Promise<HTMLImageElement | null>; invalidateAsset: jest.Mock; render: jest.Mock }> = [];

jest.mock("@nodetool-ai/game-runtime", () => {
  const runtime = jest.requireActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  return { ...runtime, createScriptedGameSession: jest.fn(runtime.createScriptedGameSession) };
});

jest.mock("../../../utils/resolveMediaUri", () => ({ resolveMediaUri: jest.fn(async () => null) }));

const mockAudioInstances: Array<{
  pause: jest.Mock;
  resume: jest.Mock;
  sync: jest.Mock;
  reset: jest.Mock;
  preload: jest.Mock;
  updateScenes: jest.Mock;
  dispose: jest.Mock;
}> = [];

jest.mock("@nodetool-ai/game-renderer/audio", () => ({ gameAudioSpatialView2D: jest.fn(() => ({})), gameAudioSpatialView3D: jest.fn(() => ({})),
  GameAudioPlayer: jest.fn().mockImplementation(() => {
    const audio = { reset: jest.fn(), pause: jest.fn(), resume: jest.fn(), sync: jest.fn(), updateScenes: jest.fn(), updateAssets: jest.fn(), updateMixer: jest.fn(), preload: jest.fn(), updateSpatial: jest.fn(), dispose: jest.fn() };
    mockAudioInstances.push(audio);
    return audio;
  })
}));

jest.mock("@nodetool-ai/game-renderer/browser", () => ({
  loadBrowserGameFonts: jest.fn(async () => ({ diagnostics: [], dispose: jest.fn() })),
  createGameRenderer: jest.fn(async ({ canvas, assets }: { canvas: HTMLCanvasElement; assets: (slot: string) => Promise<HTMLImageElement | null> }) => {
    const renderer = { canvas, assets, invalidateAsset: jest.fn(), backend: "canvas2d", capabilities: { gpuEffects: false },
      resize: jest.fn(), render: jest.fn(async (_frame: GameRenderFrame) => {}), setEffects: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}));

const document = createTopDownRoomGame("audio-edit-mode");
const multiSceneDocument = { ...document, scenes: [...document.scenes,
  { ...document.scenes[0], id: "alternate-scene", name: "Alternate" }] };

function GameHarness({ gameDocument = document }: { gameDocument?: GameDocument }) {
  const session = useGamePlaySession({ refId: "audio-edit-mode", active: true, document: gameDocument });
  return <><canvas ref={session.canvasRef} /><button onClick={session.beginPlay}>Play</button><button onClick={session.stop}>Stop</button>
    <button onClick={() => session.step()}>Step</button><output aria-label="Session error">{session.error}</output>
    <output data-testid="backend">{session.backend}</output><output data-testid="tick">{session.playState.tick}</output></>;
}

it("publishes the last successful presentation when a script failure pauses play", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const candidate = await createScriptedGameSession(document, 1);
  const frame = candidate.frame.bind(candidate);
  let failed = false;
  jest.spyOn(candidate, "step").mockImplementation(() => { failed = true; throw new Error("Game script pause failure"); });
  jest.spyOn(candidate, "frame").mockImplementation(() => {
    if (failed) { throw new Error("Game session stopped after a failed step"); }
    return frame();
  });
  const view = render(<GameHarness />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
    jest.mocked(createScriptedGameSession).mockResolvedValueOnce(candidate);
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Session error")).toHaveTextContent("pause failure");
    expect(screen.getByTestId("tick").textContent).toBe("0");
  } finally { view.unmount(); animation.mockRestore(); }
});

function ConsoleFailureHarness({ gameDocument }: { gameDocument: GameDocument }) {
  const session = useGamePlaySession({ refId: "log-before-failure", active: true, document: gameDocument });
  useGameConsoleFeed("log-before-failure", { runtimeError: session.error, scriptError: session.scriptError, diagnosticError: null,
    tick: session.playState.tick, scriptLogs: session.scriptLogs });
  return <><canvas ref={session.canvasRef} /><button onClick={session.beginPlay}>Play</button><button onClick={() => session.step()}>Step</button>
    <output data-testid="backend">{session.backend}</output></>;
}

it("writes the lines a script logged before failing to the console ahead of the failure", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const candidate = await createScriptedGameSession(document, 1);
  const failure = withGameScriptLogs(new Error(`Game script ${JSON.stringify([document.entrySceneId, "logger", 0])} for logger at tick 0 failed: bad command`),
    [{ tick: 0, entityId: "logger", level: "log", message: "about to fail" }]);
  jest.spyOn(candidate, "step").mockImplementation(() => { throw failure; });
  const view = render(<ConsoleFailureHarness gameDocument={document} />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
    jest.mocked(createScriptedGameSession).mockResolvedValueOnce(candidate);
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    await waitFor(() => expect(getGameConsoleStore("log-before-failure").getState().groups).toHaveLength(2));
    const [log, error] = getGameConsoleStore("log-before-failure").getState().groups;
    expect(log).toMatchObject({ level: "log", source: "script", message: "about to fail", tick: 0, entityId: "logger" });
    expect(error).toMatchObject({ level: "error", source: "script", message: (failure as Error).message, entityId: "logger" });
  } finally { view.unmount(); animation.mockRestore(); }
});

function ExplicitFailureReplayHarness() {
  const session = useGamePlaySession({ refId: "explicit-failure-replay", active: true, document });
  return <>
    <canvas ref={session.canvasRef} />
    <button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button>
    <button onClick={() => session.step()}>Step</button>
    <button onClick={() => void session.replayBeforeError({ message: "Independent diagnostic failed", entityId: "player", tick: 2 })}>Replay diagnostic error</button>
    <output aria-label="Replay tick">{session.playState.tick}</output>
    <output aria-label="Host failure">{session.scriptError?.message ?? "none"}</output>
  </>;
}

function FailureBurstHarness() {
  const session = useGamePlaySession({ refId: "first-script-error", active: true, document });
  return <>
    <canvas ref={session.canvasRef} />
    <button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button>
    <button onClick={session.stop}>Stop</button>
    <button onClick={session.save}>Save</button>
    <button onClick={() => void session.load()}>Restore</button>
    <button onClick={() => void session.replayBeforeError()}>Replay failure</button>
    <button onClick={() => session.step()}>Step</button>
    <button onClick={() => {
      const clock = new FixedTickClock(60);
      clock.advance(0, () => undefined);
      clock.advance(40, () => session.step());
    }}>Fail fixed-clock burst</button>
    <output aria-label="Backend">{session.backend}</output>
    <output aria-label="Tick">{session.playState.tick}</output>
    <output aria-label="Session error">{session.error}</output>
    <output aria-label="Script error">{session.scriptError?.message}</output>
  </>;
}

it.each(["Restore", "Replay failure", "Restart"])("preserves the first 2D script error in a burst and allows %s recovery", async (recovery) => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const candidate = await createScriptedGameSession(document, 1);
  const frame = candidate.frame.bind(candidate);
  let failed = false;
  const step = jest.spyOn(candidate, "step").mockImplementation(() => {
    if (failed) { throw new Error("Game session stopped after a failed step"); }
    failed = true;
    throw new Error("Game script original failure");
  });
  jest.spyOn(candidate, "frame").mockImplementation(() => {
    if (failed) { throw new Error("Game session stopped after a failed step"); }
    return frame();
  });
  const view = render(<FailureBurstHarness />);
  try {
    await waitFor(() => expect(screen.getByLabelText("Backend")).toHaveTextContent("Canvas 2D"));
    jest.mocked(createScriptedGameSession).mockResolvedValueOnce(candidate);
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Fail fixed-clock burst" }));
    expect(screen.getByLabelText("Session error")).toHaveTextContent("Game script original failure");
    expect(screen.getByLabelText("Script error")).toHaveTextContent("Game script original failure");
    expect(step).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    if (recovery === "Restart") {
      await user.click(screen.getByRole("button", { name: "Stop" }));
      await user.click(screen.getByRole("button", { name: "Play" }));
      await user.click(screen.getByRole("button", { name: "Pause" }));
    } else { await user.click(screen.getByRole("button", { name: recovery })); }
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Tick").textContent).toBe("1");
  } finally { view.unmount(); animation.mockRestore(); localStorage.removeItem("nodetool.game.save.first-script-error"); }
});

it("replays active ring history for an explicit diagnostic failure while private host error remains null", async () => {
  const user = userEvent.setup();
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  try {
    render(<ExplicitFailureReplayHarness />);
    await waitFor(() => expect(mockAudioInstances.at(-1)?.reset).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Replay tick")).toHaveTextContent("2");
    expect(screen.getByLabelText("Host failure")).toHaveTextContent("none");
    await user.click(screen.getByRole("button", { name: "Replay diagnostic error" }));
    await waitFor(() => expect(screen.getByLabelText("Replay tick")).toHaveTextContent("1"));
    expect(screen.getByLabelText("Host failure")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  } finally { animation.mockRestore(); }
});

it.each(["step failure", "unmount"])("disposes an uncommitted replay after %s", async (boundary) => {
  const user = userEvent.setup();
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const candidate = await createScriptedGameSession(document, 1);
  const dispose = jest.spyOn(candidate, "dispose");
  const view = render(<ExplicitFailureReplayHarness />);
  try {
    await waitFor(() => expect(mockAudioInstances.at(-1)?.reset).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Replay tick").textContent).toBe("2");
    if (boundary === "step failure") {
      jest.spyOn(candidate, "step").mockImplementation(() => { throw new Error("Game script failed during replay"); });
      jest.mocked(createScriptedGameSession).mockResolvedValueOnce(candidate);
      await user.click(screen.getByRole("button", { name: "Replay diagnostic error" }));
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Replay tick").textContent).toBe("2");
    } else {
      let resolveReplay: ((session: GameSession) => void) | undefined;
      jest.mocked(createScriptedGameSession).mockImplementationOnce(() => new Promise((resolve) => { resolveReplay = resolve; }));
      await user.click(screen.getByRole("button", { name: "Replay diagnostic error" }));
      view.unmount();
      await act(async () => { resolveReplay?.(candidate); });
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  } finally {
    view.unmount();
    if (dispose.mock.calls.length === 0) { candidate.dispose(); }
    animation.mockRestore();
  }
});

describe("game editor audio", () => {
  beforeEach(() => { mockAudioInstances.length = 0; mockRenderers.length = 0; jest.mocked(resolveMediaUri).mockClear(); });

  it.each([false, true])("pins asset bindings only for retained construction, retained=%s", async (retained) => {
    const assetId = "a".repeat(32);
    const replacementId = "b".repeat(32);
    const initial: GameDocument = { ...document, assets: { ...document.assets,
      proof: gameAssetBinding.parse({ mediaKind: "image", assetId, digest: "c".repeat(64), width: 1, height: 1 }) } };
    if (retained) {
      initial.authoring = gameAuthoring.parse({ version: 1, program: { source: "return inputs.document", inputs: {}, seed: 1 },
        baseline: document, overrides: [], suppressions: [], detached: [] });
    }
    const view = render(<GameHarness gameDocument={initial} />);
    await waitFor(() => expect(mockRenderers).toHaveLength(1));
    act(() => view.getByRole("button", { name: "Play" }).click());
    await waitFor(() => expect(mockRenderers).toHaveLength(1));
    const renderer = mockRenderers[0];
    const changed = { ...initial, assets: { ...initial.assets, proof: { ...initial.assets.proof, assetId: replacementId } } };
    view.rerender(<GameHarness gameDocument={changed} />);
    await renderer.assets("proof");
    expect(resolveMediaUri).toHaveBeenLastCalledWith(`asset://${retained ? assetId : replacementId}`);
    expect(mockRenderers).toHaveLength(1);
    if (retained) expect(renderer.invalidateAsset).not.toHaveBeenCalled();
    else expect(renderer.invalidateAsset).toHaveBeenCalledWith("proof");
    act(() => view.getByRole("button", { name: "Stop" }).click());
    await waitFor(() => expect(mockRenderers).toHaveLength(1));
    act(() => view.getByRole("button", { name: "Play" }).click());
    await waitFor(() => expect(mockRenderers).toHaveLength(1));
    await mockRenderers[0].assets("proof");
    expect(resolveMediaUri).toHaveBeenLastCalledWith(`asset://${replacementId}`);
    view.unmount();
  });

  it("keeps scene music paused in edit mode and starts it on Play", async () => {
    const view = render(<GameHarness />);
    await waitFor(() => expect(mockAudioInstances.length).toBeGreaterThan(0));
    await waitFor(() => expect(mockAudioInstances[0].reset).toHaveBeenCalled());
    expect(mockAudioInstances[0].pause).toHaveBeenCalled();
    expect(mockAudioInstances[0].pause.mock.invocationCallOrder[0]).toBeLessThan(
      mockAudioInstances[0].reset.mock.invocationCallOrder[0]
    );
    expect(mockAudioInstances[0].resume).not.toHaveBeenCalled();

    act(() => { view.getByRole("button", { name: "Play" }).click(); });
    await waitFor(() => expect(mockAudioInstances.some((audio) => audio.resume.mock.calls.length > 0)).toBe(true));

    const playInstanceCount = mockAudioInstances.length;
    act(() => { view.getByRole("button", { name: "Stop" }).click(); });
    expect(mockAudioInstances.length).toBe(playInstanceCount);
    await waitFor(() => expect(mockAudioInstances.at(-1)?.pause).toHaveBeenCalled());
    expect(mockAudioInstances.at(-1)?.pause).toHaveBeenCalled();
    view.unmount();
  });
});

function SceneHarness({ sceneId }: { sceneId: string }) {
  const session = useGamePlaySession({ refId: "scene-preview", active: true, document: multiSceneDocument,
    editorSceneId: sceneId });
  return <><canvas ref={session.canvasRef} /><output data-testid="scene-id">{session.playState.sceneId}</output></>;
}

it("previews the selected scene without changing the document entry scene", async () => {
  const view = render(<SceneHarness sceneId={document.entrySceneId} />);
  await waitFor(() => expect(screen.getByTestId("scene-id")).toHaveTextContent(document.entrySceneId));
  view.rerender(<SceneHarness sceneId="alternate-scene" />);
  await waitFor(() => expect(screen.getByTestId("scene-id")).toHaveTextContent("alternate-scene"));
  expect(multiSceneDocument.entrySceneId).toBe(document.entrySceneId);
  view.unmount();
});

it("resolves shipped package assets directly when playing an example", async () => {
  mockRenderers.length = 0;
  jest.mocked(resolveMediaUri).mockClear();
  const packageUri = "package://nodetool-base/games/kindle/hero.png";
  const gameDocument = { ...document, assets: { ...document.assets, proof: gameAssetBinding.parse({
    mediaKind: "image", assetId: packageUri, digest: "c".repeat(64), width: 1, height: 1
  }) } };
  render(<GameHarness gameDocument={gameDocument} />);
  await waitFor(() => expect(mockRenderers.length).toBeGreaterThan(0));
  await mockRenderers[mockRenderers.length - 1].assets("proof");
  expect(resolveMediaUri).toHaveBeenCalledWith(packageUri);
  const fontResolver = jest.mocked(loadBrowserGameFonts).mock.calls.at(-1)?.[1];
  expect(fontResolver).toBeDefined();
  await fontResolver?.(packageUri);
  expect(resolveMediaUri).toHaveBeenLastCalledWith(packageUri);
});

it("completes ten distinct preview edits without losing renderer readiness", async () => {
  mockRenderers.length = 0;
  mockAudioInstances.length = 0;
  const backends: string[] = [];
  const onRender = (): void => { backends.push(screen.getByTestId("backend").textContent ?? ""); };
  const view = render(<Profiler id="preview" onRender={onRender}><GameHarness /></Profiler>);
  await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
  const renderer = mockRenderers[0];
  backends.length = 0;
  for (let index = 1; index <= 10; index++) {
    const x = index / 10;
    const edited = { ...document, scenes: document.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.map((entity) => entity.id === "player"
        ? { ...entity, transform2d: { ...entity.transform2d, x } } : entity) })) };
    renderer.render.mockClear();
    view.rerender(<Profiler id="preview" onRender={onRender}><GameHarness gameDocument={edited} /></Profiler>);
    await waitFor(() => expect(renderer.render.mock.calls.some(([frame]: [GameRenderFrame]) =>
      frame.sprites.some((sprite) => sprite.entityId === "player" && sprite.x === x))).toBe(true));
    expect(mockRenderers).toEqual([renderer]);
    expect(mockAudioInstances).toHaveLength(1);
    expect(backends.length).toBeGreaterThan(0);
    expect(backends.every((backend) => backend === "Canvas 2D")).toBe(true);
  }
  console.info("K2 preview readiness", JSON.stringify({ dimension: "2d", editCount: 10, backends }));
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
  }}><GameHarness /></Profiler>);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
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
      const frame: GameRenderFrame | undefined = renderer.render.mock.calls.at(-1)?.[0];
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
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByTestId("tick").textContent).toBe("63");
    console.info("K2 hook cadence", JSON.stringify({ dimension: "2d", ticks: previousTick, clockAdvanceMs: now, renderCalls: renderer.render.mock.calls.length, commits }));
  } finally {
    view.unmount(); request.mockRestore(); cancel.mockRestore();
  }
});

const particleBase = createTopDownRoomGame("play-particles");
const particleDocument = gameDocument.parse({ ...particleBase, schemaVersion: 2, scenes: particleBase.scenes.map((scene, index) => index === 0 ? { ...scene, entities: [...scene.entities, {
  id: "torch", transform2d: { x: 1, y: 2 },
  particles: { emitters: [{ id: "burst", loop: false, rate: 0, bursts: [{ count: 6 }], lifetime: 10, speed: 0 }] }
}] } : scene) });

function ParticleHarness() {
  const session = useGamePlaySession({ refId: "play-particles", active: true, document: particleDocument });
  return <><canvas ref={session.canvasRef} />
    <button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button><button onClick={session.stop}>Stop</button>
    <button onClick={() => session.step()}>Step</button><button onClick={session.save}>Save</button>
    <button onClick={() => void session.load()}>Restore</button><output aria-label="Session error">{session.error}</output>
    <output data-testid="backend">{session.backend}</output><output data-testid="tick">{session.playState.tick}</output></>;
}

it("draws 2D particles in the play view and clears them when the session is replaced", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  mockRenderers.length = 0;
  const view = render(<ParticleHarness />);
  const renderedParticles = () => {
    const calls = mockRenderers[0].render.mock.calls as unknown[][];
    const field = calls[calls.length - 1][2] as { count: number } | undefined;
    return field?.count;
  };
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
    expect(screen.getByLabelText("Session error")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(renderedParticles()).toBe(0));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(renderedParticles()).toBe(6);

    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.getByTestId("tick")).toHaveTextContent("0"));
    expect(renderedParticles()).toBe(0);
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(renderedParticles()).toBe(6);

    const rendersBeforeReset = mockRenderers[0].render.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(mockRenderers[0].render.mock.calls.length).toBeGreaterThan(rendersBeforeReset));
    expect(renderedParticles()).toBe(0);
  } finally { view.unmount(); animation.mockRestore(); localStorage.removeItem("nodetool.game.save.play-particles"); }
});


it("performs a session's save requests in scoped localStorage without snapshots and delivers a load on a later frame", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const progressKey = `nodetool.game.saves/${document.id}/progress/main`;
  const settingsKey = `nodetool.game.saves/${document.id}/settings/main`;
  const checkpointKey = `nodetool.game.saves/${document.id}/progress/checkpoint`;
  localStorage.setItem(progressKey, JSON.stringify({ version: 1, data: { best: 7 } }));
  const candidate = await createScriptedGameSession(document, 1);
  const original = candidate.step.bind(candidate);
  // Scripts cannot run under Jest, so the first step reports the requests a script would have issued.
  const step = jest.spyOn(candidate, "step").mockImplementation((frame) => step.mock.calls.length > 1 ? original(frame) : { ...original(frame), saveRequests: [
    { kind: "load", tick: 0, entityId: "player", scope: "progress", slot: "main" },
    { kind: "save", tick: 0, entityId: "player", scope: "settings", slot: "main", data: { volume: 0.3 }, snapshot: false },
    { kind: "save", tick: 0, entityId: "player", scope: "progress", slot: "checkpoint", data: { room: 2 }, snapshot: true }
  ] });
  const view = render(<GameHarness />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
    jest.mocked(createScriptedGameSession).mockResolvedValueOnce(candidate);
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    // The saves run after the load in request order, so the last write means the load has finished.
    await waitFor(() => expect(localStorage.getItem(checkpointKey)).toBe(JSON.stringify({ version: 1, data: { room: 2 } })));
    expect(localStorage.getItem(settingsKey)).toBe(JSON.stringify({ version: 1, data: { volume: 0.3 } }));
    expect(JSON.parse(localStorage.getItem(progressKey) ?? "null")).toEqual({ version: 1, data: { best: 7 } });
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(step.mock.calls.map(([frame]) => frame.loaded)).toEqual([undefined, [{ scope: "progress", slot: "main", data: { best: 7 } }]]);
  } finally { view.unmount(); animation.mockRestore(); localStorage.removeItem(progressKey); localStorage.removeItem(settingsKey); localStorage.removeItem(checkpointKey); }
});

it("delivers edited scene audio settings to the retained audio player", async () => {
  mockAudioInstances.length = 0;
  const view = render(<GameHarness />);
  try {
    await waitFor(() => expect(screen.getByTestId("backend")).toHaveTextContent("Canvas 2D"));
    const audio = mockAudioInstances[0];
    expect(audio.updateScenes).toHaveBeenCalledWith(document.scenes);
    const edited = { ...document, scenes: document.scenes.map(scene => ({ ...scene, music: { assetId: "sfx.collect", volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 } })) };
    view.rerender(<GameHarness gameDocument={edited} />);
    await waitFor(() => expect(audio.updateScenes).toHaveBeenLastCalledWith(edited.scenes));
    expect(mockAudioInstances).toHaveLength(1);
  } finally { view.unmount(); }
});

function hotReloadDocument(source: string): GameDocument {
  return gameDocument.parse({ ...document, scenes: document.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities, { id: "reload-logger", transform2d: { x: 0, y: 0 }, behaviors: [{ kind: "script", source, maxTickMs: 50 }] }
  ] })) });
}

function HotReloadHarness({ gameDocument }: { gameDocument: GameDocument }) {
  const session = useGamePlaySession({ refId: "hot-reload-2d", active: true, document: gameDocument });
  useGameConsoleFeed("hot-reload-2d", { runtimeError: session.error, scriptError: session.scriptError, diagnosticError: null,
    tick: session.playState.tick, scriptLogs: session.scriptLogs });
  return <><canvas ref={session.canvasRef} /><button onClick={session.beginPlay}>{session.playing ? "Pause" : "Play"}</button>
    <button onClick={() => session.step()}>Step</button><button onClick={session.save}>Save</button>
    <button onClick={() => void session.load()}>Load</button><button onClick={session.restart}>Restart</button><button onClick={() => void session.replayBeforeError({ message: "Test diagnostic", tick: 4, entityId: null })}>Replay</button><output aria-label="Reload tick">{session.playState.tick}</output>
    <output aria-label="Reload error">{session.error}</output><output aria-label="Reload backend">{session.backend}</output></>;
}

it("hot reloads source during play, retains state, and keeps the last compiled source after an invalid edit", async () => {
  const animation = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const user = userEvent.setup();
  const source = (speed: number) => `(input) => ({ state: (input.state ?? 0) + 1, commands: [{ kind: "log", message: "speed ${speed} state " + (input.state ?? 0) }] })`;
  const store = getGameConsoleStore("hot-reload-2d");
  store.getState().clear();
  const actual = jest.requireActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  jest.mocked(createScriptedGameSession).mockImplementation(async (candidate, seed, snapshot, runner, options) => {
    const session = await actual.createScriptedGameSession({ ...candidate, scenes: candidate.scenes.map((scene) => ({ ...scene,
      entities: scene.entities.filter((entity) => entity.id !== "reload-logger") })) }, seed, snapshot, runner, options);
    let effective = candidate;
    let count = snapshot?.tick ?? 0;
    return { ...session, snapshot: () => ({ ...session.snapshot(), gameRevision: effective.revision }), reloadScripts: jest.fn(async (edited) => {
      const code = edited.scenes[0].entities.find((entity) => entity.id === "reload-logger")?.behaviors[0];
      if (code?.kind === "script" && code.source === "(input) => {") { return { ok: false as const, error: "Game script compilation failed" }; }
      effective = { ...edited, revision: `script:test-speed-${code?.kind === "script" ? code.source.match(/speed (\d+)/)?.[1] : "unknown"}` };
      return { ok: true as const, changed: true, document: effective };
    }), step: (input) => {
      const result = session.step(input);
      const code = effective.scenes[0].entities.find((entity) => entity.id === "reload-logger")?.behaviors[0];
      const speed = code?.kind === "script" ? code.source.match(/speed (\d+)/)?.[1] : undefined;
      return { ...result, scriptLogs: [{ level: "log" as const, message: `speed ${speed} state ${count++}`, tick: result.tick }] };
    } };
  });
  const view = render(<HotReloadHarness gameDocument={hotReloadDocument(source(1))} />);
  try {
    await waitFor(() => expect(screen.getByLabelText("Reload backend")).toHaveTextContent("Canvas 2D"));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    const creations = jest.mocked(createScriptedGameSession).mock.calls.length;
    view.rerender(<HotReloadHarness gameDocument={hotReloadDocument(source(3))} />);
    await act(async () => { await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByLabelText("Reload tick")).toHaveTextContent("2");
    expect(store.getState().groups.at(-1)?.message).toBe("speed 3 state 1");
    expect(jest.mocked(createScriptedGameSession)).toHaveBeenCalledTimes(creations);
    await user.click(screen.getByRole("button", { name: "Play" }));
    view.rerender(<HotReloadHarness gameDocument={hotReloadDocument("(input) => {")} />);
    await waitFor(() => expect(store.getState().groups.some((entry) => entry.level === "error")).toBe(true));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 3 state 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    view.rerender(<HotReloadHarness gameDocument={hotReloadDocument(source(3))} />);
    await user.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(screen.getByLabelText("Reload tick")).toHaveTextContent("0"));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    await user.click(screen.getByRole("button", { name: "Load" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 3 state 3");
    const loaded = jest.mocked(createScriptedGameSession).mock.calls.at(-1)?.[0];
    expect(loaded?.scenes[0].entities.find((entity) => entity.id === "reload-logger")?.behaviors[0]).toMatchObject({ source: source(3) });
    expect(loaded?.revision).toBe("script:test-speed-3");
    expect(loaded?.revision).not.toBe(hotReloadDocument(source(1)).revision);
    expect(jest.mocked(createScriptedGameSession).mock.calls.at(-1)?.[2]?.gameRevision).toBe(loaded?.revision);
    await user.click(screen.getByRole("button", { name: "Replay" }));
    expect(jest.mocked(createScriptedGameSession).mock.calls.at(-1)?.[0].revision).toBe("script:test-speed-3");
    expect(jest.mocked(createScriptedGameSession).mock.calls.at(-1)?.[2]?.gameRevision).toBe("script:test-speed-3");
    const latestCreation = jest.mocked(createScriptedGameSession).mock.results.at(-1);
    if (!latestCreation || latestCreation.type !== "return") { throw new Error("Restored session is unavailable"); }
    const activeSession = await latestCreation.value;
    let pendingSignal: AbortSignal | undefined;
    jest.spyOn(activeSession, "reloadScripts").mockImplementationOnce((_candidate, signal) => new Promise((resolve) => {
      pendingSignal = signal;
      signal?.addEventListener("abort", () => resolve({ ok: false, error: "Canceled compilation" }), { once: true });
    }));
    view.rerender(<HotReloadHarness gameDocument={hotReloadDocument(source(5))} />);
    await act(async () => { await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(pendingSignal?.aborted).toBe(true);
    expect(jest.mocked(createScriptedGameSession).mock.calls.at(-1)?.[0].scenes[0].entities.find((entity) => entity.id === "reload-logger")?.behaviors[0]).toMatchObject({ source: source(3) });
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 5 state 3");
    expect(store.getState().groups.some((entry) => entry.message === "Canceled compilation")).toBe(false);
    view.rerender(<HotReloadHarness gameDocument={hotReloadDocument(source(9))} />);
    await act(async () => { await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(screen.getByLabelText("Reload tick")).toHaveTextContent("0"));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Step" }));
    expect(store.getState().groups.at(-1)?.message).toBe("speed 9 state 0");
  } finally { view.unmount(); animation.mockRestore(); jest.mocked(createScriptedGameSession).mockImplementation(actual.createScriptedGameSession); }
});

it("presents remote tiles and entity lights after editor camera pan without changing the game camera", async () => {
  const base = createTopDownRoomGame("editor-view-pan");
  const game = gameDocument.parse({ ...base, schemaVersion: 2, scenes: [{ ...base.scenes[0],
    lighting: { ambient: { color: "#ffffff", intensity: 0.1 }, points: [] },
    entities: [...base.scenes[0].entities, { id: "remote", transform2d: { x: 40, y: 0 },
      sprite: { assetId: "gem", width: 1, height: 1 }, tilemap: { assetId: "wall", tiles: [{ x: 0, y: 0, width: 1, height: 1 }] },
      light2d: { color: "#ff0000", intensity: 1, radius: 1 } }]
  }] });
  function CameraHarness() {
    const host = useGamePlaySession({ refId: "editor-view-pan", document: game, active: true });
    return <><canvas ref={host.canvasRef} /><button onClick={() => host.onCamera({ x: 40, y: 0, zoom: 1 })}>Frame remote</button>
      <output aria-label="Camera backend">{host.backend}</output></>;
  }
  const view = render(<CameraHarness />);
  try {
    await waitFor(() => expect(screen.getByLabelText("Camera backend")).toHaveTextContent("Canvas 2D"));
    const renderer = mockRenderers[mockRenderers.length - 1];
    await userEvent.setup().click(screen.getByRole("button", { name: "Frame remote" }));
    const shown = renderer.render.mock.calls.at(-1)?.[0] as GameRenderFrame;
    expect(shown.camera).toMatchObject({ x: 40, y: 0, zoom: 1 });
    expect(shown.sprites.some((sprite) => sprite.entityId === "remote")).toBe(true);
    expect(shown.tiles.some((tile) => tile.entityId === "remote")).toBe(true);
    expect(shown.lighting?.points.some((point) => point.x === 40)).toBe(true);
    expect(game.scenes[0].entities.find((entity) => entity.camera2d)?.transform2d.x).toBe(0);
  } finally { view.unmount(); }
});
