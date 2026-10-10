import { useRef } from "react";
import { useStore, type StoreApi } from "zustand";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame, type GameSession } from "@nodetool-ai/game-runtime";

import GameViewport from "../../viewport2d/GameViewport";
import GameScriptPane from "../../panels/scripts/GameScriptPane";
import { useGamePlaySession } from "../../useGamePlaySession";
import { GameDockCanvas } from "../GameDockCanvas";
import { useGameDockPresentation } from "../useGameDockPresentation";
import { createGamePanelLayoutStore, type GamePanelLayoutState } from "../../../../stores/game/GamePanelLayoutStore";
import type { GamePanelView } from "../GameEditorShell";
import type { GamePanelRegistration } from "../panelRegistry";
import mockTheme from "../../../../__mocks__/themeMock";

const mockSessions: GameSession[] = [];
const mockRenderers: Array<{ dispose: jest.Mock; render: jest.Mock }> = [];
const mockAudioInstances: Array<{ reset: jest.Mock; dispose: jest.Mock }> = [];
const mockLoadMonaco = jest.fn();
function mockMonacoEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <textarea aria-label="Script source" value={value} onChange={(event) => onChange(event.target.value)} />;
}
jest.mock("@nodetool-ai/game-runtime", () => {
  const actual = jest.requireActual<typeof import("@nodetool-ai/game-runtime")>("@nodetool-ai/game-runtime");
  return { ...actual, createScriptedGameSession: async (...args: Parameters<typeof actual.createScriptedGameSession>) => {
    const session = await actual.createScriptedGameSession(...args);
    mockSessions.push(session);
    return session;
  } };
});
jest.mock("@nodetool-ai/game-renderer/browser", () => ({
  loadBrowserGameFonts: jest.fn(async () => ({ diagnostics: [], dispose: jest.fn() })),
  createGameRenderer: jest.fn(async ({ canvas }: { canvas: HTMLCanvasElement }) => {
    const renderer = { canvas, backend: "canvas2d", capabilities: { gpuEffects: false }, resize: jest.fn(),
      render: jest.fn(async () => {}), setEffects: jest.fn(), dispose: jest.fn() };
    mockRenderers.push(renderer);
    return renderer;
  })
}));
jest.mock("@nodetool-ai/game-renderer/audio", () => ({ gameAudioSpatialView2D: jest.fn(() => ({})), gameAudioSpatialView3D: jest.fn(() => ({})), GameAudioPlayer: jest.fn().mockImplementation(() => {
  const audio = { updateAssets: jest.fn(), updateMixer: jest.fn(), preload: jest.fn(), sync: jest.fn(), resume: jest.fn(), pause: jest.fn(),
    reset: jest.fn(), handle: jest.fn(), updateSpatial: jest.fn(), dispose: jest.fn() };
  mockAudioInstances.push(audio);
  return audio;
}) }));
jest.mock("../../../../utils/resolveMediaUri", () => ({ resolveMediaUri: jest.fn(async () => null) }));
jest.mock("../../../../hooks/editor/useMonacoEditor", () => ({ useMonacoEditor: () => ({
  MonacoEditor: mockMonacoEditor,
  loadMonacoIfNeeded: mockLoadMonaco
}) }));

const game = createTopDownRoomGame("stable-host-lifetime");
for (const scene of game.scenes) {
  for (const entity of scene.entities) { entity.behaviors = entity.behaviors.filter((behavior) => behavior.kind !== "script"); }
}
function ActualViewport() {
  const host = useGamePlaySession({ refId: game.id, document: game, editorSceneId: game.entrySceneId, active: true });
  return <>
    <button onClick={host.beginPlay}>Start host play</button>
    <output aria-label="Host backend">{host.backend}</output>
    <output aria-label="Host tick">{host.playState.tick}</output>
    <GameViewport canvasRef={host.canvasRef} frame={host.frame} document={game} playing={host.playing}
      paused={!host.playing} active selectedIds={[]} highlightedIds={[]} onSelect={jest.fn()}
      onSelectMany={jest.fn()} onMove={jest.fn()} onTransform={jest.fn()} onLight={jest.fn()}
      onCamera={jest.fn()} onViewportAspect={jest.fn()} onKeyDown={jest.fn()} onKeyUp={jest.fn()} onBlur={jest.fn()} />
  </>;
}


const registrations: readonly GamePanelRegistration[] = [
  { id: "viewport", title: "Viewport", icon: null, dimensions: ["2d"], defaultRegion: "viewport" },
  { id: "scripts", title: "Scripts", icon: null, dimensions: ["2d"], defaultRegion: "bottom" }
];
function RuntimeDock({ store, views }: { store: StoreApi<GamePanelLayoutState>; views: readonly GamePanelView[] }) {
  const root = useRef<HTMLDivElement | null>(null);
  const layout = useStore(store, (state) => state.layout);
  const presentation = useGameDockPresentation({ root, store, layout, registry: registrations,
    dimension: "2d", availableIds: views.map((view) => view.id), views });
  return <section ref={root}><GameDockCanvas store={store} presentation={presentation} /></section>;
}

