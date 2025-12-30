import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  EditorUiProvider,
  useEditorScope,
  NodeSwitch,
  NodeTextField
} from "../index";

// Test component that displays the current scope
const ScopeDisplay: React.FC = () => {
  const scope = useEditorScope();
  return <div data-testid="scope-display">{scope}</div>;
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
};

describe("EditorUiContext", () => {
  it("defaults to node scope", () => {
    renderWithTheme(
      <EditorUiProvider>
        <ScopeDisplay />
      </EditorUiProvider>
    );
    expect(screen.getByTestId("scope-display")).toHaveTextContent("node");
  });

  it("provides inspector scope when specified", () => {
    renderWithTheme(
      <EditorUiProvider scope="inspector">
        <ScopeDisplay />
      </EditorUiProvider>
    );
    expect(screen.getByTestId("scope-display")).toHaveTextContent("inspector");
  });

  it("provides node scope when explicitly specified", () => {
    renderWithTheme(
      <EditorUiProvider scope="node">
        <ScopeDisplay />
      </EditorUiProvider>
    );
    expect(screen.getByTestId("scope-display")).toHaveTextContent("node");
  });
});

describe("NodeSwitch", () => {
  it("renders a switch element", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeSwitch />
      </EditorUiProvider>
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("accepts changed prop without error", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeSwitch changed={true} />
      </EditorUiProvider>
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("has nodrag class for ReactFlow compatibility", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeSwitch />
      </EditorUiProvider>
    );
    const switchElement = screen.getByRole("checkbox").closest(".MuiSwitch-root");
    expect(switchElement).toHaveClass("nodrag");
  });
});

describe("NodeTextField", () => {
  it("renders a text input", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeTextField />
      </EditorUiProvider>
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("accepts changed and invalid props without error", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeTextField changed={true} invalid={true} />
      </EditorUiProvider>
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has nodrag class for ReactFlow compatibility", () => {
    renderWithTheme(
      <EditorUiProvider>
        <NodeTextField />
      </EditorUiProvider>
    );
    expect(screen.getByRole("textbox")).toHaveClass("nodrag");
  });
});
