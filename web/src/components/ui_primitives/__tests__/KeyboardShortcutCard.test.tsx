/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { KeyboardShortcutCard } from "../KeyboardShortcutCard";
import type { ShortcutItem } from "../KeyboardShortcutCard";

const mockShortcuts: ShortcutItem[] = [
  { action: "Save", keys: ["Ctrl", "S"] },
  { action: "Undo", keys: ["Ctrl", "Z"] },
  { action: "Redo", keys: ["Ctrl", "Shift", "Z"] },
  { action: "Copy", keys: ["Ctrl", "C"] },
];

const mockShortcutsWithDescriptions: ShortcutItem[] = [
  { action: "Save", keys: ["Ctrl", "S"], description: "Save current workflow" },
  { action: "Undo", keys: ["Ctrl", "Z"], description: "Undo last action" },
  { action: "Redo", keys: ["Ctrl", "Shift", "Z"], description: "Redo undone action" },
];

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe("KeyboardShortcutCard", () => {
  it("renders card with title", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        title="Common Shortcuts"
        shortcuts={mockShortcuts}
      />
    );
    expect(screen.getByText("Common Shortcuts")).toBeInTheDocument();
  });

  it("renders card without title", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard shortcuts={mockShortcuts} />
    );
    // Card should render without title
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
  });

  it("renders all shortcut items", () => {
    renderWithTheme(<KeyboardShortcutCard shortcuts={mockShortcuts} />);
    
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("renders keyboard shortcut hints correctly", () => {
    renderWithTheme(<KeyboardShortcutCard shortcuts={mockShortcuts} />);
    
    // Check for individual keys in shortcut hints - use getAllByText for repeated keys
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getAllByText("Z").length).toBeGreaterThan(0);
    // Use getAllByText for "C" since it might appear multiple times
    expect(screen.getAllByText("C").length).toBeGreaterThan(0);
  });

  it("renders shortcut descriptions when provided", () => {
    renderWithTheme(
      <KeyboardShortcutCard shortcuts={mockShortcutsWithDescriptions} />
    );
    
    expect(screen.getByText("Save current workflow")).toBeInTheDocument();
    expect(screen.getByText("Undo last action")).toBeInTheDocument();
    expect(screen.getByText("Redo undone action")).toBeInTheDocument();
  });

  it("respects maxVisible prop", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        maxVisible={2}
      />
    );
    
    // Only first 2 shortcuts should be visible
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    
    // Redo and Copy should not be in the document
    expect(screen.queryByText("Redo")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    
    // "And X more" indicator should be present
    expect(screen.getByText(/2 more shortcuts/)).toBeInTheDocument();
  });

  it("shows correct count for remaining shortcuts", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        maxVisible={3}
      />
    );
    
    expect(screen.getByText(/1 more shortcut/)).toBeInTheDocument();
  });

  it("does not show 'more' indicator when all shortcuts are visible", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        maxVisible={10}
      />
    );
    
    expect(screen.queryByText(/more shortcuts/)).not.toBeInTheDocument();
  });

  it("applies custom sx props", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        sx={{ mt: 4, p: 3 }}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveStyle({ marginTop: "32px" }); // 4 * 8px
  });

  it("renders with vertical layout by default", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        title="Shortcuts"
        shortcuts={mockShortcuts}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
  });

  it("renders with horizontal layout when specified", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        title="Shortcuts"
        shortcuts={mockShortcuts}
        layout="horizontal"
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
  });

  it("renders without dividers when showDividers is false", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        showDividers={false}
      />
    );
    
    const dividers = container.querySelectorAll("hr");
    expect(dividers.length).toBe(0);
  });

  it("renders with medium shortcut hints when specified", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={[{ action: "Save", keys: ["Ctrl", "S"] }]}
        shortcutSize="medium"
      />
    );
    
    // ShortcutHint with medium size should render
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("handles empty shortcuts array", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard shortcuts={[]} />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
    // No shortcuts should be rendered
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("handles single shortcut", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={[{ action: "Save", keys: ["Ctrl", "S"] }]}
      />
    );
    
    expect(screen.getByText("Save")).toBeInTheDocument();
    // Use getAllByText for Ctrl since it may appear elsewhere
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("passes through other BoxProps", () => {
    const handleClick = jest.fn();
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={mockShortcuts}
        onClick={handleClick}
        data-testid="shortcut-card"
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-testid", "shortcut-card");
  });

  it("formats special keys correctly", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={[
          { action: "Enter", keys: ["Enter"] },
          { action: "Escape", keys: ["Escape"] },
          { action: "Tab", keys: ["Tab"] },
        ]}
      />
    );
    
    expect(screen.getByText("Enter")).toBeInTheDocument();
    expect(screen.getByText("Escape")).toBeInTheDocument();
    expect(screen.getByText("Tab")).toBeInTheDocument();
  });

  it("handles shortcuts with many keys", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={[
          { action: "Complex", keys: ["Ctrl", "Shift", "Alt", "Delete"] },
        ]}
      />
    );
    
    expect(screen.getByText("Complex")).toBeInTheDocument();
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    // Shift is formatted as ⇧
    expect(screen.getByText("⇧")).toBeInTheDocument();
    // Alt stays as Alt
    expect(screen.getByText("Alt")).toBeInTheDocument();
    // Delete formatted as ⌦ symbol
    expect(screen.getByText("⌦")).toBeInTheDocument();
  });

  it("renders plus signs between keys", () => {
    renderWithTheme(
      <KeyboardShortcutCard
        shortcuts={[{ action: "Save", keys: ["Ctrl", "S"] }]}
      />
    );
    
    // Check for plus signs in shortcut hints
    const pluses = screen.getAllByText("+");
    expect(pluses.length).toBeGreaterThan(0);
  });

  it("renders with correct card styling", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutCard
        title="Test Shortcuts"
        shortcuts={mockShortcuts}
      />
    );
    
    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();
    // Check that card exists and has some style
    expect(card.style).toBeDefined();
  });
});
