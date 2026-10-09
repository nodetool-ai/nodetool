import React from "react";
import { act, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Edge, NodeProps } from "@xyflow/react";
import mockTheme from "../../../../__mocks__/themeMock";
import { makeNodeStore, nodeStoreRenderers } from "../../../../test-utils/nodeStore";
import type { NodeStoreState } from "../../../../stores/NodeStore";
import type { NodeData } from "../../../../stores/NodeData";
import PreviewNode from "../PreviewNode";

// The real editor feeds ReactFlow its edges from the node store, so a stable
// `getEdges` that reads the store's current edges is what `useReactFlow`
// returns in the app.
let readEdges: () => Edge[] = () => [];
const getEdges = (): Edge[] => readEdges();

jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  Handle: () => null,
  useReactFlow: () => ({ getEdges })
}));
jest.mock("../../OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown }) => (
    <div data-testid="preview-value">{String(value)}</div>
  )
}));
jest.mock("../../NodeHeader", () => ({
  NodeHeader: () => null,
  NODE_HEADER_MIN_HEIGHT: 0
}));
jest.mock("../../NodeResizeHandle", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../NodeOutputs", () => ({ NodeOutputs: () => null }));
jest.mock("../PreviewActions", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../../../hooks/nodes/useSyncEdgeSelection", () => ({
  useSyncEdgeSelection: () => undefined
}));
jest.mock("../../../../hooks/nodes/useNodeGenerations", () => ({
  useNodeGenerations: () => ({ current: undefined })
}));
jest.mock("../../../../hooks/nodes/useNodeResultHistory", () => ({
  useNodeResultHistory: () => ({ lastJobAssets: [] }),
  assetsToPreviewValue: () => undefined
}));

const constantNode = {
  id: "const-1",
  type: "nodetool.constant.String",
  data: { properties: { value: "hello-preview" } }
};

const previewProps = {
  id: "preview-1",
  type: "nodetool.workflows.base_node.Preview",
  data: {
    properties: {},
    workflow_id: "wf-1",
    selectable: true,
    dynamic_properties: {}
  },
  selected: false,
  dragging: false,
  zIndex: 0,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  draggable: true,
  selectable: true,
  deletable: true
} as unknown as NodeProps & { data: NodeData };

describe("PreviewNode", () => {
  it("previews a source connected after the node mounted", () => {
    const store = makeNodeStore({
      edges: [],
      nodes: [constantNode],
      findNode: (id: string) => (id === constantNode.id ? constantNode : undefined)
    });
    readEdges = () => store.getState().edges;
    const { render } = nodeStoreRenderers(store);

    render(
      <ThemeProvider theme={mockTheme}>
        <PreviewNode {...previewProps} />
      </ThemeProvider>
    );
    expect(screen.getByText("Run to preview connected data")).toBeInTheDocument();

    const edge: Edge = {
      id: "e-1",
      source: constantNode.id,
      sourceHandle: "output",
      target: previewProps.id,
      targetHandle: "value"
    };
    act(() => {
      store.setState({ edges: [edge] } as Partial<NodeStoreState>);
    });

    expect(screen.getByTestId("preview-value")).toHaveTextContent(
      "hello-preview"
    );
  });
});
