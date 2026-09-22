/**
 * TimelineEditor shell tests.
 *
 * Covers loading / not-found / loaded states and keyboard resize of the
 * tracks drag handle.
 */

import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeSequence } from "@nodetool-ai/timeline";
import mockTheme from "../../../__mocks__/themeMock";
import { TimelineEditor } from "../TimelineEditor";

// ── Router mocks ────────────────────────────────────────────────────────────

jest.mock("react-router-dom", () => ({
  useParams: jest.fn(),
  useNavigate: jest.fn(),
  useSearchParams: jest.fn()
}));

// ── Data hook mock ───────────────────────────────────────────────────────────

jest.mock("../../../hooks/useTimelineSequence", () => ({
  useTimeline: jest.fn(),
  useTimelines: jest.fn(),
  useCreateTimeline: jest.fn()
}));
jest.mock("../../../hooks/timeline/useWorkflowFreshnessCheck", () => ({
  useWorkflowFreshnessCheck: jest.fn()
}));
jest.mock("../../../hooks/timeline/useGenerateClip", () => ({
  useTimelineGenerationSubscriptions: jest.fn()
}));
jest.mock("../../../hooks/timeline/useLoadTimelineIntoStore", () => ({
  useLoadTimelineIntoStore: jest.fn()
}));
jest.mock("../../../hooks/timeline/useTimelineAutosave", () => ({
  useTimelineAutosave: jest.fn()
}));
jest.mock("../../../utils/timelineBundle", () => ({
  exportTimelineZip: jest.fn()
}));
jest.mock("../../../stores/timeline/TimelineGenerationStore", () => ({
  useGeneratingCount: jest.fn(() => 0),
  useFailedCount: jest.fn(() => 0),
  useGeneratingClipIds: jest.fn(() => []),
  useFailedClipIds: jest.fn(() => [])
}));

// ── TracksRegion mock ────────────────────────────────────────────────────────

jest.mock("../Tracks/TracksRegion", () => ({
  TracksRegion: ({ heightPx }: { heightPx: number }) =>
    React.createElement("div", { "data-testid": "tracks-region", style: { height: heightPx } }, "Tracks")
}));

// ── PreviewArea mock ─────────────────────────────────────────────────────────

jest.mock("../preview/PreviewArea", () => ({
  PreviewArea: () =>
    React.createElement("div", { "data-testid": "preview-area" }, "Preview")
}));

// TopBarPrompt pulls in ImageModelSelect → useImageModelsByProvider, which
// calls TanStack Query. The editor shell tests don't render a
// QueryClientProvider, so swap it for a no-op.
jest.mock("../TopBarPrompt", () => ({
  TopBarPrompt: () =>
    React.createElement("div", { "data-testid": "topbar-prompt" }, "Prompt")
}));

// TranscriptPanel's VoiceCard embeds TTSModelSelect, which queries the TTS
// model list via TanStack Query. Same no-QueryClient constraint as above.
jest.mock("../../properties/TTSModelSelect", () => ({
  __esModule: true,
  default: () =>
    React.createElement("div", { "data-testid": "tts-model-select" }, "TTS")
}));

// The "Save as Asset" folder chooser uses useFolderTree (TanStack Query); no-op
// it for the same no-QueryClientProvider reason as above.
jest.mock("../../assets/SaveToFolderMenu", () => ({
  __esModule: true,
  default: () => null
}));

import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useTimeline,
  useTimelines,
  useCreateTimeline
} from "../../../hooks/useTimelineSequence";
import { useWorkflowFreshnessCheck } from "../../../hooks/timeline/useWorkflowFreshnessCheck";
import { useTimelineAutosave } from "../../../hooks/timeline/useTimelineAutosave";
import { exportTimelineZip } from "../../../utils/timelineBundle";

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockRefetch = jest.fn();
let mockSearchParams: URLSearchParams;
const mockCreateMutate = jest.fn();
const mockCreateReset = jest.fn();
const mockFlushAutosave = jest.fn();

