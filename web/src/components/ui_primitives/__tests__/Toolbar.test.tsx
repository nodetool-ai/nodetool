import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  FloatingToolbar,
  SaveState,
  StatusBar,
  StatusBarItem,
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  TOOLBAR_HEIGHT
} from "../index";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Toolbar", () => {
  it("renders its children", () => {
    renderWithTheme(
      <Toolbar>
        <ToolbarGroup>
          <button>Undo</button>
        </ToolbarGroup>
        <ToolbarDivider />
        <button>Redo</button>
      </Toolbar>
    );
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("forwards className and data attributes", () => {
    renderWithTheme(
      <Toolbar className="my-bar" data-testid="bar">
        x
      </Toolbar>
    );
    expect(screen.getByTestId("bar")).toHaveClass("my-bar");
  });

  it("renders as the given component", () => {
    renderWithTheme(
      <Toolbar component="header" data-testid="bar">
        x
      </Toolbar>
    );
    expect(screen.getByTestId("bar").tagName).toBe("HEADER");
  });

  it("exposes two densities", () => {
    expect(TOOLBAR_HEIGHT.compact).toBeLessThan(TOOLBAR_HEIGHT.normal);
  });
});

describe("StatusBar", () => {
  it("renders a footer with its items", () => {
    renderWithTheme(
      <StatusBar data-testid="status">
        <StatusBarItem grow>Hint</StatusBarItem>
        <StatusBarItem>3 items</StatusBarItem>
      </StatusBar>
    );
    expect(screen.getByTestId("status").tagName).toBe("FOOTER");
    expect(screen.getByText("Hint")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });
});

describe("SaveState", () => {
  it("renders nothing when idle", () => {
    const { container } = renderWithTheme(<SaveState state="idle" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the default label for each state", () => {
    const { rerender } = renderWithTheme(<SaveState state="dirty" />);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <SaveState state="saving" />
      </ThemeProvider>
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <SaveState state="saved" />
      </ThemeProvider>
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <SaveState state="error" />
      </ThemeProvider>
    );
    expect(screen.getByText("Save failed")).toBeInTheDocument();
  });

  it("keeps only a labelled dot without the text", () => {
    renderWithTheme(<SaveState state="dirty" showLabel={false} />);
    expect(screen.getByRole("img", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("accepts custom labels", () => {
    renderWithTheme(
      <SaveState state="saved" labels={{ saved: "Draft saved" }} />
    );
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
  });
});

describe("FloatingToolbar", () => {
  it("is a toolbar landmark holding its children", () => {
    renderWithTheme(
      <FloatingToolbar aria-label="Selection actions">
        <button>Copy</button>
      </FloatingToolbar>
    );
    const bar = screen.getByRole("toolbar", { name: "Selection actions" });
    expect(bar).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("supports a vertical orientation and a role override", () => {
    renderWithTheme(
      <FloatingToolbar orientation="vertical" role="region" aria-label="Bar">
        x
      </FloatingToolbar>
    );
    expect(screen.getByRole("region", { name: "Bar" })).toHaveAttribute(
      "aria-orientation",
      "vertical"
    );
  });
});
