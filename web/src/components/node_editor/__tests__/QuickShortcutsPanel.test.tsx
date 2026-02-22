/**
 * Tests for QuickShortcutsPanel component
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { QuickShortcutsPanel } from "../QuickShortcutsPanel";

jest.mock("../../../contexts/NodeContext", () => {
  const actual = jest.requireActual("../../../contexts/NodeContext");
  return {
    ...actual,
    useNodes: jest.fn()
  };
});

import { useNodes } from "../../../contexts/NodeContext";

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("QuickShortcutsPanel", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock state - useNodes is called with a selector function
    (useNodes as jest.Mock).mockReturnValue({
      selectedNodeCount: 0,
      nodes: []
    });
  });

  describe("Rendering", () => {
    it("should render when open is true", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("Quick Shortcuts")).toBeInTheDocument();
    });

    it("should display close button", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      const closeButton = screen.getByLabelText("Close shortcuts panel");
      expect(closeButton).toBeInTheDocument();
    });

    it("should display footer hint text", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      // Check for "to close" text being present
      expect(screen.getByText(/to close/i)).toBeInTheDocument();
    });
  });

  describe("Context badges", () => {
    it("should show 'Multi-Select' badge when multiple nodes are selected", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 3,
        nodes: [
          { id: "1", selected: true },
          { id: "2", selected: true },
          { id: "3", selected: true }
        ]
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("Multi-Select")).toBeInTheDocument();
    });

    it("should show '1 Selected' badge when one node is selected", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 1,
        nodes: [{ id: "1", selected: true }]
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("1 Selected")).toBeInTheDocument();
    });

    it("should show 'Empty' badge when workflow has no nodes", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 0,
        nodes: []
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("Empty")).toBeInTheDocument();
    });

    it("should not show context badge in default context", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 0,
        nodes: [{ id: "1", selected: false }]
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      // Should not have any context badge
      expect(screen.queryByText("Multi-Select")).not.toBeInTheDocument();
      expect(screen.queryByText("1 Selected")).not.toBeInTheDocument();
      expect(screen.queryByText("Empty")).not.toBeInTheDocument();
    });
  });

  describe("Shortcuts display", () => {
    it("should display essential shortcuts", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      // Essential shortcuts should always be visible
      expect(screen.getByText("Save Workflow")).toBeInTheDocument();
      expect(screen.getByText("Find in Workflow")).toBeInTheDocument();
      expect(screen.getByText("Fit View")).toBeInTheDocument();
    });

    it("should display alignment shortcuts when multiple nodes selected", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 3,
        nodes: [
          { id: "1", selected: true },
          { id: "2", selected: true },
          { id: "3", selected: true }
        ]
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("Align")).toBeInTheDocument();
      expect(screen.getByText("Align Left")).toBeInTheDocument();
      expect(screen.getByText("Distribute Horizontally")).toBeInTheDocument();
    });

    it("should display selection shortcuts in multi-select context", () => {
      (useNodes as jest.Mock).mockReturnValue({
        selectedNodeCount: 2,
        nodes: [
          { id: "1", selected: true },
          { id: "2", selected: true }
        ]
      });

      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText("Selection Shortcuts")).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("should call onClose when close button is clicked", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      const closeButton = screen.getByLabelText("Close shortcuts panel");
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when Escape key is pressed", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      const panel = screen.getByText("Quick Shortcuts").closest("div");
      if (panel) {
        fireEvent.keyDown(panel, { key: "Escape", code: "Escape" });
      }

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("should be accessible via Escape key", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      const panel = screen.getByText("Quick Shortcuts").closest("div");
      expect(panel).toBeInTheDocument();

      if (panel) {
        fireEvent.keyDown(panel, { key: "Escape" });
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should have accessible close button label", () => {
      renderWithTheme(
        <QuickShortcutsPanel open={true} onClose={mockOnClose} />
      );

      const closeButton = screen.getByLabelText("Close shortcuts panel");
      expect(closeButton).toBeInTheDocument();
    });
  });
});
