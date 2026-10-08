import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../__mocks__/themeMock";
import GameDraftRecovery from "../GameDraftRecovery";

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
