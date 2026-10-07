import { type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../__mocks__/themeMock";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import GameEditor from "../GameEditor";
import type GameViewport from "../viewport2d/GameViewport";
import type GameInspector from "../panels/inspector/GameInspector";
import type GameScriptPane from "../panels/scripts/GameScriptPane";
import type { ScriptFailure } from "../useGamePlaySession";

const mockDocument = createTopDownRoomGame("controller-replay");
const mockFailure: ScriptFailure = { message: "Game script [\"room\",\"player\",0] failed", entityId: "player", tick: 12 };
const mockReplay = jest.fn(async () => undefined);
let mockPlayDocument: typeof mockDocument | null = mockDocument;
let mockHostFailure: ScriptFailure | null = null;
let mockDiagnosticFailure: ScriptFailure | null = null;
const mockServer = { document: mockDocument, game: { id: mockDocument.id, name: "Controller game", draftUpdatedAt: "2026-01-01T00:00:00.000Z" } };
const mockInvalidate = jest.fn(async () => undefined);

jest.mock("../../../trpc/client", () => ({
  trpc: {
    games: {
      getDraft: { useQuery: () => ({ data: mockServer, isPending: false }) },
      revisions: { useQuery: () => ({ data: [] }) },
      draftChanges: { useQuery: () => ({ data: [] }) }
    },
    useUtils: () => ({ games: {
      getDraft: { invalidate: mockInvalidate }, revisions: { invalidate: mockInvalidate }, draftChanges: { invalidate: mockInvalidate }
    } })
  },
  trpcClient: { games: {} }
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({ useDocumentConflicts: () => ({ items: [], accept: jest.fn(), discard: jest.fn() }) }));
jest.mock("../useGamePlaySession", () => ({
  ...jest.requireActual<typeof import("../useGamePlaySession")>("../useGamePlaySession"),
  useGamePlaySession: () => ({
    canvasRef: { current: null }, keysRef: { current: new Set() }, newlyPressedRef: { current: new Set() },
    playing: false, playDocument: mockPlayDocument, playState: { tick: 11, score: 0, won: false, sceneId: mockDocument.entrySceneId },
    backend: "Test", error: null, setError: jest.fn(), scriptError: mockHostFailure, setScriptError: jest.fn(), frame: null,
    onViewportAspect: jest.fn(), onCamera: jest.fn(), resetCamera: jest.fn(), step: jest.fn(), beginPlay: jest.fn(), stop: jest.fn(),
    save: jest.fn(), load: jest.fn(), replayBeforeError: mockReplay, runtimeEntities: []
  })
}));
jest.mock("../panels/scripts/useGameScriptDiagnostics", () => ({
  useGameScriptDiagnostics: () => ({ run: jest.fn(), running: false, summary: "Diagnostic completed", error: mockDiagnosticFailure, byEntity: [] })
}), { virtual: true });
jest.mock("../viewport2d/GameViewport", () => ({ __esModule: true, default: ({ onKeyDown }: ComponentProps<typeof GameViewport>) => <canvas aria-label="Editor viewport" role="button" tabIndex={0} onKeyDown={onKeyDown} /> }));
jest.mock("../panels/inspector/GameInspector", () => ({
  __esModule: true, default: ({ onEditScript }: ComponentProps<typeof GameInspector>) => <button
    onClick={() => onEditScript(mockDocument.entrySceneId, "player", 0)}>Edit player script</button>
}));
jest.mock("../panels/inspector/GameRuntimeInspector", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/authoring/GameAuthoringPreview", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/changes/GameChanges", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/agent/GameAgentPanel", () => ({ __esModule: true, default: () => null }));
jest.mock("../panels/scripts/GameScriptPane", () => ({
  __esModule: true, default: ({ error, onReplay }: ComponentProps<typeof GameScriptPane>) => <>
    <p>{error?.message}</p>
    {onReplay && <button onClick={onReplay}>Replay displayed error</button>}
  </>
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayDocument = mockDocument;
  mockHostFailure = null;
  mockDiagnosticFailure = null;
  const player = mockDocument.scenes[0].entities.find((entity) => entity.id === "player");
  if (!player) { throw new Error("Controller fixture player missing"); }
  player.behaviors = [{ kind: "script", source: "function update() {}", maxCommands: 16, maxTickMs: 8 }];
  getGameDraftStore(mockDocument.id).getState().load(mockDocument, mockServer.game.draftUpdatedAt);
});

it.each(["active play", "independent diagnostic"])("replays active history for the displayed %s error", async (provenance) => {
  const user = userEvent.setup();
  if (provenance === "active play") { mockHostFailure = mockFailure; }
  else { mockDiagnosticFailure = mockFailure; }
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Edit player script" }));
  expect(screen.getByText(mockFailure.message)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Replay displayed error" }));
  expect(mockReplay).toHaveBeenCalledTimes(1);
  expect(mockReplay).toHaveBeenCalledWith(mockFailure);
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

it("keeps inspector-button undo and delete outside the editor keyboard scope", async () => {
  const user = userEvent.setup();
  mockPlayDocument = null;
  const store = getGameDraftStore(mockDocument.id);
  store.getState().select("player");
  store.getState().apply([{ op: "update_entity", scene_id: mockDocument.entrySceneId, entity_id: "player", set: { transform2d: { x: 1 } } }]);
  const history = store.temporal.getState().pastStates.length;
  expect(history).toBeGreaterThan(0);
  render(<ThemeProvider theme={mockTheme}><GameEditor refId={mockDocument.id} active /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Edit player script" }));
  await user.keyboard("{Control>}z{/Control}{Delete}");
  const player = document2D(store).scenes[0].entities.find((entity) => entity.id === "player");
  expect(player?.transform2d.x).toBe(1);
  expect(store.temporal.getState().pastStates).toHaveLength(history);
  expect(store.getState().pendingOps).toHaveLength(1);
});

function document2D(store: ReturnType<typeof getGameDraftStore>) {
  const document = store.getState().document;
  if (!document || document.schemaVersion === 3) { throw new Error("Expected 2D fixture document"); }
  return document;
}
