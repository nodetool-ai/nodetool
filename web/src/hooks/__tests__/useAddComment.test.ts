import { renderHook } from "@testing-library/react";
import { useAddComment } from "../useAddComment";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;
const mockUseReactFlow = useReactFlow as jest.MockedFunction<typeof useReactFlow>;

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

describe("useAddComment", () => {
  const mockAddNode = jest.fn();
  const mockCreateNode = jest.fn(() => ({
    id: "new-comment",
    type: "nodetool.workflows.base_node.Comment",
    position: { x: 100, y: 100 },
    data: createMockNodeData(),
    width: 200,
    height: 120,
    style: { width: 200, height: 120 }
  }));

  const mockReactFlowInstance = {
    viewportInitialized: true,
    setCenter: jest.fn(),
    fitView: jest.fn(),
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    zoomTo: jest.fn(),
    getZoom: jest.fn(() => 1),
    fitBounds: jest.fn(),
    getViewport: jest.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: jest.fn(),
    project: jest.fn(),
    screenToFlowPosition: jest.fn(() => ({ x: 100, y: 100 })),
    flowToScreenPosition: jest.fn(() => ({ x: 100, y: 100 })),
    getNodes: jest.fn(() => []),
    setNodes: jest.fn(),
    addNodes: jest.fn(),
    getNode: jest.fn(),
    getInternalNode: jest.fn(),
    getEdges: jest.fn(() => []),
    setEdges: jest.fn(),
    addEdges: jest.fn(),
    getEdge: jest.fn(),
    toObject: jest.fn(() => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })),
    deleteElements: jest.fn().mockResolvedValue({ deletedNodes: [], deletedEdges: [] }),
    getIntersectingNodes: jest.fn(() => []),
    isNodeIntersecting: jest.fn(() => false),
    updateNode: jest.fn(),
    updateNodeData: jest.fn(),
    updateEdge: jest.fn(),
    updateEdgeData: jest.fn(),
    getNodesBounds: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    getHandleConnections: jest.fn(() => []),
    getNodeConnections: jest.fn(() => []),
    dfs: jest.fn(),
    getNodesExecutionOrder: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNodes.mockImplementation((selector: any) => {
      const state = {
        nodes: [],
        addNode: mockAddNode,
        createNode: mockCreateNode
      };
      return selector ? selector(state) : state;
    });
    mockUseReactFlow.mockReturnValue(mockReactFlowInstance);
  });

  describe("addComment", () => {
    it("should add a comment node at current mouse position", () => {
      const { result } = renderHook(() => useAddComment());

      result.current();

      expect(mockCreateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          node_type: "nodetool.workflows.base_node.Comment",
          title: "Comment"
        }),
        expect.objectContaining({ x: 100, y: 100 })
      );
      expect(mockAddNode).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "new-comment",
          type: "nodetool.workflows.base_node.Comment",
          width: 200,
          height: 120
        })
      );
    });

    it("should set default dimensions for comment node", () => {
      const { result } = renderHook(() => useAddComment());

      result.current();

      const addedNode = mockAddNode.mock.calls[0][0];
      expect(addedNode.width).toBe(200);
      expect(addedNode.height).toBe(120);
      expect(addedNode.style).toEqual({ width: 200, height: 120 });
    });
  });
});
