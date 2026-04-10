import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

// Mock tabulator
jest.mock("tabulator-tables", () => ({
  TabulatorFull: jest.fn().mockImplementation(() => ({
    clearSort: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn()
  }))
}));

import TableActions from "../TableActions";
import type { TabulatorFull as Tabulator } from "tabulator-tables";

describe("TableActions", () => {
  const mockTabulator = {
    clearSort: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn()
  } as unknown as Tabulator;

  const mockData = [
    { rownum: 0, col1: "value1", col2: "value2" }
  ];

  const mockOnChangeRows = jest.fn();

  const defaultProps = {
    tabulator: mockTabulator,
    data: mockData,
    selectedRows: [],
    showSelect: false,
    setShowSelect: jest.fn(),
    showRowNumbers: false,
    setShowRowNumbers: jest.fn(),
    editable: true,
    onChangeRows: mockOnChangeRows,
    isListTable: false,
    showResetSortingButton: true,
    showRowNumbersButton: true,
    isModalMode: true,
    canUndo: true,
    canRedo: true,
    onHistoryChange: jest.fn()
  };

  const renderWithTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders table action buttons", () => {
    renderWithTheme(<TableActions {...defaultProps} />);

    // Should have buttons for common actions
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  describe("Accessibility", () => {
    it("has aria-label on Add row button", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const addButton = screen.getByRole("button", { name: /add new row/i });
      expect(addButton).toBeInTheDocument();
      expect(addButton.getAttribute("aria-label")).toBe("Add new row");
    });

    it("has aria-label on Delete rows button", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const deleteButton = screen.getByRole("button", { name: /delete selected rows/i });
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton.getAttribute("aria-label")).toBe("Delete selected rows");
    });

    it("has aria-label on Duplicate rows button", () => {
      renderWithTheme(<TableActions {...defaultProps} isModalMode={true} />);

      const duplicateButton = screen.getByRole("button", { name: /duplicate selected rows/i });
      expect(duplicateButton).toBeInTheDocument();
      expect(duplicateButton.getAttribute("aria-label")).toBe("Duplicate selected rows");
    });

    it("has aria-label on Reset sorting button", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const resetButton = screen.getByRole("button", { name: /reset table sorting/i });
      expect(resetButton).toBeInTheDocument();
      expect(resetButton.getAttribute("aria-label")).toBe("Reset table sorting");
    });

    it("has aria-label on Undo button", () => {
      renderWithTheme(<TableActions {...defaultProps} canUndo={true} />);

      const undoButton = screen.getByRole("button", { name: /undo/i });
      expect(undoButton).toBeInTheDocument();
      expect(undoButton.getAttribute("aria-label")).toMatch(/Undo/);
    });

    it("has aria-label on Redo button", () => {
      renderWithTheme(<TableActions {...defaultProps} canRedo={true} />);

      const redoButton = screen.getByRole("button", { name: /redo/i });
      expect(redoButton).toBeInTheDocument();
      expect(redoButton.getAttribute("aria-label")).toMatch(/Redo/);
    });

    it("has aria-label on Paste button", () => {
      renderWithTheme(<TableActions {...defaultProps} isModalMode={true} />);

      const pasteButton = screen.getByRole("button", { name: /paste from clipboard/i });
      expect(pasteButton).toBeInTheDocument();
      expect(pasteButton.getAttribute("aria-label")).toBe("Paste from clipboard");
    });

    it("has aria-label on Export CSV button", () => {
      renderWithTheme(<TableActions {...defaultProps} isModalMode={true} />);

      const exportButton = screen.getByRole("button", { name: /export as csv/i });
      expect(exportButton).toBeInTheDocument();
      expect(exportButton.getAttribute("aria-label")).toBe("Export as CSV");
    });

    it("has aria-label on Show Select column button", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const selectButton = screen.getByRole("button", { name: /show select column/i });
      expect(selectButton).toBeInTheDocument();
      expect(selectButton.getAttribute("aria-label")).toBe("Show Select column");
    });

    it("has aria-label on Show Row Numbers button", () => {
      renderWithTheme(<TableActions {...defaultProps} showRowNumbersButton={true} setShowRowNumbers={jest.fn()} />);

      const rowNumbersButton = screen.getByRole("button", { name: /show row numbers/i });
      expect(rowNumbersButton).toBeInTheDocument();
      expect(rowNumbersButton.getAttribute("aria-label")).toBe("Show Row Numbers");
    });

    it("has aria-label on Copy table data button", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const copyButton = screen.getByRole("button", { name: /copy table data to clipboard/i });
      expect(copyButton).toBeInTheDocument();
      expect(copyButton.getAttribute("aria-label")).toBe("Copy table data to clipboard");
    });

    it("all icon buttons have accessible names", () => {
      renderWithTheme(<TableActions {...defaultProps} />);

      const buttons = screen.getAllByRole("button");
      const iconButtons = buttons.filter((button) => {
        // Check if button has an icon child (svg)
        return button.querySelector("svg");
      });

      // All icon buttons should have aria-label or aria-labelledby
      iconButtons.forEach((button) => {
        const hasAriaLabel = button.hasAttribute("aria-label");
        const hasAriaLabelledby = button.hasAttribute("aria-labelledby");
        expect(hasAriaLabel || hasAriaLabelledby).toBe(true);
      });
    });
  });
});
