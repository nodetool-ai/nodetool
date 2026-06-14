import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import CodeBody from "../CodeBody";
import mockTheme from "../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  }))
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

  it("renders the dynamic property form for dynamic code nodes", () => {
    renderWithTheme(<CodeBody {...makeProps()} />);
    expect(screen.getByTestId("node-property-form")).toBeInTheDocument();
  });
});
