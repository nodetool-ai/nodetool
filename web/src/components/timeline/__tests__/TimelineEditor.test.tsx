/**
 * TimelineEditor shell tests.
 *
 * Covers loading / not-found / loaded states and keyboard resize of the
 * tracks drag handle.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
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
jest.mock("../TimelineAssetPanel", () => ({
  TimelineAssetPanel: () =>
    React.createElement("div", { "data-testid": "timeline-asset-panel" }, "Assets")
}));

// TopBarPrompt pulls in ImageModelSelect → useImageModelsByProvider, which
// calls TanStack Query. The editor shell tests don't render a
// QueryClientProvider, so swap it for a no-op.
jest.mock("../TopBarPrompt", () => ({
  TopBarPrompt: () =>
    React.createElement("div", { "data-testid": "topbar-prompt" }, "Prompt")
}));

import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useTimeline,
  useTimelines,
  useCreateTimeline
} from "../../../hooks/useTimelineSequence";
import { useWorkflowFreshnessCheck } from "../../../hooks/timeline/useWorkflowFreshnessCheck";

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockRefetch = jest.fn();
let mockSearchParams: URLSearchParams;
const mockCreateMutate = jest.fn();
const mockCreateReset = jest.fn();

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
      expect(screen.getByText("seq-1")).toBeInTheDocument();
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
    const sequence = { id: "seq-1", name: "My Sequence" };

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

      expect(screen.getByText("My Sequence")).toBeInTheDocument();
      expect(screen.getByText("Preview")).toBeInTheDocument();
      expect(screen.getByText("Inspector")).toBeInTheDocument();
      expect(screen.getByText("Tracks")).toBeInTheDocument();
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
  });
});
