import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import React from "react";
import { stub } from "../../../test-utils/doubles";
import { screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import CodeBody from "../CodeBody";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";
import { installGlobal } from "../../../test-utils/doubles";

// jsdom has no layout; report a real size so CodeBody's size-gate mounts Monaco.
class SizedResizeObserver implements ResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb(
      [
        {
          target: el,
          contentRect: { width: 320, height: 200 } as DOMRectReadOnly
        } as ResizeObserverEntry
      ],
      this
    );
  }
  unobserve() {}
  disconnect() {}
}
installGlobal("ResizeObserver", SizedResizeObserver);

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

const mockFindNode = jest.fn(() => ({
  data: { dynamic_properties: {}, dynamic_outputs: {} }
}));
const mockUpdateNodeData = jest.fn();
// Edges decide whether Ask AI is offered: generation replaces the node's
// handles wholesale, so a connected node is not eligible.
let mockEdges: Array<{ source: string; target: string }> = [];

const { render } = nodeStoreRenderers(
  makeNodeStore({
      findNode: mockFindNode,
      updateNodeData: mockUpdateNodeData,
      edges: mockEdges
    })
);
// The script-link header owns its own tRPC queries and its own test; here it
// is only in the way.
jest.mock("../CodeNodeScriptLink", () => ({
  __esModule: true,
  default: () => null
}));

const mockHandleAddProperty = jest.fn();
jest.mock("../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: () => ({
    handleAddProperty: mockHandleAddProperty,
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
  default: ({
    onAddProperty
  }: {
    onAddProperty: (name: string) => void;
  }) => (
    <button
      type="button"
      data-testid="node-property-form"
      onClick={() => onAddProperty("prompt")}
    >
      Add input
    </button>
  )
}));

jest.mock("../../node/ExposedLabeledInputs", () => ({
  __esModule: true,
  default: () => <div data-testid="exposed-labeled-inputs" />
}));

jest.mock("../code_assistant/CodeAssistantDialog", () => ({
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
  nodeMetadata: stub<Parameters<typeof CodeBody>[0]["nodeMetadata"]>({
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
  }),
  data: stub<Parameters<typeof CodeBody>[0]["data"]>({
    properties: { code: "return { x: 1 };" }
  }),
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

  it("does not offer the text editor on the Code node", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(
      screen.queryByRole("button", { name: /open editor/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
  });

  it("still offers the text editor on other inline-code nodes", () => {
    renderWithTheme(
      <CodeBody {...makeProps({ nodeType: "nodetool.other.Thing" })} />
    );
    fireEvent.click(screen.getByRole("button", { name: /open editor/i }));
    expect(screen.getByTestId("text-editor-modal")).toBeInTheDocument();
  });

  it("keeps the add input/output form for other nodes with inline code", () => {
    renderWithTheme(
      <CodeBody {...makeProps({ nodeType: "nodetool.other.Thing" })} />
    );
    expect(screen.getByTestId("node-property-form")).toBeInTheDocument();
  });

  it("shows the add input/output form for the Code node", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(screen.getByTestId("node-property-form")).toBeInTheDocument();
    expect(
      screen.queryByText(/reference an undefined variable to add an input/i)
    ).not.toBeInTheDocument();
  });

  it("declares a typed any slot when adding an input on the Code node", () => {
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    expect(mockHandleAddProperty).toHaveBeenCalledWith("prompt", {
      type: "any",
      type_args: [],
      optional: false
    });
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
      target: { value: "return { sum: inputs.a + inputs.b };" }
    });

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {
        sum: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { a: "", b: "" }
    });
  });

  it("keeps a button-added input when the code does not read it yet", () => {
    mockFindNode.mockReturnValueOnce({
      data: { dynamic_properties: { prompt: "" }, dynamic_outputs: {} }
    });
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "return { out: 1 };" }
    });

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {
        out: { type: "any", type_args: [], optional: false }
      },
      dynamic_properties: { prompt: "" }
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
