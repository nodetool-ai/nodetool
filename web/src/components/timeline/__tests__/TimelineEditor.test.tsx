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
  useNavigate: jest.fn()
}));

// ── Data hook mock ───────────────────────────────────────────────────────────

jest.mock("../../../hooks/useTimelineSequence", () => ({
  useTimeline: jest.fn()
}));

import { useParams, useNavigate } from "react-router-dom";
import { useTimeline } from "../../../hooks/useTimelineSequence";

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

const renderEditor = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineEditor />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  (useParams as jest.Mock).mockReturnValue({ sequenceId: "seq-1" });
  (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TimelineEditor", () => {
  describe("loading state", () => {
    it("shows a loading spinner in the preview region", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false
      });

      renderEditor();

      expect(screen.getByText("Loading sequence…")).toBeInTheDocument();
    });

    it("does not show not-found UI while loading", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false
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
        isError: false
      });

      renderEditor();

      expect(screen.getByText("Sequence not found")).toBeInTheDocument();
    });

    it("shows EmptyState when the query returns an error", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true
      });

      renderEditor();

      expect(screen.getByText("Sequence not found")).toBeInTheDocument();
    });

    it("navigates to /dashboard when the action button is clicked", () => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false
      });

      renderEditor();

      fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("loaded state", () => {
    const sequence = { id: "seq-1", name: "My Sequence" };

    beforeEach(() => {
      (useTimeline as jest.Mock).mockReturnValue({
        data: sequence,
        isLoading: false,
        isError: false
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
        isError: false
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
