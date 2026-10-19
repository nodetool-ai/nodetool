import { type ComponentProps, type ReactElement } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame, validateGame } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import { getGameConsoleStore } from "../../../stores/game/GameConsoleStore";
import { getGamePanelLayoutStore } from "../../../stores/game/useGamePanelLayoutStore";
import useAuth from "../../../stores/useAuth";
import GameEditor from "../GameEditor";
import type GameViewport from "../viewport2d/GameViewport";
import type GameInspector from "../panels/inspector/GameInspector";
import type GameScriptPane from "../panels/scripts/GameScriptPane";
import type { ScriptFailure } from "../useGamePlaySession";

let mockViewportProps: ComponentProps<typeof GameViewport> | undefined;

const mockDocument = createTopDownRoomGame("controller-replay");
const mockFailure: ScriptFailure = { message: "Game script [\"room\",\"player\",0] failed", entityId: "player", tick: 12 };
const mockReplay = jest.fn(async () => undefined);
const mockCamera = jest.fn();
let mockPlayDocument: typeof mockDocument | null = mockDocument;
let mockPlaySceneId: string | null = null;
let mockHostFailure: ScriptFailure | null = null;
let mockDiagnosticFailure: ScriptFailure | null = null;
const mockServer = { document: mockDocument, game: { id: mockDocument.id, name: "Controller game", draftUpdatedAt: "2026-01-01T00:00:00.000Z" } };
const mockInvalidate = jest.fn(async () => undefined);
const mockSave = jest.fn(async (_request: { id: string; baseUpdatedAt: string; ops: readonly unknown[] }) => mockServer);
const mockGetDraftQuery = jest.fn(async () => mockServer);
const mockSavedToken = "2026-01-01T00:00:00.001Z";
const mockSaveDocument = jest.fn(async (request: { id: string; baseUpdatedAt: string; document: unknown }) =>
  ({ document: request.document, game: { ...mockServer.game, draftUpdatedAt: mockSavedToken } }));
let mockDraftUnavailable = false;
const mockRecoveryRevision = "b".repeat(32);
const mockRestore = jest.fn(async (_request: { id: string; baseUpdatedAt: string; revision: string }) => mockServer);
const mockSetDraft = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    games: {
      getDraft: { useQuery: () => mockDraftUnavailable
        ? { data: undefined, isPending: false, error: { message: "Game draft source is unavailable", data: { code: "PRECONDITION_FAILED" } } }
        : { data: mockServer, isPending: false } },
      get: { useQuery: () => ({ data: mockServer, isPending: false, refetch: async () => ({ data: mockServer }) }) },
      revisions: { useQuery: () => ({ data: [{ revision: mockRecoveryRevision, modifiedAt: 0, current: true, message: "Published room" }] }) },
      draftChanges: { useQuery: () => ({ data: [] }) }
    },
    useUtils: () => ({ games: {
      getDraft: { invalidate: mockInvalidate, setData: mockSetDraft },
      get: { setData: jest.fn() }, revisions: { invalidate: mockInvalidate }, draftChanges: { invalidate: mockInvalidate }
    } })
  },
  trpcClient: { games: {
    saveDraft: { mutate: (request: Parameters<typeof mockSave>[0]) => mockSave(request) },
    saveDraftDocument: { mutate: (request: Parameters<typeof mockSaveDocument>[0]) => mockSaveDocument(request) },
    restoreDraft: { mutate: (request: Parameters<typeof mockRestore>[0]) => mockRestore(request) },
    get: { query: async () => mockServer }, getDraft: { query: () => mockGetDraftQuery() }
  } }
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({ useDocumentConflicts: () => ({ items: [], accept: jest.fn(), discard: jest.fn() }) }));
jest.mock("../useGamePlaySession", () => ({
  ...jest.requireActual<typeof import("../useGamePlaySession")>("../useGamePlaySession"),
  useGamePlaySession: () => ({
    canvasRef: { current: null }, inputRef: { current: { handlesKey: () => false, keyDown: jest.fn(), keyUp: jest.fn(), release: jest.fn() } },
    playing: false, playDocument: mockPlayDocument, playState: { tick: 11, score: 0, won: false, sceneId: mockPlaySceneId ?? mockDocument.entrySceneId },
    backend: "Test", error: null, setError: jest.fn(), scriptError: mockHostFailure, setScriptError: jest.fn(), frame: null,
    onViewportAspect: jest.fn(), onCamera: mockCamera, resetCamera: jest.fn(), step: jest.fn(), beginPlay: jest.fn(), stop: jest.fn(),
    save: jest.fn(), load: jest.fn(), replayBeforeError: mockReplay, runtimeEntities: []
  })
}));
jest.mock("../panels/scripts/useGameScriptDiagnostics", () => ({
  useGameScriptDiagnostics: () => ({ run: jest.fn(), running: false, summary: "Diagnostic completed", error: mockDiagnosticFailure, byEntity: [] })
}));
jest.mock("../viewport2d/GameViewport", () => ({ __esModule: true, default: (props: ComponentProps<typeof GameViewport>) => {
  mockViewportProps = props;
  return <canvas aria-label="Editor viewport" role="button" tabIndex={0} onKeyDown={props.onKeyDown} />;
} }));
jest.mock("../panels/inspector/GameInspector", () => ({
  __esModule: true, default: ({ onEditScript }: ComponentProps<typeof GameInspector>) => <button
    onClick={() => onEditScript(mockDocument.entrySceneId, "player", 0)}>Edit player script</button>
}));
jest.mock("../panels/inspector/GameRuntimeInspector", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/authoring/GameAuthoringPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/changes/GameChanges", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/agent/GameAgentPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/assets/GameAssetBrowser", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/scripts/GameScriptPane", () => ({
  __esModule: true, default: ({ error, onReplay }: ComponentProps<typeof GameScriptPane>) => <>
    <p>{error?.message}</p>
    {onReplay && <button onClick={onReplay}>Replay displayed error</button>}
  </>
}));

