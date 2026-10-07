import type { ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createNative3DGame } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import GameEditor3D from "../GameEditor3D";
import type GameViewport3D from "../viewport3d/GameViewport3D";
import type GameHierarchy3D from "../panels/hierarchy/GameHierarchy3D";
import type GameInspector3D from "../panels/inspector/GameInspector3D";
import type GameScriptPane from "../panels/scripts/GameScriptPane";

let mockViewportProps: ComponentProps<typeof GameViewport3D> | undefined;

const mockDocument = createNative3DGame("controller3d");
let mockFixtureId = 0;
const mockToken = "2026-01-01T00:00:00.000Z";
const mockSavedToken = "2026-01-01T00:00:00.001Z";
const mockRestoredToken = "2026-01-01T00:00:00.002Z";
const mockRevision = "a".repeat(32);
const mockServer = { document: mockDocument, game: { id: mockDocument.id, name: "Controller 3D", projectId: "project", draftUpdatedAt: mockToken } };
const mockInvalidate = jest.fn(async () => undefined);
const mockSave = jest.fn(async (request: { id: string; baseUpdatedAt: string; ops: readonly unknown[] }) => ({ document: getGameDraftStore(request.id).getState().document, game: { draftUpdatedAt: mockSavedToken } }));
const mockRestore = jest.fn(async (request: { id: string; baseUpdatedAt: string; revision: string }) => ({ document: { ...mockDocument, id: request.id }, game: { draftUpdatedAt: mockRestoredToken } }));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    games: {
      getDraft: { useQuery: () => ({ data: mockServer, isPending: false }) },
      revisions: { useQuery: () => ({ data: [{ revision: mockRevision, modifiedAt: 0, current: false, message: "Earlier release" }] }) },
      draftChanges: { useQuery: () => ({ data: [] }) }
    },
    useUtils: () => ({ games: {
      getDraft: { invalidate: mockInvalidate }, revisions: { invalidate: mockInvalidate }, draftChanges: { invalidate: mockInvalidate }
    } })
  },
  trpcClient: { games: {
    saveDraft: { mutate: (request: Parameters<typeof mockSave>[0]) => mockSave(request) },
    restoreDraft: { mutate: (request: Parameters<typeof mockRestore>[0]) => mockRestore(request) }
  } }
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({ useDocumentConflicts: () => ({ items: [], accept: jest.fn(), discard: jest.fn() }) }));
jest.mock("../useGamePlaySession3D", () => ({
  EMPTY_INPUT_3D: { pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } },
  useGamePlaySession3D: () => ({
    playing: false, playDocument: null, inspection: null, frame: null, backend: "Test", error: null,
    beginPlay: jest.fn(), stop: jest.fn(), step: jest.fn(), save: jest.fn(), load: jest.fn(), replayBeforeError: jest.fn()
  })
}));
jest.mock("../panels/scripts/useGameScriptDiagnostics", () => ({
  useGameScriptDiagnostics: () => ({ run: jest.fn(), running: false, summary: null, error: null, byEntity: [] })
}), { virtual: true });
jest.mock("../viewport3d/GameViewport3D", () => ({ __esModule: true, default: (props: ComponentProps<typeof GameViewport3D>) => {
  mockViewportProps = props;
  return <div>Viewport</div>;
} }));
jest.mock("../panels/hierarchy/GameHierarchy3D", () => ({
  __esModule: true, default: ({ onSelect }: ComponentProps<typeof GameHierarchy3D>) => <>
    <button onClick={() => onSelect("player")}>Select player</button>
    <button onClick={() => onSelect("player-visual")}>Select visual</button>
  </>
}));
jest.mock("../panels/inspector/GameInspector3D", () => ({
  __esModule: true, default: ({ onScript }: ComponentProps<typeof GameInspector3D>) => <button onClick={() => onScript(0)}>Edit selected script</button>
}));
jest.mock("../panels/authoring/GameAuthoringPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/changes/GameChanges", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/agent/GameAgentPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/scripts/GameScriptPane", () => ({
  __esModule: true, default: ({ entityId, behavior, onChange }: ComponentProps<typeof GameScriptPane>) => <>
    <p>Editing {entityId}</p>
    <textarea aria-label="Anchored script" value={behavior.source} onChange={(event) => onChange(event.target.value)} />
  </>
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockViewportProps = undefined;
  mockDocument.id = `controller3d-${++mockFixtureId}`;
  mockServer.game.id = mockDocument.id;
  for (const id of ["player", "player-visual"]) {
    const entity = mockDocument.scenes[0].entities.find((entry) => entry.id === id);
    if (!entity) { throw new Error(`Controller fixture ${id} missing`); }
    entity.behaviors = [{ kind: "script", source: "original", maxCommands: 16, maxTickMs: 8 }];
  }
  getGameDraftStore(mockDocument.id).getState().load(mockDocument, mockToken);
});

