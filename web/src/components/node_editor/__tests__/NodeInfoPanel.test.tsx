import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import type { NodeData } from "../../../stores/NodeData";
import { useInspectedNodeStore } from "../../../stores/InspectedNodeStore";
import useErrorStore from "../../../stores/ErrorStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import NodeInfoPanel from "../NodeInfoPanel";

const mockSetCenter = jest.fn();
jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useReactFlow: () => ({
    setCenter: mockSetCenter,
    flowToScreenPosition: (p: { x: number; y: number }) => p
  }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 })
}));

const makeNode = (): Node<NodeData> => ({
  id: "n1",
  type: "test.Node",
  position: { x: 10, y: 20 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

describe("NodeInfoPanel", () => {
  const renderPanel = () => {
    const store = createNodeStore(undefined, { nodes: [makeNode()], edges: [] });
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeProvider createStore={() => store}>
          <NodeInfoPanel />
        </NodeProvider>
      </ThemeProvider>
    );
    return store;
  };

  beforeEach(() => {
    mockSetCenter.mockClear();
    useErrorStore.setState({ errors: {} });
    useWorkflowRunsStore.setState({ focusedJob: { wf: "job1" } });
    useInspectedNodeStore.setState({ inspectedNodeId: "n1" });
  });

  it("focuses the node's current position after it moves", () => {
    const store = renderPanel();
    act(() => {
      store.getState().setNodes(
        store.getState().nodes.map((n) => ({ ...n, position: { x: 300, y: 400 } }))
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /focus/i }));
    expect(mockSetCenter).toHaveBeenCalledWith(300, 400, expect.anything());
  });

  it("closes when the node is deleted", () => {
    const store = renderPanel();
    act(() => {
      store.getState().deleteNode("n1");
    });
    expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
  });

  it("shows the node's error from the error store", () => {
    renderPanel();
    act(() => {
      useErrorStore.getState().setError("wf", "job1", "n1", "Boom failed");
    });
    expect(screen.getByText("Boom failed")).toBeInTheDocument();
  });
});
