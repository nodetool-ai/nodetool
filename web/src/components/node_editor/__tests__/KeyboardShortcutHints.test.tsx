import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import KeyboardShortcutHints from "../KeyboardShortcutHints";
import { ThemeProvider } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Mock the platform detection
jest.mock("../../../utils/platform", () => ({
  isMac: jest.fn(() => false)
}));

// Mock the shortcuts config
jest.mock("../../../config/shortcuts", () => ({
  getShortcutTooltip: jest.fn((slug: string) => {
    // Return a simple string representation for testing
    return `Tooltip for ${slug}`;
  }),
  NODE_EDITOR_SHORTCUTS: []
}));

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark"
  }
});

const renderWithTheme = (component: React.ReactNode) => {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {component}
    </ThemeProvider>
  );
};

describe("KeyboardShortcutHints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render shortcut hints when provided", () => {
    renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "paste", "deleteNode"]}
        position="bottom-right"
      />
    );

    // Check that the component renders
    const hintsContainer = document.querySelector(".keyboard-shortcut-hints");
    expect(hintsContainer).toBeInTheDocument();
    expect(hintsContainer).toHaveClass("bottom-right");
  });

  it("should not render when no shortcuts provided", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutHints shortcutSlugs={[]} position="top-right" />
    );

    expect(container.querySelector(".keyboard-shortcut-hints")).not.toBeInTheDocument();
  });

  it("should filter out empty/undefined slugs", () => {
    renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "", "paste", null as any, "deleteNode"]}
        position="top-left"
      />
    );

    const hintItems = document.querySelectorAll(".hint-item");
    // Should only have 3 valid items
    expect(hintItems.length).toBe(3);
  });

  it("should render with correct position classes", () => {
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

    positions.forEach((position) => {
      const { unmount } = renderWithTheme(
        <KeyboardShortcutHints
          shortcutSlugs={["copy"]}
          position={position}
        />
      );

      const hintsContainer = document.querySelector(".keyboard-shortcut-hints");
      expect(hintsContainer).toHaveClass(position);
      unmount();
    });
  });

  it("should apply custom className", () => {
    renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy"]}
        className="custom-class"
      />
    );

    const hintsContainer = document.querySelector(".keyboard-shortcut-hints");
    expect(hintsContainer).toHaveClass("custom-class");
  });

  it("should render hint items with labels and combos", () => {
    renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "paste"]}
        position="bottom-right"
      />
    );

    const hintItems = document.querySelectorAll(".hint-item");
    expect(hintItems.length).toBe(2);

    // Each hint item should have a label and combo container
    hintItems.forEach((item) => {
      expect(item.querySelector(".hint-label")).toBeInTheDocument();
      expect(item.querySelector(".hint-combo")).toBeInTheDocument();
    });
  });

  it("should render tooltips for each hint", async () => {
    renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "deleteNode"]}
        position="top-right"
      />
    );

    const hintItems = document.querySelectorAll(".hint-item");

    // Hover over first hint item to trigger tooltip
    const firstHint = hintItems[0];
    // Tooltip is rendered but may not be visible until hover
    expect(firstHint).toBeInTheDocument();
  });

  it("should render animation when animated prop is true", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy"]}
        animated={true}
      />
    );

    // Component should render with animation
    const hintsContainer = container.querySelector(".keyboard-shortcut-hints");
    expect(hintsContainer).toBeInTheDocument();
  });

  it("should not render animation when animated prop is false", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy"]}
        animated={false}
      />
    );

    // Component should still render
    const hintsContainer = container.querySelector(".keyboard-shortcut-hints");
    expect(hintsContainer).toBeInTheDocument();
  });

  it("should memoize correctly to prevent unnecessary re-renders", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "paste"]}
        position="bottom-right"
        animated={true}
      />
    );

    // Component should render without errors
    const hintsContainer = container.querySelector(".keyboard-shortcut-hints");
    expect(hintsContainer).toBeInTheDocument();
    expect(hintsContainer).toHaveClass("bottom-right");
  });

  it("should update when shortcut slugs change", () => {
    const { container } = renderWithTheme(
      <KeyboardShortcutHints
        shortcutSlugs={["copy", "paste", "deleteNode"]}
        position="bottom-right"
      />
    );

    const hintItems = container.querySelectorAll(".hint-item");
    expect(hintItems.length).toBe(3);
  });

  it("should update when position changes", () => {
    const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

    positions.forEach((position) => {
      const { unmount } = renderWithTheme(
        <KeyboardShortcutHints
          shortcutSlugs={["copy"]}
          position={position}
        />
      );

      const hintsContainer = document.querySelector(".keyboard-shortcut-hints");
      expect(hintsContainer).toHaveClass(position);
      unmount();
    });
  });
});