const saveServerDraft = async (_request: { id: string; baseUpdatedAt: string; ops: readonly unknown[] }) => mockServer;

beforeEach(() => {
  jest.clearAllMocks();
  // One test holds a save open with mockImplementationOnce. Reset so an unused one-off cannot reach the next test.
  mockSave.mockReset();
  mockSave.mockImplementation(saveServerDraft);
  // The editor shares one persisted layout store per user, so each case starts from the same docking layout.
  getGamePanelLayoutStore(useAuth.getState().user?.id ?? null).getState().selectLayout("Default");
  mockViewportProps = undefined;
  mockPlayDocument = mockDocument;
  mockPlaySceneId = null;
  mockHostFailure = null;
  mockDiagnosticFailure = null;
  mockDraftUnavailable = false;
  mockRestore.mockResolvedValue(mockServer);
  mockInvalidate.mockResolvedValue(undefined);
  mockSetDraft.mockImplementation(() => undefined);
  const player = mockDocument.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Controller fixture player missing"); }
  player.behaviors = [{ kind: "script", source: "function update() {}", maxCommands: 16, maxTickMs: 8 }];
  getGameDraftStore(mockDocument.id).getState().load(mockDocument, mockServer.game.draftUpdatedAt);
});

type RenameOp = { op: "update_entity"; scene_id: string; entity_id: string; set: { name: string } };

function largeEdit(): RenameOp[] {
  return Array.from({ length: 1025 }, (_, index) => ({
    op: "update_entity", scene_id: mockDocument.entrySceneId, entity_id: "player", set: { name: `Player ${index}` }
  }));
}

function rename(name: string): RenameOp[] {
  return [{ op: "update_entity", scene_id: mockDocument.entrySceneId, entity_id: "player", set: { name } }];
}

function rejected(code: string): Error {
  return Object.assign(new Error("Save failed"), { data: { code } });
}

