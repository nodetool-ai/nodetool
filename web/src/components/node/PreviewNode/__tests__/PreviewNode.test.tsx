import React from "react";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { NodeData } from "../../../../stores/NodeData";
import useResultsStore from "../../../../stores/ResultsStore";
import PreviewNode from "../PreviewNode";

import "@testing-library/jest-dom";

jest.mock("../../OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => (
    <div data-testid="output-renderer">{JSON.stringify(value)}</div>
  )
}));

jest.mock("../../NodeHeader", () => ({
  __esModule: true,
  NodeHeader: () => <div data-testid="node-header" />
}));

jest.mock("../../NodeResizeHandle", () => ({
  __esModule: true,
  default: () => <div data-testid="node-resize-handle" />
}));

jest.mock("../PreviewActions", () => ({
  __esModule: true,
  default: () => <div data-testid="preview-actions" />
}));

jest.mock("../../../../hooks/nodes/useSyncEdgeSelection", () => ({
  useSyncEdgeSelection: jest.fn()
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

const workflowId = "workflow-1";
const nodeId = "node-1";
type PreviewNodeProps = React.ComponentProps<typeof PreviewNode>;

const baseData: NodeData = {
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: workflowId
};

const baseProps = {
  id: nodeId,
  type: "nodetool.workflows.base_node.Preview",
  data: baseData,
  selected: false,
  dragging: false,
  zIndex: 0,
  xPos: 0,
  yPos: 0,
  isConnectable: true
} as unknown as PreviewNodeProps;

describe("PreviewNode", () => {
  afterEach(() => {
    act(() => {
      const store = useResultsStore.getState();
      store.clearPreviews(workflowId);
      store.clearResults(workflowId);
    });
  });

  it("renders node result when preview is missing", () => {
    act(() => {
      useResultsStore.getState().setResult(workflowId, nodeId, "hello");
    });

    renderWithTheme(<PreviewNode {...baseProps} />);

    expect(screen.getByTestId("output-renderer")).toHaveTextContent("\"hello\"");
  });

  it("falls back to node result when preview has unresolved memory uri", () => {
    act(() => {
      useResultsStore.getState().setPreview(workflowId, nodeId, {
        type: "image",
        uri: "memory://preview"
      });
      useResultsStore.getState().setResult(workflowId, nodeId, {
        type: "image",
        data: "resolved"
      });
    });

    renderWithTheme(<PreviewNode {...baseProps} />);

    const output = screen.getByTestId("output-renderer");
    expect(output).toHaveTextContent("resolved");
    expect(output).not.toHaveTextContent("memory://");
  });
});
