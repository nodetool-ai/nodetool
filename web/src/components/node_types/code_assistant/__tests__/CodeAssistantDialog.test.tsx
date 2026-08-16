import { makeNodeStore, nodeStoreRenderers } from "../../../../test-utils/nodeStore";
import React from "react";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import "@testing-library/jest-dom";

import CodeAssistantDialog from "../CodeAssistantDialog";
import { getCodeAssistantHandler } from "../codeAssistantBridge";
import mockTheme from "../../../../__mocks__/themeMock";

// The chat panel pulls in the whole global chat stack; the dialog contract is
// what this test covers.
jest.mock("../CodeAssistantChatPanel", () => ({
  __esModule: true,
  default: ({ nodeId, workflowId }: { nodeId: string; workflowId: string }) => (
    <div
      data-testid="chat-panel"
      data-node-id={nodeId}
      data-workflow-id={workflowId}
    />
  )
}));

jest.mock("../../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: null,
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: jest.fn().mockResolvedValue(undefined),
    monacoRef: { current: null },
    monacoOnMount: jest.fn(),
    handleMonacoFind: jest.fn(),
    handleMonacoFormat: jest.fn()
  })
}));

const typeOf = (type: string) => ({
  type,
  optional: false,
  values: null,
  type_args: [],
  type_name: null
});

const mockUpdateNodeData = jest.fn();
let mockNode: Record<string, unknown> | undefined;

const { render } = nodeStoreRenderers(
  makeNodeStore({
      findNode: () => mockNode,
      updateNodeData: mockUpdateNodeData
    })
);
const renderDialog = (
  props: Partial<React.ComponentProps<typeof CodeAssistantDialog>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <CodeAssistantDialog
        open
        nodeId="code-1"
        onClose={props.onClose ?? jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("CodeAssistantDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNode = {
      id: "code-1",
      data: {
        title: "My Code",
        workflow_id: "wf-1",
        properties: { code: "return { total: inputs.rows.length };" },
        dynamic_properties: { rows: [] },
        dynamic_inputs: { rows: { type: typeOf("list") } },
        dynamic_outputs: { total: typeOf("int") }
      }
    };
  });

  it("seeds the draft from the node and shows title, ports, and code", () => {
    renderDialog();

    expect(screen.getByText("My Code")).toBeInTheDocument();
    expect(screen.getByText("rows: list")).toBeInTheDocument();
    expect(screen.getByText("total: int")).toBeInTheDocument();
    expect(screen.getByLabelText("Code draft")).toHaveTextContent(
      "return { total: inputs.rows.length };"
    );
    expect(screen.getByTestId("chat-panel")).toHaveAttribute(
      "data-workflow-id",
      "wf-1"
    );
  });

  it("adds seeded request ports the node does not declare yet", () => {
    renderDialog({
      inputs: [{ name: "extra", type: { type: "str", type_args: [] } }],
      expectedOutput: { name: "answer", type: { type: "str", type_args: [] } }
    });

    expect(screen.getByText("extra: str")).toBeInTheDocument();
    expect(screen.getByText("answer: str")).toBeInTheDocument();
  });

  it("registers a bridge handler while open and unregisters on unmount", () => {
    const { unmount } = renderDialog();

    const state = getCodeAssistantHandler("code-1").getState();
    expect(state).toEqual({
      node_id: "code-1",
      code: "return { total: inputs.rows.length };",
      inputs: [{ name: "rows", type: "list" }],
      outputs: [{ name: "total", type: "int" }],
      packages: []
    });

    unmount();
    expect(() => getCodeAssistantHandler("code-1")).toThrow(
      /No Code assistant is open/
    );
  });

  it("bridge edits update the draft live and Apply writes them to the node", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDialog({ onClose });

    act(() => {
      const handler = getCodeAssistantHandler("code-1");
      handler.setCode("return { total: 0, note: 'hi' };");
      handler.setPorts({
        outputs: [
          { name: "total", type: "int" },
          { name: "note", type: "str" }
        ]
      });
      handler.setPackages(["@nodetool-ai/sandbox-yaml"]);
    });

    expect(screen.getByLabelText("Code draft")).toHaveTextContent(
      "return { total: 0, note: 'hi' };"
    );
    expect(screen.getByText("note: str")).toBeInTheDocument();
    expect(
      screen.getByText("@nodetool-ai/sandbox-yaml")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(mockUpdateNodeData).toHaveBeenCalledTimes(1);
    const [nodeId, patch] = mockUpdateNodeData.mock.calls[0];
    expect(nodeId).toBe("code-1");
    expect(patch.properties.code).toBe("return { total: 0, note: 'hi' };");
    expect(patch.properties.packages).toEqual(["@nodetool-ai/sandbox-yaml"]);
    expect(Object.keys(patch.dynamic_inputs)).toEqual(["rows"]);
    // The retained input keeps its declaration and current value.
    expect(patch.dynamic_inputs.rows.type.type).toBe("list");
    expect(patch.dynamic_properties.rows).toEqual([]);
    expect(Object.keys(patch.dynamic_outputs)).toEqual(["total", "note"]);
    expect(patch.dynamic_outputs.note.type).toBe("str");
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel closes without writing to the node", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockUpdateNodeData).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