it("keeps an opened script anchored after another entity is selected", async () => {
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameEditor3D refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Select player" }));
  await user.click(screen.getByRole("button", { name: "Edit selected script" }));
  await user.click(screen.getByRole("button", { name: "Select visual" }));
  expect(screen.getByText("Editing player")).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Anchored script" }), " changed");
  const document = getGameDraftStore(mockDocument.id).getState().document;
  expect(document?.scenes[0].entities.find((entry) => entry.id === "player")?.behaviors[0]).toMatchObject({ source: "original changed" });
  expect(document?.scenes[0].entities.find((entry) => entry.id === "player-visual")?.behaviors[0]).toMatchObject({ source: "original" });
});

it("confirms restore, flushes edits and uses the acknowledged token before resetting undo", async () => {
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameEditor3D refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Select player" }));
  await user.click(screen.getByRole("button", { name: "Edit selected script" }));
  await user.type(screen.getByRole("textbox", { name: "Anchored script" }), " changed");
  const store = getGameDraftStore(mockDocument.id);
  expect(store.getState().commandHistory.past.length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Revisions" }));
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  expect(mockRestore).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  await waitFor(() => expect(mockRestore).toHaveBeenCalledWith({ id: mockDocument.id, baseUpdatedAt: mockSavedToken, revision: mockRevision }));
  expect(mockSave).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(store.getState().baseUpdatedAt).toBe(mockRestoredToken));
  expect(store.getState().pendingOps).toEqual([]);
  expect(store.getState().commandHistory.past).toEqual([]);
  expect(store.getState().document).toEqual(mockDocument);
});

it("keeps inspector-button undo outside the 3D editor keyboard scope", async () => {
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameEditor3D refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Select player" }));
  await user.click(screen.getByRole("button", { name: "Edit selected script" }));
  await user.type(screen.getByRole("textbox", { name: "Anchored script" }), " changed");
  const store = getGameDraftStore(mockDocument.id);
  const history = store.getState().commandHistory.past.length;
  expect(history).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Edit selected script" }));
  await user.keyboard("{Control>}z{/Control}");
  expect(store.getState().document?.scenes[0].entities.find((entity) => entity.id === "player")?.behaviors[0]).toMatchObject({ source: "original changed" });
  expect(store.getState().commandHistory.past).toHaveLength(history);
  expect(store.getState().pendingOps).toHaveLength(1);
});


function controllerDocument3D(store: ReturnType<typeof getGameDraftStore>) {
  const document = store.getState().document;
  if (document?.schemaVersion !== 3) { throw new Error("Expected real 3D draft"); }
  return document;
}