it("saves a batch above the op limit as one whole-document save (F2)", async () => {
  jest.useFakeTimers();
  const view = render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  try {
    act(() => store.getState().apply(largeEdit(), { label: "Large Command" }));
    const local = store.getState().document;
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    expect(mockSaveDocument).toHaveBeenCalledWith({ id: mockDocument.id, baseUpdatedAt: mockServer.game.draftUpdatedAt, document: local });
    expect(store.getState()).toMatchObject({ document: local, pendingOps: [], saveStatus: "saved", baseUpdatedAt: mockSavedToken });
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

it("retries a rejected op batch once as the whole document, then saves later edits as ops (F2)", async () => {
  jest.useFakeTimers();
  mockSave.mockRejectedValueOnce(rejected("BAD_REQUEST"));
  const view = render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  try {
    act(() => store.getState().apply(rename("Rejected op"), { label: "Rename Player" }));
    const local = store.getState().document;
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    expect(mockSaveDocument).toHaveBeenCalledWith(expect.objectContaining({ document: local }));
    expect(store.getState()).toMatchObject({ pendingOps: [], saveStatus: "saved", documentSaveRequired: false });
    act(() => store.getState().apply(rename("Later edit"), { label: "Rename Player" }));
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave.mock.calls[1][0]).toMatchObject({ baseUpdatedAt: mockSavedToken, ops: rename("Later edit") });
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

it.each(["BAD_REQUEST", "INTERNAL_SERVER_ERROR", "transport"])("preserves a failed whole-document save and saves it with the next edit after %s (F2)", async (code) => {
  jest.useFakeTimers();
  let rejectSave: ((error: Error) => void) | undefined;
  mockSaveDocument.mockImplementationOnce(() => new Promise((_, reject) => { rejectSave = reject; }));
  const view = render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  try {
    act(() => store.getState().apply(largeEdit(), { label: "Large Command" }));
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    act(() => store.getState().apply(rename("Newer edit"), { label: "Rename Player" }));
    const before = store.getState();
    if (!rejectSave) { throw new Error("Save was not held"); }
    await act(async () => { rejectSave?.(code === "transport" ? new Error("Failed to fetch") : rejected(code)); });
    expect(mockGetDraftQuery).toHaveBeenCalledTimes(1);
    expect(store.getState().document).toEqual(before.document);
    expect(store.getState().pendingOps).toEqual(before.pendingOps);
    expect(store.getState().commandHistory).toEqual(before.commandHistory);
    expect(store.getState().saveStatus).toBe("error");
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
    act(() => store.getState().undo());
    expect(store.getState().document?.scenes[0].entities.find((entity) => entity.id === "player")?.name).toBe("Player 1024");
    act(() => store.getState().apply(rename("Next edit"), { label: "Rename Player" }));
    const local = store.getState().document;
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockSaveDocument).toHaveBeenCalledTimes(2);
    expect(mockSaveDocument.mock.calls[1][0].document).toEqual(local);
    expect(store.getState()).toMatchObject({ document: local, pendingOps: [], saveStatus: "saved" });
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

it("recovers a missing draft after a rejected save and saves the next edit as ops (F2, F6)", async () => {
  mockSave.mockRejectedValueOnce(rejected("BAD_REQUEST"));
  mockSaveDocument.mockRejectedValueOnce(rejected("PRECONDITION_FAILED"));
  URL.createObjectURL = jest.fn(() => "blob:local-draft");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const user = userEvent.setup();
  const editor = (): ReactElement => <ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>;
  const view = render(editor());
  const store = getGameDraftStore(mockDocument.id);
  try {
    act(() => store.getState().apply(rename("Rejected op"), { label: "Rename Player" }));
    const local = store.getState();
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledWith({ id: mockDocument.id }));
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ document: local.document, pendingOps: local.pendingOps, saveStatus: "error" });
    mockDraftUnavailable = true;
    view.rerender(editor());
    await user.click(screen.getByRole("button", { name: "Export local draft" }));
    expect(click).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Restore to draft" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
    await waitFor(() => expect(store.getState().document).toEqual(mockServer.document));
    expect(store.getState()).toMatchObject({ pendingOps: [], documentSaveRequired: false, saveStatus: "saved" });
    mockDraftUnavailable = false;
    view.rerender(editor());
    act(() => store.getState().apply(rename("After recovery"), { label: "Rename Player" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(mockSave.mock.calls[1][0].ops).toEqual(rename("After recovery"));
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    click.mockRestore();
  }
});

it("F6 restores a missing draft only after selecting and confirming a published revision", async () => {
  mockDraftUnavailable = true;
  getGameDraftStore(mockDocument.id).setState({ document: null });
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  expect(mockRestore).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  expect(mockRestore).not.toHaveBeenCalled();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  expect(mockRestore).toHaveBeenCalledWith({ id: mockDocument.id,
    baseUpdatedAt: mockServer.game.draftUpdatedAt, revision: mockRecoveryRevision });
});

it("F6 leaves recovery after a competing writer repairs the draft", async () => {
  mockDraftUnavailable = true;
  getGameDraftStore(mockDocument.id).setState({ document: null });
  mockRestore.mockRejectedValue(new Error("Game draft was modified concurrently"));
  mockSetDraft.mockImplementation(() => { mockDraftUnavailable = false; });
  const user = userEvent.setup();
  const view = render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  await waitFor(() => expect(mockSetDraft).toHaveBeenCalledWith({ id: mockDocument.id }, mockServer));
  view.rerender(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  expect(screen.queryByText("Draft source unavailable")).not.toBeInTheDocument();
  expect(mockViewportProps).toBeDefined();
  expect(mockRestore).toHaveBeenCalledTimes(1);
});

it.each(["active play", "independent diagnostic"])("offers host replay only for a host failure: %s", async (provenance) => {
  const user = userEvent.setup();
  if (provenance === "active play") { mockHostFailure = mockFailure; }
  else { mockDiagnosticFailure = mockFailure; }
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Edit player script" }));
  const shown = screen.getAllByText(mockFailure.message);
  expect(shown.filter((element) => !element.closest("[role='log']")).length).toBeGreaterThan(0);
  if (provenance === "independent diagnostic") {
    expect(screen.queryByRole("button", { name: "Replay displayed error" })).not.toBeInTheDocument();
    expect(mockReplay).not.toHaveBeenCalled();
  } else {
    await user.click(screen.getByRole("button", { name: "Replay displayed error" }));
    expect(mockReplay).toHaveBeenCalledTimes(1);
    expect(mockReplay).toHaveBeenCalledWith(mockFailure);
  }
  // The Console panel mounts when first shown. Its lines come from the console store, so nothing is lost before that.
  await user.click(screen.getByRole("tab", { name: /Console/ }));
  expect(within(screen.getByRole("list", { name: "Console lines" })).getAllByRole("listitem").at(-1)).toHaveTextContent(mockFailure.message);
});

it("preserves hierarchy Alt-arrow boundary no-ops and handled reparenting", async () => {
  const user = userEvent.setup();
  mockPlayDocument = null;
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  const first = mockDocument.scenes[0].entities[0];
  const before = structuredClone(first.transform2d);
  await user.click(screen.getByRole("button", { name: first.name || first.id }));
  await user.keyboard("{Alt>}{ArrowUp}{ArrowLeft}{/Alt}");
  expect(store.getState().pendingOps).toEqual([]);
  expect(document2D(store).scenes[0].entities.find((entity) => entity.id === first.id)?.transform2d).toEqual(before);
  await user.click(screen.getByRole("button", { name: "player" }));
  await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
  const player = document2D(store).scenes[0].entities.find((entity) => entity.id === "player");
  expect(player?.parentId).toBe(first.id);
  expect(player?.transform2d).toEqual(mockDocument.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d);
  expect(store.getState().pendingOps.map((op) => op.op)).toEqual(["update_entity", "move_entity"]);
});

it("preserves viewport Alt-arrow world nudging", async () => {
  const user = userEvent.setup();
  mockPlayDocument = null;
  const store = getGameDraftStore(mockDocument.id);
  store.getState().select("player");
  const initialY = mockDocument.scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.y;
  if (initialY === undefined) { throw new Error("Fixture player transform missing"); }
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Editor viewport" }));
  await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
  expect(document2D(store).scenes[0].entities.find((entity) => entity.id === "player")?.transform2d.y).toBe(initialY - 0.25);
  expect(store.getState().pendingOps).toHaveLength(1);
});

it("keeps hierarchy navigation keys from editing the selected entity", async () => {
  const user = userEvent.setup();
  mockPlayDocument = null;
  const store = getGameDraftStore(mockDocument.id);
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "player" }));
  const before = structuredClone(store.getState().document);
  await user.keyboard("{ArrowDown}{Delete}{Home}{Control>}d{/Control}");
  expect(store.getState().document).toEqual(before);
  expect(store.getState().pendingOps).toEqual([]);
  await user.tab();
  expect(screen.getByRole("button", { name: "player" })).not.toHaveFocus();
});

it("keeps inspector-button undo and delete outside the editor keyboard scope", async () => {
  const user = userEvent.setup();
  mockPlayDocument = null;
  // Autosave may start while the test types. Holding the save open keeps the server copy from replacing the local edit,
  // so the assertions below depend only on the keyboard scope and not on how fast the editor renders.
  mockSave.mockImplementationOnce(() => new Promise(() => undefined));
  const store = getGameDraftStore(mockDocument.id);
  store.getState().select("player");
  store.getState().apply([{ op: "update_entity", scene_id: mockDocument.entrySceneId, entity_id: "player", set: { transform2d: { x: 1 } } }]);
  const history = store.getState().commandHistory.past.length;
  expect(history).toBeGreaterThan(0);
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Edit player script" }));
  await user.keyboard("{Control>}z{/Control}{Delete}");
  const player = document2D(store).scenes[0].entities.find((entity) => entity.id === "player");
  expect(player?.transform2d.x).toBe(1);
  expect(store.getState().commandHistory.past).toHaveLength(history);
  expect(store.getState().pendingOps).toHaveLength(1);
});

function document2D(store: ReturnType<typeof getGameDraftStore>) {
  const document = store.getState().document;
  if (!document || document.schemaVersion === 3) { throw new Error("Expected 2D fixture document"); }
  return document;
}


it("records selected-root viewport moves as one labelled command with exact undo and redo", () => {
  mockPlayDocument = null;
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  const first = mockDocument.scenes[0].entities.find((entity) => entity.id === "player");
  const second = mockDocument.scenes[0].entities.find((entity) => entity.id !== "player" && !entity.parentId);
  if (!first || !second) { throw new Error("Two fixture roots required"); }
  act(() => {
    if (!mockViewportProps) { throw new Error("Viewport not mounted"); }
    mockViewportProps.onSelect(first.id, false);
    mockViewportProps.onSelect(second.id, true);
  });
  const before = structuredClone(document2D(store));
  const viewport = mockViewportProps;
  if (!viewport?.onGestureStart || !viewport.onGestureEnd) { throw new Error("Gesture callbacks missing"); }
  act(() => {
    const gestureId = viewport.onGestureStart?.();
    if (gestureId === undefined) { throw new Error("Gesture ID missing"); }
    viewport.onMove(first.id, first.transform2d.x + 1, first.transform2d.y, gestureId);
    viewport.onMove(second.id, second.transform2d.x + 1, second.transform2d.y, gestureId);
    viewport.onMove(first.id, first.transform2d.x + 2, first.transform2d.y, gestureId);
    viewport.onMove(second.id, second.transform2d.x + 2, second.transform2d.y, gestureId);
    viewport.onGestureEnd?.(gestureId);
  });
  const after = structuredClone(document2D(store));
  expect(after.scenes[0].entities.find((entity) => entity.id === first.id)?.transform2d).toMatchObject({ x: first.transform2d.x + 2, y: first.transform2d.y });
  expect(after.scenes[0].entities.find((entity) => entity.id === second.id)?.transform2d).toMatchObject({ x: second.transform2d.x + 2, y: second.transform2d.y });
  expect(after).not.toEqual(before);
  expect(store.getState().commandHistory.past).toHaveLength(1);
  expect(store.getState().commandHistory.past[0].label).toBe("Move selection");
  act(() => store.getState().undo());
  expect(document2D(store)).toEqual(before);
  expect(store.getState().commandHistory.future).toHaveLength(1);
  act(() => store.getState().redo());
  expect(document2D(store)).toEqual(after);
  expect(store.getState().commandHistory.past).toHaveLength(1);
});


it("batch release: records selected-root viewport moves as one labelled command with exact undo and redo", () => {
  mockPlayDocument = null;
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  const store = getGameDraftStore(mockDocument.id);
  const first = mockDocument.scenes[0].entities.find((entity) => entity.id === "player");
  const second = mockDocument.scenes[0].entities.find((entity) => entity.id !== "player" && !entity.parentId);
  if (!first || !second) { throw new Error("Two fixture roots required"); }
  const originalApply = store.getState().apply;
  const applySpy = jest.spyOn(store.getState(), "apply");
  act(() => {
    if (!mockViewportProps) { throw new Error("Viewport not mounted"); }
    mockViewportProps.onSelect(first.id, false);
    mockViewportProps.onSelect(second.id, true);
  });
  const before = structuredClone(document2D(store));
  const viewport = mockViewportProps;
  if (!viewport?.onGestureStart || !viewport.onGestureEnd) { throw new Error("Gesture callbacks missing"); }
  act(() => {
    const gestureId = viewport.onGestureStart?.();
    if (gestureId === undefined) { throw new Error("Gesture ID missing"); }
    if (!viewport.onMoves) { throw new Error("Batch move callback missing"); }
    viewport.onMoves([{ id: first.id, x: first.transform2d.x + 2, y: first.transform2d.y },
      { id: second.id, x: second.transform2d.x + 2, y: second.transform2d.y }], gestureId);
    viewport.onGestureEnd?.(gestureId);
  });
  expect(applySpy).toHaveBeenCalledTimes(1);
  applySpy.mockRestore();
  store.setState({ apply: originalApply });
  const after = structuredClone(document2D(store));
  expect(after.scenes[0].entities.find((entity) => entity.id === first.id)?.transform2d).toMatchObject({ x: first.transform2d.x + 2, y: first.transform2d.y });
  expect(after.scenes[0].entities.find((entity) => entity.id === second.id)?.transform2d).toMatchObject({ x: second.transform2d.x + 2, y: second.transform2d.y });
  expect(after).not.toEqual(before);
  expect(store.getState().commandHistory.past).toHaveLength(1);
  expect(store.getState().commandHistory.past[0].label).toBe("Move selection");
  act(() => store.getState().undo());
  expect(document2D(store)).toEqual(before);
  expect(store.getState().commandHistory.future).toHaveLength(1);
  act(() => store.getState().redo());
  expect(document2D(store)).toEqual(after);
  expect(store.getState().commandHistory.past).toHaveLength(1);
});


async function withSceneLocalPlayers(
  run: (context: { fixture: typeof mockDocument; store: ReturnType<typeof getGameDraftStore> }) => Promise<void>,
  emptySecondScene = false,
  visualPlayers = false
): Promise<void> {
  mockPlayDocument = null;
  mockSave.mockImplementation(() => new Promise(() => undefined));
  const originalServerDocument = mockServer.document;
  const fixture = structuredClone(mockDocument);
  const first = fixture.scenes[0];
  first.name = "Scene A";
  for (const entity of first.entities) { entity.name = `${entity.id} A`; }
  const second = structuredClone(first);
  second.id = "scene-b";
  second.name = "Scene B";
  for (const entity of second.entities) {
    entity.name = `${entity.id} B`;
    entity.transform2d.x += 40;
  }
  if (emptySecondScene) { second.entities = []; }
  fixture.scenes = [first, second];
  if (visualPlayers) {
    for (const scene of fixture.scenes) {
      const player = scene.entities.find((entity) => entity.id === "player");
      if (player) { delete player.collider2d; }
    }
  }
  expect(validateGame(fixture).valid).toBe(true);
  mockServer.document = fixture;
  const store = getGameDraftStore(fixture.id);
  store.getState().load(fixture, mockServer.game.draftUpdatedAt);
  const view = render(<ThemeProvider theme={mockTheme}><GameEditor refId={fixture.id} active /></ThemeProvider>);
  try { await run({ fixture, store }); }
  finally { view.unmount(); mockServer.document = originalServerDocument; }
}

it("selects the clicked scene-local hierarchy entity without merging a cross-scene additive selection (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ store }) => {
    await user.click(screen.getByRole("button", { name: "player A" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "player B" }));
    await user.keyboard("{/Shift}");
    expect(mockViewportProps?.sceneId).toBe("scene-b");
    expect(store.getState().selectedIds).toEqual(["player"]);
    expect(screen.getByRole("button", { name: "player A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "player B" })).toHaveAttribute("aria-pressed", "true");
  });
});

it.each(["move", "batch move", "rotate"])("targets only B/player through the viewport %s callback (E1)", async (kind) => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    await user.click(screen.getByRole("button", { name: "player B" }));
    const viewport = mockViewportProps;
    if (!viewport) { throw new Error("Actual editor viewport callbacks are missing"); }
    act(() => {
      if (kind === "move") { viewport.onMove("player", 44, 3); }
      else if (kind === "batch move") {
        if (!viewport.onMoves) { throw new Error("Viewport batch move callback is missing"); }
        viewport.onMoves([{ id: "player", x: 44, y: 3 }]);
      }
      else { viewport.onTransform("player", { rotation: 0.5 }); }
    });
    expect(store.getState().error).toBeNull();
    expect(store.getState().pendingOps).toHaveLength(1);
    expect(store.getState().pendingOps[0]).toMatchObject({ op: "update_entity", scene_id: "scene-b", entity_id: "player" });
    expect(document2D(store).scenes[0]).toEqual(first);
    expect(document2D(store).scenes[1].entities.find((entity) => entity.id === "player")?.transform2d)
      .toMatchObject(kind === "rotate" ? { rotation: 0.5 } : { x: 44, y: 3 });
    const after = structuredClone(document2D(store));
    act(() => store.getState().undo());
    expect(document2D(store)).toEqual(fixture);
    act(() => store.getState().redo());
    expect(document2D(store)).toEqual(after);
  }, false, kind === "rotate");
});

it("keeps a deferred viewport gesture bound to its rendered scene after active scene changes (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    await user.click(screen.getByRole("button", { name: "player B" }));
    const renderedB = mockViewportProps;
    if (!renderedB?.onGestureStart || !renderedB.onGestureEnd || !renderedB.onMoves) {
      throw new Error("Actual editor viewport gesture callbacks are missing");
    }
    const { onGestureStart, onGestureEnd, onMoves } = renderedB;
    let gestureId = 0;
    act(() => { gestureId = onGestureStart(); });
    await user.click(screen.getByRole("button", { name: "player A" }));
    expect(mockViewportProps?.sceneId).toBe(first.id);
    act(() => {
      onMoves([{ id: "player", x: 44, y: 3 }], gestureId);
      onGestureEnd(gestureId);
    });
    expect(store.getState().pendingOps).toHaveLength(1);
    expect(store.getState().pendingOps[0]).toMatchObject({ op: "update_entity", scene_id: "scene-b", entity_id: "player" });
    expect(document2D(store).scenes[0]).toEqual(first);
    expect(document2D(store).scenes[1].entities.find((entity) => entity.id === "player")?.transform2d)
      .toMatchObject({ x: 44, y: 3 });
    const after = structuredClone(document2D(store));
    act(() => store.getState().undo());
    expect(document2D(store)).toEqual(fixture);
    act(() => store.getState().redo());
    expect(document2D(store)).toEqual(after);
  });
});

