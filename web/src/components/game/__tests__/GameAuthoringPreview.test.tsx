import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { applyAnyGameOps, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { gameAuthoring, type GameDocument } from "@nodetool-ai/protocol";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";
import GameAuthoringPreview from "../panels/authoring/GameAuthoringPreview";
import mockTheme from "../../../__mocks__/themeMock";

const mockPreview = jest.fn();
const mockApply = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
jest.mock("../../../trpc/client", () => ({
  trpcClient: { games: { previewAuthoring: { mutate: (...args: unknown[]) => mockPreview(...args) },
    applyAuthoring: { mutate: (...args: unknown[]) => mockApply(...args) } } },
  trpc: { useUtils: () => ({ games: { getDraft: { invalidate: mockInvalidate }, draftChanges: { invalidate: mockInvalidate } } }) }
}));

function fixture(): GameDocument {
  const document = createTopDownRoomGame("authoring-preview");
  return { ...document, authoring: gameAuthoring.parse({ version: 1, program: { source: "return inputs.document", inputs: {}, seed: 1 },
    baseline: document, overrides: [], detached: [], suppressions: [] }) };
}

beforeEach(() => { jest.clearAllMocks(); });

it("previews without changing the draft and applies only after an explicit action", async () => {
  const document = fixture();
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "original");
  const candidate = { base_updated_at: "original", base_digest: "a".repeat(64), digest: "b".repeat(64), program: document.authoring?.program };
  mockPreview.mockResolvedValue({ candidate, document, conflicts: [], affected_entities: ["coin"], changed_dependencies: ["sprite"], restart_required: true });
  mockApply.mockResolvedValue({ game: { draftUpdatedAt: "rebuilt" }, document });
  const flush = jest.fn(async () => undefined);
  render(<ThemeProvider theme={mockTheme}><GameAuthoringPreview gameId={document.id} document={document} flush={flush} onHighlight={jest.fn()} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Retained construction"));
  await user.click(screen.getByRole("button", { name: "Preview rebuild" }));
  await screen.findByText("Changed entities: coin");
  expect(screen.getByText("Changed dependencies: sprite")).toBeInTheDocument();
  expect(screen.getByText("Restart play to use this rebuild.")).toBeInTheDocument();
  expect(flush).toHaveBeenCalledTimes(1);
  expect(store.getState().document).toBe(document);
  expect(mockApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Apply rebuild" }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith({ id: document.id, candidate }));
  await waitFor(() => expect(store.getState().baseUpdatedAt).toBe("rebuilt"));
});

it("blocks conflicts and rejects a preview after the draft changes", async () => {
  const document = fixture();
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "original");
  const candidate = { base_updated_at: "original", base_digest: "a".repeat(64), digest: "b".repeat(64), program: document.authoring?.program };
  mockPreview.mockResolvedValue({ candidate, document, conflicts: [{ sceneId: "level", entityId: "coin", code: "removed", message: "Referenced entity was removed" }],
    affected_entities: ["coin"], changed_dependencies: [], restart_required: true });
  render(<ThemeProvider theme={mockTheme}><GameAuthoringPreview gameId={document.id} document={document} flush={jest.fn(async () => undefined)} onHighlight={jest.fn()} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Retained construction"));
  await user.click(screen.getByRole("button", { name: "Preview rebuild" }));
  await screen.findByText("level/coin: Referenced entity was removed");
  expect(screen.getByRole("button", { name: "Apply rebuild" })).toBeDisabled();
  act(() => store.getState().load(document, "changed"));
  await screen.findByText("The draft changed. Preview the rebuild again.");
  expect(mockApply).not.toHaveBeenCalled();
});

it("restores a suppressed generated entity only when requested", async () => {
  const document = fixture();
  const scene = document.scenes[0];
  const entityId = scene.entities[0].id;
  const suppressed = applyAnyGameOps(document, [{ op: "remove_entity", scene_id: scene.id, entity_id: entityId }]);
  const store = getGameDraftStore(document.id);
  store.getState().load(suppressed, "original");
  render(<ThemeProvider theme={mockTheme}><GameAuthoringPreview gameId={document.id} document={suppressed}
    flush={jest.fn(async () => undefined)} onHighlight={jest.fn()} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Retained construction"));
  expect(screen.getByText(`${scene.id}/${entityId}: Suppressed`)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: `Restore ${entityId}` }));
  expect(store.getState().document?.authoring?.suppressions).toHaveLength(0);
  expect(store.getState().document?.scenes[0].entities.some((entity) => entity.id === entityId)).toBe(true);
  expect(mockApply).not.toHaveBeenCalled();
});

it("keeps a local edit made during apply as an override of the accepted new baseline", async () => {
  const document = fixture();
  if (!document.authoring) { throw new Error("Fixture has no authoring"); }
  const scene = document.scenes[0];
  const entity = scene.entities[0];
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "original");
  const { authoring: _authoring, ...native } = document;
  const baseline = { ...native, scenes: document.scenes.map((entry) => ({ ...entry,
    entities: entry.entities.map((value) => value.id === entity.id ? { ...value, transform2d: { ...value.transform2d, y: value.transform2d.y + 3 } } : value) })) };
  const rebuilt: GameDocument = { ...baseline, authoring: gameAuthoring.parse({ ...document.authoring, baseline,
    program: { ...document.authoring.program, source: "return inputs.next" } }) };
  const candidate = { base_updated_at: "original", base_digest: "a".repeat(64), digest: "b".repeat(64), program: rebuilt.authoring?.program };
  mockPreview.mockResolvedValue({ candidate, document: rebuilt, conflicts: [], affected_entities: [entity.id], changed_dependencies: [], restart_required: true });
  let complete!: (result: { game: { draftUpdatedAt: string }; document: GameDocument }) => void;
  mockApply.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  render(<ThemeProvider theme={mockTheme}><GameAuthoringPreview gameId={document.id} document={document}
    flush={jest.fn(async () => undefined)} onHighlight={jest.fn()} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Retained construction"));
  await user.click(screen.getByRole("button", { name: "Preview rebuild" }));
  await screen.findByText(`Changed entities: ${entity.id}`);
  await user.click(screen.getByRole("button", { name: "Apply rebuild" }));
  act(() => store.getState().apply([{ op: "update_entity", scene_id: scene.id, entity_id: entity.id,
    set: { transform2d: { x: entity.transform2d.x + 1 } } }]));
  await act(async () => complete({ game: { draftUpdatedAt: "rebuilt" }, document: rebuilt }));
  const accepted = store.getState().document;
  if (!accepted || accepted.schemaVersion === 3) { throw new Error("Fixture changed dimensions"); }
  const edited = accepted.scenes[0].entities.find((value) => value.id === entity.id);
  expect(edited?.transform2d.x).toBe(entity.transform2d.x + 1);
  expect(edited?.transform2d.y).toBe(entity.transform2d.y + 3);
  expect(accepted.authoring?.program).toEqual(rebuilt.authoring?.program);
  expect(accepted.authoring?.baseline).toEqual(rebuilt.authoring?.baseline);
  expect(accepted.authoring?.overrides).toContainEqual({ sceneId: scene.id, entityId: entity.id, path: ["transform2d", "x"], value: entity.transform2d.x + 1 });
  expect(store.getState().pendingOps.length).toBeGreaterThan(0);
  expect(applyAnyGameOps(rebuilt, store.getState().pendingOps)).toEqual(accepted);
});

it("stages a removed entity conflict and keeps its local edit only after explicit detach", async () => {
  const document = fixture();
  if (!document.authoring) { throw new Error("Fixture has no authoring"); }
  const scene = document.scenes[0];
  const entity = scene.entities.find((value) => value.behaviors.some((behavior) => behavior.kind === "collectible"));
  if (!entity) { throw new Error("Fixture has no collectible"); }
  const store = getGameDraftStore(document.id);
  store.getState().load(document, "original");
  const { authoring: _authoring, ...native } = document;
  const baseline = { ...native, scenes: document.scenes.map((entry) => ({ ...entry, entities: entry.entities.filter((value) => value.id !== entity.id) })) };
  const rebuilt: GameDocument = { ...baseline, authoring: gameAuthoring.parse({ ...document.authoring, baseline,
    program: { ...document.authoring.program, source: "return inputs.next" } }) };
  const candidate = { base_updated_at: "original", base_digest: "a".repeat(64), digest: "b".repeat(64), program: rebuilt.authoring?.program };
  mockPreview.mockResolvedValue({ candidate, document: rebuilt, conflicts: [], affected_entities: [entity.id], changed_dependencies: [], restart_required: true });
  let complete!: (result: { game: { draftUpdatedAt: string }; document: GameDocument }) => void;
  mockApply.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  render(<ThemeProvider theme={mockTheme}><GameAuthoringPreview gameId={document.id} document={document}
    flush={jest.fn(async () => undefined)} onHighlight={jest.fn()} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByText("Retained construction"));
  await user.click(screen.getByRole("button", { name: "Preview rebuild" }));
  await screen.findByText(`Changed entities: ${entity.id}`);
  await user.click(screen.getByRole("button", { name: "Apply rebuild" }));
  act(() => store.getState().apply([{ op: "update_entity", scene_id: scene.id, entity_id: entity.id,
    set: { transform2d: { x: entity.transform2d.x + 1 } } }]));
  await act(async () => complete({ game: { draftUpdatedAt: "rebuilt" }, document: rebuilt }));
  expect(store.getState().document).toBe(rebuilt);
  expect(store.getState().pendingOps).toHaveLength(0);
  await screen.findByRole("dialog", { name: "Resolve edits made during rebuild" });
  await user.click(screen.getByRole("button", { name: `Keep ${entity.id} detached` }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const accepted = store.getState().document;
  if (!accepted || accepted.schemaVersion === 3) { throw new Error("Fixture changed dimensions"); }
  expect(accepted.scenes[0].entities.find((value) => value.id === entity.id)?.transform2d.x).toBe(entity.transform2d.x + 1);
  expect(accepted.authoring?.detached).toContainEqual({ sceneId: scene.id, entityId: entity.id });
  expect(accepted.authoring?.baseline).toEqual(rebuilt.authoring?.baseline);
  expect(applyAnyGameOps(rebuilt, store.getState().pendingOps)).toEqual(accepted);
});
