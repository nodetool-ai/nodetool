import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../__mocks__/themeMock";
import GameDraftRecovery from "../GameDraftRecovery";
import { getGameDraftStore } from "../../../stores/game/GameDraftStore";

const mockDocument = createTopDownRoomGame("recovery");
const mockRestore = jest.fn();
const mockGetDraft = jest.fn();
const mockGetPublished = jest.fn();
const mockSetDraft = jest.fn();
const mockSetPublished = jest.fn();
const mockHistoryInvalidate = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    games: {
      get: { useQuery: () => ({ data: { game: { draftUpdatedAt: "saved-token" } } }) },
      revisions: { useQuery: () => ({ data: [{ revision: "published", modifiedAt: 0, current: true, message: "Published room" }] }) }
    },
    useUtils: () => ({ games: {
      getDraft: { setData: mockSetDraft },
      get: { setData: mockSetPublished }, draftChanges: { invalidate: mockHistoryInvalidate }
    } })
  },
  trpcClient: { games: {
    restoreDraft: { mutate: (input: unknown) => mockRestore(input) },
    getDraft: { query: (input: unknown) => mockGetDraft(input) },
    get: { query: (input: unknown) => mockGetPublished(input) }
  } }
}));

beforeEach(() => {
  jest.clearAllMocks();
  getGameDraftStore(mockDocument.id).setState({ document: null });
  mockRestore.mockResolvedValue({ document: mockDocument, game: { draftUpdatedAt: "restored-token" } });
  mockGetDraft.mockResolvedValue({ document: mockDocument, game: { draftUpdatedAt: "winning-token" } });
  mockGetPublished.mockResolvedValue({ document: mockDocument, game: { draftUpdatedAt: "winning-token" } });
  mockHistoryInvalidate.mockResolvedValue(undefined);
});

async function confirmRestore(): Promise<void> {
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameDraftRecovery refId={mockDocument.id} /></ThemeProvider>);
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
}

it("refreshes the failed draft query after a competing writer wins, before offering recovery again", async () => {
  mockRestore.mockRejectedValue(new Error("Game draft was modified concurrently"));
  await confirmRestore();
  await waitFor(() => expect(mockSetDraft).toHaveBeenCalledWith({ id: mockDocument.id },
    { document: mockDocument, game: { draftUpdatedAt: "winning-token" } }));
  expect(mockRestore).toHaveBeenCalledTimes(1);
});

it("blocks another recovery when the direct draft read fails over the network", async () => {
  mockRestore.mockRejectedValue(new Error("Game draft was modified concurrently"));
  mockGetDraft.mockRejectedValue(new Error("Network unavailable"));
  await confirmRestore();
  await screen.findByText("Could not refresh the draft after the failed restore. Reload the game before trying again.");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Restore to draft" })).toBeDisabled();
  expect(mockRestore).toHaveBeenCalledTimes(1);
});

it("refreshes the token only when a direct read confirms the draft is still missing", async () => {
  mockRestore.mockRejectedValue(new Error("Game draft was modified concurrently"));
  mockGetDraft.mockRejectedValue({ data: { code: "PRECONDITION_FAILED" } });
  await confirmRestore();
  await waitFor(() => expect(mockSetPublished).toHaveBeenCalledWith({ id: mockDocument.id },
    { document: mockDocument, game: { draftUpdatedAt: "winning-token" } }));
  expect(mockGetPublished.mock.invocationCallOrder[0]).toBeLessThan(mockGetDraft.mock.invocationCallOrder[0]);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Restore to draft" })).toBeEnabled();
});

it("does not offer another restore when the mutation succeeded but the editor refresh failed", async () => {
  mockHistoryInvalidate.mockRejectedValue(new Error("Network unavailable"));
  await confirmRestore();
  await screen.findByText("Draft restored, but the editor could not refresh. Reload the game to continue.");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Restore to draft" })).toBeDisabled();
  expect(screen.getByText("Draft restored")).toBeInTheDocument();
  expect(mockHistoryInvalidate).toHaveBeenCalledWith({ id: mockDocument.id }, undefined, { throwOnError: true });
  expect(mockRestore).toHaveBeenCalledTimes(1);
});

it("X2 exports rejected edits and undo history before a confirmed published restore", async () => {
  const store = getGameDraftStore(mockDocument.id);
  store.getState().load(mockDocument, "saved-token");
  store.getState().apply([{ op: "update_scene", scene_id: mockDocument.entrySceneId, set: { name: "Only local copy" } }]);
  store.getState().setSaving(store.getState().pendingOps.length);
  store.getState().failSave("Draft source unavailable");
  const local = store.getState();
  let exportedBlob: Blob | undefined;
  URL.createObjectURL = jest.fn((blob: Blob) => { exportedBlob = blob; return "blob:local-draft"; });
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const user = userEvent.setup();
  render(<ThemeProvider theme={mockTheme}><GameDraftRecovery refId={mockDocument.id} /></ThemeProvider>);
  expect(screen.getByRole("button", { name: "Restore to draft" })).toBeDisabled();
  expect(store.getState().document).toEqual(local.document);
  expect(store.getState().commandHistory).toEqual(local.commandHistory);
  await user.click(screen.getByRole("button", { name: "Export local draft" }));
  expect(click).toHaveBeenCalledTimes(1);
  if (!exportedBlob) { throw new Error("Local draft was not exported"); }
  const blob = exportedBlob;
  const exportedText = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  expect(JSON.parse(exportedText)).toEqual({ document: local.document, pendingOps: local.pendingOps,
    commandHistory: local.commandHistory, baseUpdatedAt: local.baseUpdatedAt });
  await user.click(screen.getByRole("button", { name: "Restore to draft" }));
  expect(mockRestore).not.toHaveBeenCalled();
  expect(store.getState().pendingOps).toEqual(local.pendingOps);
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore to draft" }));
  await waitFor(() => expect(mockRestore).toHaveBeenCalledTimes(1));
  click.mockRestore();
});