it.each([
  ["delete", "{Delete}", "remove_entity"],
  ["duplicate", "{Control>}d{/Control}", "duplicate_entity"],
  ["nudge", "{ArrowRight}", "update_entity"]
])("targets only B/player through the viewport %s command (E1)", async (_kind, keys, operation) => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    await user.click(screen.getByRole("button", { name: "player B" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard(keys);
    expect(store.getState().pendingOps).toHaveLength(1);
    expect(store.getState().pendingOps[0]).toMatchObject({ op: operation, scene_id: "scene-b", entity_id: "player" });
    expect(document2D(store).scenes[0]).toEqual(first);
  });
});

it("copies only the selected scene's player when another scene reuses that entity ID (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    const secondCount = fixture.scenes[1].entities.length;
    await user.click(screen.getByRole("button", { name: "player B" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Control>}c{/Control}{Control>}v{/Control}");
    const added = store.getState().pendingOps.filter((op) => op.op === "add_entity");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ op: "add_entity", scene_id: "scene-b", entity: { name: "player B" } });
    expect(document2D(store).scenes[0]).toEqual(first);
    expect(document2D(store).scenes[1].entities).toHaveLength(secondCount + 1);
  });
});

it("pastes into the active empty scene after its header clears entity selection (E9)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    await user.click(screen.getByRole("button", { name: "player A" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Control>}c{/Control}");
    await user.click(screen.getByRole("button", { name: "Scene Scene B" }));
    expect(store.getState().selectedIds).toEqual([]);
    expect(mockViewportProps?.sceneId).toBe("scene-b");
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Control>}v{/Control}");
    expect(store.getState().pendingOps).toHaveLength(1);
    expect(store.getState().pendingOps[0]).toMatchObject({ op: "add_entity", scene_id: "scene-b", entity: { name: "player A" } });
    expect(document2D(store).scenes[0]).toEqual(first);
    expect(document2D(store).scenes[1].entities).toHaveLength(1);
  }, true);
});


