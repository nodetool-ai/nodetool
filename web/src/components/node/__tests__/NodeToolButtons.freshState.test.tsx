jest.mock("../../node_types/PlaceholderNode", () => () => null);
jest.mock("../../../hooks/useDuplicate", () => ({
  useDuplicateNodes: () => jest.fn()
}));
jest.mock("../../../hooks/nodes/useRemoveFromGroup", () => ({
  useRemoveFromGroup: () => jest.fn()
}));
jest.mock("../../../hooks/nodes/useRunFromHere", () => ({
  useRunFromHere: () => ({ runFromHere: jest.fn(), isWorkflowRunning: false })
}));
jest.mock("../../../hooks/nodes/useNodeContextMenu", () => ({
  useNodeContextMenu: () => ({ handlers: {}, conditions: {} })
}));

import { act, screen } from "@testing-library/react";
import { Node } from "@xyflow/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import NodeToolButtons from "../NodeToolButtons";
import { createNodeStore } from "../../../stores/NodeStore";
import { NodeData } from "../../../stores/NodeData";
import { nodeStoreRenderers } from "../../../test-utils/nodeStore";

const node: Node<NodeData> = {
  id: "n1",
  type: "test",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: ""
  }
};

describe("NodeToolButtons", () => {
  test("the bypass button follows the store after a toggle", () => {
    const store = createNodeStore(undefined, { nodes: [node] });
    const { render } = nodeStoreRenderers(store);
    render(
      <ThemeProvider theme={mockTheme}>
        <NodeToolButtons nodeId="n1" />
      </ThemeProvider>
    );

    expect(screen.getByLabelText("Disable Node")).toBeInTheDocument();

    act(() => {
      store.getState().toggleBypass("n1");
    });

    expect(screen.getByLabelText("Enable Node")).toBeInTheDocument();
  });
});
