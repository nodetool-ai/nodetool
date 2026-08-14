import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

// Stub Monaco with a textarea so the editor can be driven without the real bundle.
jest.mock("../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: ({
      value,
      onChange,
      language
    }: {
      value: string;
      onChange?: (val?: string) => void;
      language?: string;
    }) => (
      <textarea
        data-testid="monaco"
        data-language={language}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: jest.fn().mockResolvedValue(undefined),
    monacoRef: { current: null },
    monacoOnMount: jest.fn(),
    handleMonacoFind: jest.fn(),
    handleMonacoFormat: jest.fn()
  })
}));

jest.mock("../TextEditorModal", () => ({
  __esModule: true,
  default: ({ language }: { language?: string }) => (
    <div data-testid="text-editor-modal" data-language={language} />
  )
}));

let mockEdges: Array<{ target: string; targetHandle: string }> = [];
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({ edges: mockEdges })
}));

import CodeProperty from "../CodeProperty";

const defaultProps = {
  property: {
    name: "code",
    description: "JavaScript to run",
    type: { type: "str", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: "return {};",
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "nodetool.code.Code"
};

const renderProperty = (props: Record<string, unknown> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CodeProperty {...defaultProps} {...(props as any)} />
    </ThemeProvider>
  );

describe("CodeProperty", () => {
  beforeEach(() => {
    mockEdges = [];
    jest.clearAllMocks();
  });

  it("renders the code in a JavaScript editor", () => {
    renderProperty();
    const editor = screen.getByTestId("monaco");
    expect(editor).toHaveValue("return {};");
    expect(editor).toHaveAttribute("data-language", "javascript");
  });

  it("writes edits back through onChange", () => {
    const onChange = jest.fn();
    renderProperty({ onChange });
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "return { a: 1 };" }
    });
    expect(onChange).toHaveBeenCalledWith("return { a: 1 };");
  });

  it("follows external writes while the editor is not focused", () => {
    const { rerender } = renderProperty();
    rerender(
      <ThemeProvider theme={mockTheme}>
        <CodeProperty {...(defaultProps as any)} value="return { b: 2 };" />
      </ThemeProvider>
    );
    expect(screen.getByTestId("monaco")).toHaveValue("return { b: 2 };");
  });

  it("shows a connected badge instead of the editor when an edge drives it", () => {
    mockEdges = [{ target: "node1", targetHandle: "code" }];
    renderProperty();
    expect(screen.queryByTestId("monaco")).not.toBeInTheDocument();
  });

  it("does not offer the text editor on the Code node", () => {
    renderProperty();
    fireEvent.mouseEnter(screen.getByText("Code"));
    expect(
      screen.queryByRole("button", { name: /open editor/i })
    ).not.toBeInTheDocument();
  });

  it("falls back to plain text for a non-JavaScript code node", () => {
    renderProperty({ nodeType: "some.other.Node" });
    expect(screen.getByTestId("monaco")).toHaveAttribute(
      "data-language",
      "plaintext"
    );
  });
});