it("keeps viewport selection in its rendered scene instead of resolving the first matching entity ID (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ store }) => {
    await user.click(screen.getByRole("button", { name: "Scene Scene B" }));
    const viewport = mockViewportProps;
    if (!viewport) { throw new Error("Actual editor viewport is missing"); }
    act(() => viewport.onSelect("player", false));
    expect(mockViewportProps?.sceneId).toBe("scene-b");
    expect(store.getState().selectedIds).toEqual(["player"]);
    expect(screen.getByRole("button", { name: "player A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "player B" })).toHaveAttribute("aria-pressed", "true");
  });
});

it("does not attach a cross-scene clipboard child to an unrelated same-ID parent (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const sourceScene = fixture.scenes[0];
    const parent = sourceScene.entities.find((entity) => entity.id !== "player" && !entity.parentId);
    if (!parent) { throw new Error("Clipboard fixture requires a parent"); }
    act(() => store.getState().apply([
      { op: "update_entity", scene_id: sourceScene.id, entity_id: "player", set: { parentId: parent.id } },
      { op: "remove_entity", scene_id: "scene-b", entity_id: "player", children: "remove" }
    ]));
    const first = structuredClone(document2D(store).scenes[0]);
    await user.click(screen.getByRole("button", { name: "player A" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Control>}c{/Control}");
    await user.click(screen.getByRole("button", { name: "Scene Scene B" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Control>}v{/Control}");
    const additions = store.getState().pendingOps.filter((op) => op.op === "add_entity");
    expect(additions).toHaveLength(1);
    expect(additions[0]).toMatchObject({ scene_id: "scene-b", entity: { name: "player A" } });
    if (additions[0].op !== "add_entity") { throw new Error("Clipboard did not add an entity"); }
    expect(additions[0].entity).not.toHaveProperty("parentId");
    expect(document2D(store).scenes[0]).toEqual(first);
  });
});


it("retains the explicit scene when navigating from an actual console entity link (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const consoleStore = getGameConsoleStore(fixture.id);
    try {
      act(() => {
        consoleStore.getState().clear();
        consoleStore.getState().append({ level: "log", source: "runtime", message: "Selected scene B player",
          sceneId: "scene-b", entityId: "player" });
        getGamePanelLayoutStore(useAuth.getState().user?.id ?? null).getState().dispatch({ type: "reveal", panelId: "console" });
      });
      await user.click(await screen.findByRole("button", { name: "Select player B" }));
      expect(mockViewportProps?.sceneId).toBe("scene-b");
      expect(store.getState().selectedIds).toEqual(["player"]);
      expect(screen.getByRole("button", { name: "player A" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "player B" })).toHaveAttribute("aria-pressed", "true");
    } finally { act(() => consoleStore.getState().clear()); }
  });
});


