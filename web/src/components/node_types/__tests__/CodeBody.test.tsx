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

// The rollout flag; the Ask AI button is absent until a deployment turns
// generation on.
let mockCodeGenEnabled = true;
jest.mock("../../../lib/runtimeConfig", () => ({
  isCodeGenerationEnabled: () => mockCodeGenEnabled
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
  nodeType: "nodetool.code.ExecutePython",
  nodeMetadata: {
    node_type: "nodetool.code.ExecutePython",
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
    properties: { code: "print('hello')" }
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
    expect(screen.getByText("Python")).toBeInTheDocument();
    const editor = screen.getByTestId("monaco") as HTMLTextAreaElement;
    expect(editor.value).toBe("print('hello')");
    expect(editor).toHaveAttribute("data-language", "python");
  });

  it("writes the code property on change", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    const editor = screen.getByTestId("monaco");
    fireEvent.change(editor, { target: { value: "print('bye')" } });
    expect(mockSetProperty).toHaveBeenCalledWith("code", "print('bye')");
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
      "python"
    );
  });

  it("keeps the add input/output form for Execute* code nodes", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(screen.getByTestId("node-property-form")).toBeInTheDocument();
    expect(
      screen.queryByText(/reference an undefined variable to add an input/i)
    ).not.toBeInTheDocument();
  });

  it("shows the IO hint instead of the form for the universal Code node", () => {
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

  it("derives dynamic inputs/outputs from code for the universal Code node", () => {
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

  it("hides Ask AI entirely when the feature flag is off", () => {
    mockCodeGenEnabled = false;
    try {
      renderWithTheme(
        <CodeBody
          {...makeProps({
            nodeType: "nodetool.code.Code",
            data: { properties: { code: "" } }
          })}
        />
      );
      expect(
        screen.queryByRole("button", { name: /ask ai/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("code-gen-dialog")).not.toBeInTheDocument();
    } finally {
      mockCodeGenEnabled = true;
    }
  });

  it("offers Ask AI on the universal Code node only", () => {
    const { unmount } = renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(screen.getByRole("button", { name: /ask ai/i })).toBeInTheDocument();
    unmount();

    // The other 19 `nodetool.code.*` executors run real interpreters and have
    // no generator yet.
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(
      screen.queryByRole("button", { name: /ask ai/i })
    ).not.toBeInTheDocument();
  });

  it("hides Ask AI on a Code node that already has code", () => {
    // An accepted submission replaces the node's inputs and outputs wholesale,
    // so offering it here would silently discard work.
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "return { x: 1 };" } }
        })}
      />
    );
    expect(
      screen.queryByRole("button", { name: /ask ai/i })
    ).not.toBeInTheDocument();
  });

  it("hides Ask AI on a connected Code node", () => {
    // The replaced handles would strand this edge.
    mockEdges = [{ source: "upstream", target: "node-1" }];
    renderWithTheme(
      <CodeBody
        {...makeProps({
          nodeType: "nodetool.code.Code",
          data: { properties: { code: "" } }
        })}
      />
    );
    expect(
      screen.queryByRole("button", { name: /ask ai/i })
    ).not.toBeInTheDocument();
  });

  it("keeps Ask AI when the edges belong to other nodes", () => {
    mockEdges = [{ source: "other-1", target: "other-2" }];
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

  it("does not derive IO for non-universal code executors", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "return { x: y };" }
    });
    expect(mockUpdateNodeData).not.toHaveBeenCalled();
  });
});
