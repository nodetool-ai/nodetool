import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { useGamePlaySession } from "../useGamePlaySession";
import { gameAuthoring, gameAssetBinding, type GameDocument } from "@nodetool-ai/protocol";
import { loadBrowserGameFonts } from "@nodetool-ai/game-renderer/browser";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

const mockRenderers: Array<{ assets: (slot: string) => Promise<HTMLImageElement | null>; invalidateAsset: jest.Mock }> = [];

jest.mock("../../../utils/resolveMediaUri", () => ({ resolveMediaUri: jest.fn(async () => null) }));

const mockAudioInstances: Array<{
  pause: jest.Mock;
  resume: jest.Mock;
  sync: jest.Mock;
  reset: jest.Mock;
  preload: jest.Mock;
  dispose: jest.Mock;
}> = [];

jest.mock("@nodetool-ai/game-renderer/audio", () => ({
  GameAudioPlayer: jest.fn().mockImplementation(() => {
    const audio = { reset: jest.fn(), pause: jest.fn(), resume: jest.fn(), sync: jest.fn(), updateAssets: jest.fn(), preload: jest.fn(), dispose: jest.fn() };
    mockAudioInstances.push(audio);
    return audio;
  })
}));

jest.mock("@nodetool-ai/game-renderer/browser", () => ({
  loadBrowserGameFonts: jest.fn(async () => ({ diagnostics: [], dispose: jest.fn() })),
  createGameRenderer: jest.fn(async ({ canvas, assets }: { canvas: HTMLCanvasElement; assets: (slot: string) => Promise<HTMLImageElement | null> }) => {
    const renderer = { canvas, assets, invalidateAsset: jest.fn(), backend: "canvas2d", capabilities: { gpuEffects: false },
      resize: jest.fn(), render: jest.fn(async () => {}), setEffects: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}));

const document = createTopDownRoomGame("audio-edit-mode");
const multiSceneDocument = { ...document, scenes: [...document.scenes,
  { ...document.scenes[0], id: "alternate-scene", name: "Alternate" }] };

function GameHarness({ gameDocument = document }: { gameDocument?: GameDocument }) {
  const session = useGamePlaySession({ refId: "audio-edit-mode", active: true, document: gameDocument });
  return <><canvas ref={session.canvasRef} /><button onClick={session.beginPlay}>Play</button><button onClick={session.stop}>Stop</button></>;
}

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

it("keeps the renderer and audio player through ten document edits", async () => {
  mockRenderers.length = 0;
  mockAudioInstances.length = 0;
  const view = render(<GameHarness />);
  await waitFor(() => expect(mockRenderers).toHaveLength(1));
  for (let index = 0; index < 10; index++) {
    view.rerender(<GameHarness gameDocument={{ ...document, revision: `edit-${index}` }} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
  }
  expect(mockRenderers).toHaveLength(1);
  expect(mockAudioInstances).toHaveLength(1);
  view.unmount();
});