it("frames the selected entity in scene B instead of the first scene's same-ID entity (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture }) => {
    const player = fixture.scenes[1].entities.find((entity) => entity.id === "player");
    if (!player) { throw new Error("Second scene fixture player is missing"); }
    await user.click(screen.getByRole("button", { name: "player B" }));
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("f");
    expect(mockCamera).toHaveBeenLastCalledWith({ x: player.transform2d.x, y: player.transform2d.y, zoom: 1 });
  });
});

it("clears a deleted scene's selection instead of retargeting its entity ID into scene A (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    const first = structuredClone(fixture.scenes[0]);
    await user.click(screen.getByRole("button", { name: "player B" }));
    act(() => store.getState().apply([{ op: "remove_scene", scene_id: "scene-b" }]));
    expect(store.getState().selectedIds).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Editor viewport" }));
    await user.keyboard("{Delete}");
    expect(store.getState().pendingOps).toEqual([{ op: "remove_scene", scene_id: "scene-b" }]);
    expect(document2D(store).scenes[0]).toEqual(first);
  });
});


it("selects a newly added scene-local entity through the actual hierarchy menu (E1)", async () => {
  const user = userEvent.setup();
  await withSceneLocalPlayers(async ({ store }) => {
    await user.click(screen.getByRole("button", { name: "Scene Scene B" }));
    await user.click(screen.getByRole("button", { name: "Add entity to Scene B" }));
    await user.click(within(screen.getByRole("menu", { name: "Add game entity" })).getByText("Empty"));
    const addition = store.getState().pendingOps.find((op) => op.op === "add_entity");
    if (!addition || addition.op !== "add_entity") { throw new Error("Hierarchy did not add an entity"); }
    expect(addition.scene_id).toBe("scene-b");
    expect(store.getState().selectedIds).toEqual([addition.entity.id]);
    expect(store.getState().selectedSceneId).toBe("scene-b");
    expect(mockViewportProps?.sceneId).toBe("scene-b");
    expect(screen.getByRole("button", { name: "Empty" })).toHaveAttribute("aria-pressed", "true");
  });
});

it("qualifies paused viewport selection with its rendered runtime scene (E1)", async () => {
  await withSceneLocalPlayers(async ({ fixture, store }) => {
    mockPlayDocument = fixture;
    mockPlaySceneId = "scene-b";
    act(() => store.getState().selectMany([]));
    // Force a real editor subscription update while keeping the editor's entry scene selected.
    act(() => store.getState().select("camera"));
    const viewport = mockViewportProps;
    if (!viewport) { throw new Error("Paused viewport is missing"); }
    expect(viewport.sceneId).toBe("scene-b");
    expect(viewport.paused).toBe(true);
    act(() => viewport.onSelect("player", false));
    expect(store.getState().selectedSceneId).toBe("scene-b");
    expect(screen.getByRole("button", { name: "player A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "player B" })).toHaveAttribute("aria-pressed", "true");
  });
});