it("docks real 2D viewport and script pane without replacing session, renderer, draft input or animation loop", async () => {
  const user = userEvent.setup();
  const store = createGamePanelLayoutStore({ anonymous: true }, {
    getItem: () => null, setItem: () => undefined, removeItem: () => undefined
  });
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextId; callbacks.set(id, callback); return id;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { callbacks.delete(id); });
  const views: readonly GamePanelView[] = [
    { id: "viewport", keyboardScope: true, node: <ActualViewport /> },
    { id: "scripts", node: <GameScriptPane entityId="player" entityName="Player" behaviorIndex={0}
      behavior={{ kind: "script", source: "original", maxCommands: 16, maxTickMs: 8 }} onChange={jest.fn()} onClose={jest.fn()} /> }
  ];
  const rendered = render(<ThemeProvider theme={mockTheme}><RuntimeDock store={store} views={views} /></ThemeProvider>);
  try {
    await waitFor(() => expect(screen.getByLabelText("Host backend")).toHaveTextContent("Canvas 2D"), { timeout: 5000 });
    const previewSessions = mockSessions.length;
    const previewRenderCount = mockRenderers[0].render.mock.calls.length;
    const previewResetCount = mockAudioInstances[0].reset.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Start host play" }));
    await waitFor(() => {
      expect(mockSessions).toHaveLength(previewSessions + 1);
      expect(mockRenderers[0].render.mock.calls.length).toBeGreaterThan(previewRenderCount);
      expect(mockAudioInstances[0].reset.mock.calls.length).toBeGreaterThan(previewResetCount);
      expect(callbacks.size).toBe(1);
    }, { timeout: 5000 });
    const sessions = [...mockSessions];
    const renderers = [...mockRenderers];
    const play = sessions[sessions.length - 1];
    const dispose = jest.spyOn(play, "dispose");
    const viewport = screen.getByRole("group", { name: "Game viewport" });
    viewport.focus();
    await act(async () => store.getState().dispatch({ type: "move", panelId: "viewport", region: "right", groupId: "runtime-viewport", index: 0 }));
    expect(screen.getByRole("group", { name: "Game viewport" })).toBe(viewport);
    expect(viewport).toHaveFocus();
    expect(viewport.closest("[data-game-dock-group]")).toHaveAttribute("data-game-dock-group", "runtime-viewport");
    const source = screen.getByRole("textbox", { name: "Script source" });
    await user.click(source);
    await user.type(source, " local draft");
    await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "left", groupId: "runtime-script", index: 0 }));
    expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
    expect(source).toHaveFocus();
    expect(source).toHaveValue("original local draft");
    await act(async () => store.getState().dispatch({ type: "hide", panelId: "scripts" }));
    expect(source.isConnected).toBe(false);
    expect(source).not.toHaveFocus();
    await act(async () => store.getState().dispatch({ type: "reveal", panelId: "scripts" }));
    expect(screen.getByRole("textbox", { name: "Script source" })).toBe(source);
    expect(source).toHaveValue("original local draft");
    await act(async () => store.getState().dispatch({ type: "move", panelId: "scripts", region: "right", groupId: "runtime-viewport", index: 1 }));
    expect(viewport.closest("[data-game-panel]")).toHaveAttribute("hidden");
    expect(viewport.closest("[data-game-panel]")).toHaveProperty("inert", true);
    expect(source).toHaveValue("original local draft");
    let time = performance.now();
    for (let tick = 0; tick < 20; tick++) {
      const pending = [...callbacks.values()]; callbacks.clear();
      await act(async () => { time += 1000 / 60; for (const callback of pending) { callback(time); } });
      expect(callbacks.size).toBe(1);
    }
    await act(async () => store.getState().dispatch({ type: "activate", panelId: "viewport" }));
    expect(screen.getByRole("group", { name: "Game viewport" })).toBe(viewport);
    expect(Number(screen.getByLabelText("Host tick").textContent)).toBeGreaterThan(0);
    expect(mockSessions).toEqual(sessions);
    expect(mockRenderers).toEqual(renderers);
    expect(renderers).toHaveLength(1);
    expect(renderers[0].dispose).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    await act(async () => rendered.unmount());
    expect(dispose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(renderers[0].dispose).toHaveBeenCalledTimes(1));
    expect(mockAudioInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  } finally {
    await act(async () => rendered.unmount());
    request.mockRestore(); cancel.mockRestore();
  }
});
