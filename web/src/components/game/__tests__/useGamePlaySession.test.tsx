import { act, render, screen, waitFor } from "@testing-library/react";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { useGamePlaySession } from "../useGamePlaySession";

const mockAudioInstances: Array<{
  pause: jest.Mock;
  resume: jest.Mock;
  sync: jest.Mock;
  preload: jest.Mock;
  dispose: jest.Mock;
}> = [];

jest.mock("@nodetool-ai/game-renderer/audio", () => ({
  GameAudioPlayer: jest.fn().mockImplementation(() => {
    const audio = { pause: jest.fn(), resume: jest.fn(), sync: jest.fn(), preload: jest.fn(), dispose: jest.fn() };
    mockAudioInstances.push(audio);
    return audio;
  })
}));

jest.mock("@nodetool-ai/game-renderer/browser", () => ({
  loadBrowserGameFonts: jest.fn(async () => ({ diagnostics: [], dispose: jest.fn() })),
  createGameRenderer: jest.fn(async ({ canvas }: { canvas: HTMLCanvasElement }) => ({
    canvas, backend: "canvas2d", capabilities: { gpuEffects: false },
    resize: jest.fn(), render: jest.fn(async () => {}), setEffects: jest.fn(), dispose: jest.fn()
  }))
}));

const document = createTopDownRoomGame("audio-edit-mode");
const multiSceneDocument = { ...document, scenes: [...document.scenes,
  { ...document.scenes[0], id: "alternate-scene", name: "Alternate" }] };

function GameHarness() {
  const session = useGamePlaySession({ refId: "audio-edit-mode", active: true, document });
  return <><canvas ref={session.canvasRef} /><button onClick={session.beginPlay}>Play</button><button onClick={session.stop}>Stop</button></>;
}

describe("game editor audio", () => {
  beforeEach(() => { mockAudioInstances.length = 0; });

  it("keeps scene music paused in edit mode and starts it on Play", async () => {
    const view = render(<GameHarness />);
    await waitFor(() => expect(mockAudioInstances.length).toBeGreaterThan(0));
    await waitFor(() => expect(mockAudioInstances[0].sync).toHaveBeenCalled());
    expect(mockAudioInstances[0].pause).toHaveBeenCalled();
    expect(mockAudioInstances[0].pause.mock.invocationCallOrder[0]).toBeLessThan(
      mockAudioInstances[0].sync.mock.invocationCallOrder[0]
    );
    expect(mockAudioInstances[0].resume).not.toHaveBeenCalled();

    act(() => { view.getByRole("button", { name: "Play" }).click(); });
    await waitFor(() => expect(mockAudioInstances.some((audio) => audio.resume.mock.calls.length > 0)).toBe(true));

    const playInstanceCount = mockAudioInstances.length;
    act(() => { view.getByRole("button", { name: "Stop" }).click(); });
    await waitFor(() => expect(mockAudioInstances.length).toBeGreaterThan(playInstanceCount));
    await waitFor(() => expect(mockAudioInstances.at(-1)?.pause).toHaveBeenCalled());
    expect(mockAudioInstances.at(-1)?.resume).not.toHaveBeenCalled();
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