const renderEditor = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineEditor />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRefetch.mockClear();
  mockCreateMutate.mockClear();
  mockCreateReset.mockClear();
  mockSearchParams = new URLSearchParams();
  (useParams as jest.Mock).mockReturnValue({ sequenceId: "seq-1" });
  (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  (useSearchParams as jest.Mock).mockReturnValue([mockSearchParams, jest.fn()]);
  (useWorkflowFreshnessCheck as jest.Mock).mockReturnValue(undefined);
  (useTimelineAutosave as jest.Mock).mockReturnValue({
    flush: mockFlushAutosave
  });
  mockFlushAutosave.mockResolvedValue({
    ok: true,
    updatedAt: "2026-01-01T00:00:01Z"
  });
  (exportTimelineZip as jest.Mock).mockResolvedValue(undefined);
  (useTimelines as jest.Mock).mockReturnValue({ data: [] });
  (useCreateTimeline as jest.Mock).mockReturnValue({
    mutate: mockCreateMutate,
    reset: mockCreateReset,
    isPending: false,
    error: null
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TimelineEditor", () => {
  describe("loading state", () => {
    it("shows a loading spinner in the preview region", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      expect(screen.getByText("Loading sequence…")).toBeInTheDocument();
    });

    it("does not show not-found UI while loading", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      expect(
        screen.queryByText("Sequence not found")
      ).not.toBeInTheDocument();
    });
  });

  describe("not-found / error state", () => {
    it("shows EmptyState with 'Sequence not found' when data is missing", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      expect(screen.getByText("Sequence not found")).toBeInTheDocument();
      expect(screen.getByTestId("tracks-region")).toBeInTheDocument();
    });

    it("shows EmptyState when the query returns an error", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: mockRefetch
      });

      renderEditor();

      expect(screen.getByText("Sequence not found")).toBeInTheDocument();
      expect(screen.getByTestId("tracks-region")).toBeInTheDocument();
    });

    it("calls refetch when Retry is clicked", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      fireEvent.click(screen.getByRole("button", { name: "Retry loading sequence" }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it("shows New sequence and calls create mutation with resolved project id", () => {
      mockSearchParams.set("projectId", "from-url");
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      expect(
        screen.getByRole("button", { name: "Create new sequence" })
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Create new sequence" }));
      expect(mockCreateReset).toHaveBeenCalled();
      expect(mockCreateMutate).toHaveBeenCalledWith(
        { name: "Untitled sequence", projectId: "from-url" },
        expect.any(Object)
      );
    });
  });

  describe("loaded state", () => {
    const sequence = makeSequence({
      id: "seq-1",
      name: "My Sequence"
    });

    beforeEach(() => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: sequence,
        isLoading: false,
        isError: false,
        refetch: mockRefetch
      });
    });

    it("renders all five regions", () => {
      renderEditor();

      expect(screen.getByText("Preview")).toBeInTheDocument();
      // "Inspector" appears both as an inspector tab and as the panel header
      // eyebrow, so target the tab specifically.
      expect(
        screen.getByRole("tab", { name: "Inspector" })
      ).toBeInTheDocument();
      expect(screen.getByText("Tracks")).toBeInTheDocument();
    });

    it("lets the preview fill the middle row when no transcript is present", () => {
      renderEditor();

      expect(screen.getByTestId("preview-area").parentElement).toHaveStyle({
        flex: "1 1 55%"
      });
    });

    it("offers an Assistant tab alongside the Inspector", () => {
      renderEditor();

      expect(
        screen.getByRole("tab", { name: "Inspector" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Assistant" })
      ).toBeInTheDocument();
    });

    it("renders the resize separator with correct ARIA attributes", () => {
      renderEditor();

      const separator = screen.getByRole("separator", {
        name: "Resize tracks panel"
      });
      expect(separator).toHaveAttribute("aria-orientation", "horizontal");
      expect(separator).toHaveAttribute("aria-valuenow");
      expect(separator).toHaveAttribute("aria-valuemin");
      expect(separator).toHaveAttribute("aria-valuemax");
      expect(separator).toHaveAttribute("tabindex", "0");
    });

    it("increases tracks height with ArrowUp keyboard press", () => {
      renderEditor();

      const separator = screen.getByRole("separator", {
        name: "Resize tracks panel"
      });
      const initialHeight = Number(separator.getAttribute("aria-valuenow"));

      fireEvent.keyDown(separator, { key: "ArrowUp" });

      const newHeight = Number(separator.getAttribute("aria-valuenow"));
      expect(newHeight).toBeGreaterThan(initialHeight);
    });

    it("decreases tracks height with ArrowDown keyboard press", () => {
      renderEditor();

      const separator = screen.getByRole("separator", {
        name: "Resize tracks panel"
      });
      const initialHeight = Number(separator.getAttribute("aria-valuenow"));

      fireEvent.keyDown(separator, { key: "ArrowDown" });

      const newHeight = Number(separator.getAttribute("aria-valuenow"));
      expect(newHeight).toBeLessThan(initialHeight);
    });

    it("does not exceed max tracks height on ArrowUp", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: sequence,
        isLoading: false,
        isError: false,
        refetch: mockRefetch
      });

      renderEditor();

      const separator = screen.getByRole("separator", {
        name: "Resize tracks panel"
      });
      const max = Number(separator.getAttribute("aria-valuemax"));

      // Press many times to hit the ceiling
      for (let i = 0; i < 100; i++) {
        fireEvent.keyDown(separator, { key: "ArrowUp" });
      }

      const finalHeight = Number(separator.getAttribute("aria-valuenow"));
      expect(finalHeight).toBeLessThanOrEqual(max);
    });

    it("waits for pending edits to save before exporting the project archive", async () => {
      let finishSave: (
        result:
          | { ok: true; updatedAt: string | null }
          | { ok: false; error: string }
      ) => void = () => {};
      mockFlushAutosave.mockReturnValueOnce(
        new Promise((resolve) => {
          finishSave = resolve;
        })
      );
      renderEditor();

      await userEvent.click(
        screen.getByRole("button", { name: "More timeline actions" })
      );
      await userEvent.click(await screen.findByText("Export project (.zip)"));
      expect(exportTimelineZip).not.toHaveBeenCalled();

      await act(async () => {
        finishSave({
          ok: true,
          updatedAt: "2026-01-01T00:00:01Z"
        });
      });
      await waitFor(() =>
        expect(exportTimelineZip).toHaveBeenCalledWith("seq-1", "My Sequence")
      );
    });

    it("does not export the project archive when saving fails", async () => {
      mockFlushAutosave.mockResolvedValueOnce({
        ok: false,
        error: "save failed"
      });
      renderEditor();

      await userEvent.click(
        screen.getByRole("button", { name: "More timeline actions" })
      );
      await userEvent.click(await screen.findByText("Export project (.zip)"));

      await waitFor(() => expect(mockFlushAutosave).toHaveBeenCalledTimes(1));
      expect(exportTimelineZip).not.toHaveBeenCalled();
    });
  });
});
