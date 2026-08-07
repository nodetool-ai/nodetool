import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import CodeBody from "../CodeBody";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

// jsdom has no layout; report a real size so CodeBody's size-gate mounts Monaco.
class SizedResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb(
      [
        {
          target: el,
          contentRect: { width: 320, height: 200 } as DOMRectReadOnly
        } as ResizeObserverEntry
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
  SizedResizeObserver as unknown as typeof ResizeObserver;

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

const mockFindNode = jest.fn(() => ({ data: { dynamic_properties: {} } }));
const mockUpdateNodeData = jest.fn();
// Edges decide whether Ask AI is offered: generation replaces the node's
// handles wholesale, so a connected node is not eligible.
let mockEdges: Array<{ source: string; target: string }> = [];

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({
      findNode: mockFindNode,
      updateNodeData: mockUpdateNodeData,
      edges: mockEdges
    })
}));

jest.mock("../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: () => ({
    handleAddProperty: jest.fn(),
    handleDeleteProperty: jest.fn(),
    handleUpdatePropertyName: jest.fn()
  })
}));

// Stub Monaco with a textarea so we can drive onChange without the real editor.
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

jest.mock("../../node/HandleColumn", () => ({
  __esModule: true,
  default: () => <div data-testid="handle-column" />
}));

jest.mock("../../node/NodeInputs", () => ({
  __esModule: true,
  NodeInputs: () => <div data-testid="node-inputs" />,
  default: () => <div data-testid="node-inputs" />
}));

jest.mock("../../node/NodeOutputs", () => ({
  __esModule: true,
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

jest.mock("../../node/NodePropertyForm", () => ({
  __esModule: true,
  default: () => <div data-testid="node-property-form" />
}));

jest.mock("../../node/ExposedLabeledInputs", () => ({
  __esModule: true,
  default: () => <div data-testid="exposed-labeled-inputs" />
}));

jest.mock("../code_gen/CodeGenDialog", () => ({
  __esModule: true,
  default: ({ nodeId }: { nodeId: string }) => (
    <div data-testid="code-gen-dialog" data-node-id={nodeId} />
  )
}));

jest.mock("../../properties/TextEditorModal", () => ({
  __esModule: true,
  default: ({ language }: { language?: string }) => (
    <div data-testid="text-editor-modal" data-language={language} />
  )
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "node-1",
  nodeType: "nodetool.code.Code",
  nodeMetadata: {
    node_type: "nodetool.code.Code",
    inline_fields: ["code"],
    properties: [
      { name: "code", type: { type: "str", type_args: [], optional: false } }
    ],
    outputs: [],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true,
    is_streaming_output: false,
    layout: "default"
  } as unknown as Parameters<typeof CodeBody>[0]["nodeMetadata"],
  data: {
    properties: { code: "return { x: 1 };" }
  } as unknown as Parameters<typeof CodeBody>[0]["data"],
  workflowId: "wf-1",
  isOutputNode: false,
  ...overrides
});

describe("CodeBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEdges = [];
  });

  it("renders the language label and seeds the editor from the code property", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
    const editor = screen.getByTestId("monaco") as HTMLTextAreaElement;
    expect(editor.value).toBe("return { x: 1 };");
    expect(editor).toHaveAttribute("data-language", "javascript");
  });

  it("writes the code property on change", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    const editor = screen.getByTestId("monaco");
    fireEvent.change(editor, { target: { value: "return { x: 2 };" } });
    expect(mockSetProperty).toHaveBeenCalledWith("code", "return { x: 2 };");
  });

  it("uses plaintext for unknown code node types", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Unknown",
          nodeMetadata: {
            node_type: "nodetool.code.Unknown",
            inline_fields: ["code"],
            properties: [
              {
                name: "code",
                type: { type: "str", type_args: [], optional: false }
              }
            ],
            outputs: [],
            supports_dynamic_inputs: false,
            supports_dynamic_outputs: false,
            is_streaming_output: false,
            layout: "default"
          }
        })}
      />
    );
    expect(screen.getByTestId("monaco")).toHaveAttribute(
      "data-language",
      "plaintext"
    );
  });

  it("toggles the full editor modal", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(screen.queryByTestId("text-editor-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open editor/i }));
    expect(screen.getByTestId("text-editor-modal")).toHaveAttribute(
      "data-language",
      "javascript"
    );
  });

  it("keeps the add input/output form for other nodes with inline code", () => {
    renderWithTheme(
      <CodeBody {...makeProps({ nodeType: "nodetool.other.Thing" })} />
    );
    expect(screen.getByTestId("node-property-form")).toBeInTheDocument();
    expect(
      screen.queryByText(/reference an undefined variable to add an input/i)
    ).not.toBeInTheDocument();
  });

  it("shows the IO hint instead of the form for the Code node", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(
      screen.getByText(/reference an undefined variable to add an input/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("node-property-form")).not.toBeInTheDocument();
  });

  it("derives dynamic inputs/outputs from code for the Code node", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    const editor = screen.getByTestId("monaco");
    fireEvent.change(editor, {
      target: { value: "return { sum: a + b };" }
    });

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {
        sum: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { a: "", b: "" }
    });
  });

  it("offers Ask AI on the Code node only", () => {
    const { unmount } = renderWithTheme(
      <CodeBody {...makeProps({ data: { properties: { code: "" } } })} />
    );
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
    unmount();

    // Any other node with an inline `code` property has no generator.
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.other.Thing",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(
      screen.queryByRole("button", { name: /ask ai/i })
    ).not.toBeInTheDocument();
  });

  it("keeps Ask AI on a Code node that already has code", () => {
    // A submission replaces the body wholesale, but nothing is written until
    // the user reviews it and clicks Apply, in one undoable step.
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "return { x: 1 };" } }
        })}
      />
    );
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
  });

  it("keeps Ask AI on a connected Code node", () => {
    // Replaced handles can strand this edge; Apply is what confirms that.
    mockEdges = [{ source: "upstream", target: "node-1" }];
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
  });

  it("opens the code generation dialog from Ask AI", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(screen.queryByTestId("code-gen-dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ask ai/i }));
    expect(screen.getByTestId("code-gen-dialog")).toHaveAttribute(
      "data-node-id",
      "node-1"
    );
  });

  it("does not derive IO for other nodes with inline code", () => {
    renderWithTheme(
      <CodeBody {...makeProps({ nodeType: "nodetool.other.Thing" })} />
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "return { x: y };" }
    });
    expect(mockUpdateNodeData).not.toHaveBeenCalled();
  });
});