it.each(["Rotate", "Scale"])("labels sequential %s and Move gestures from the current transform and supports undo/redo", async (action) => {
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameEditor3D refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: action === "Scale" ? "Select visual" : "Select player" }));
  const store = getGameDraftStore(mockDocument.id);
  const before = structuredClone(controllerDocument3D(store));
  const player = before.scenes[0].entities.find((entity) => entity.id === (action === "Scale" ? "player-visual" : "player"));
  if (!player) { throw new Error("Fixture player missing"); }
  const viewport = mockViewportProps;
  if (!viewport?.onGestureStart || !viewport.onGestureEnd || !viewport.onOps) { throw new Error("Gesture callbacks missing"); }
  act(() => {
    const gestureId = viewport.onGestureStart?.();
    if (gestureId === undefined) { throw new Error("Gesture ID missing"); }
    for (const amount of [1, 2]) {
      const transform = structuredClone(player.transform3d);
      if (action === "Rotate") { transform.rotation = [0, Math.sin(amount * Math.PI / 8), 0, Math.cos(amount * Math.PI / 8)]; }
      else { transform.scale = { x: amount + 1, y: amount + 1, z: amount + 1 }; }
      viewport.onOps?.([{ op: "update_entity", scene_id: before.entrySceneId, entity_id: player.id,
        set: { transform3d: transform } }], gestureId);
    }
    viewport.onGestureEnd?.(gestureId);
  });
  expect(store.getState().error).toBeNull();
  expect(store.getState().commandHistory.past).toHaveLength(1);
  expect(store.getState().commandHistory.past[0].label).toBe(`${action} ${player.name || player.id}`);
  const afterFirst = structuredClone(controllerDocument3D(store));
  const current = afterFirst.scenes[0].entities.find((entity) => entity.id === player.id);
  const nextViewport = mockViewportProps;
  if (action === "Rotate") { expect(current?.transform3d.rotation).toEqual([0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]); }
  else { expect(current?.transform3d.scale).toEqual({ x: 3, y: 3, z: 3 }); }
  if (!current || !nextViewport?.onGestureStart || !nextViewport.onGestureEnd || !nextViewport.onOps) { throw new Error("Current gesture callbacks missing"); }
  act(() => {
    const gestureId = nextViewport.onGestureStart?.();
    if (gestureId === undefined) { throw new Error("Gesture ID missing"); }
    for (const amount of [1, 2]) {
      const transform = structuredClone(current.transform3d);
      transform.position.x += amount;
      nextViewport.onOps?.([{ op: "update_entity", scene_id: afterFirst.entrySceneId, entity_id: current.id,
        set: { transform3d: transform } }], gestureId);
    }
    nextViewport.onGestureEnd?.(gestureId);
  });
  const afterMove = structuredClone(controllerDocument3D(store));
  const moved = afterMove.scenes[0].entities.find((entity) => entity.id === player.id);
  expect(moved?.transform3d.position.x).toBe(current.transform3d.position.x + 2);
  expect(moved?.transform3d.rotation).toEqual(current.transform3d.rotation);
  expect(moved?.transform3d.scale).toEqual(current.transform3d.scale);
  expect(store.getState().commandHistory.past.map((command) => command.label)).toEqual([
    `${action} ${player.name || player.id}`, `Move ${player.name || player.id}`
  ]);
  act(() => store.getState().undo());
  expect(controllerDocument3D(store)).toEqual(afterFirst);
  act(() => store.getState().undo());
  expect(controllerDocument3D(store)).toEqual(before);
  act(() => store.getState().redo());
  expect(controllerDocument3D(store)).toEqual(afterFirst);
  act(() => store.getState().redo());
  expect(controllerDocument3D(store)).toEqual(afterMove);
});

it("uses the selected entity ID in a viewport command label when its stored name is empty", async () => {
  const player = mockDocument.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Fixture player missing"); }
  const originalName = player.name;
  player.name = "";
  try {
    const store = getGameDraftStore(mockDocument.id);
    store.getState().load(mockDocument, mockToken);
    const user = userEvent.setup();
    render(<ThemeProvider theme={mockTheme}><GameEditor3D refId={mockDocument.id} active /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Select player" }));
    const viewport = mockViewportProps;
    if (!viewport?.onGestureStart || !viewport.onGestureEnd || !viewport.onOps) { throw new Error("Gesture callbacks missing"); }
    act(() => {
      const gestureId = viewport.onGestureStart?.();
      if (gestureId === undefined) { throw new Error("Gesture ID missing"); }
      viewport.onOps?.([{ op: "update_entity", scene_id: mockDocument.entrySceneId, entity_id: player.id,
        set: { transform3d: { position: { x: player.transform3d.position.x + 1 } } } }], gestureId);
      viewport.onGestureEnd?.(gestureId);
    });
    expect(store.getState().commandHistory.past).toHaveLength(1);
    expect(store.getState().commandHistory.past[0].label).toBe("Move player");
  } finally { player.name = originalName; }
});
