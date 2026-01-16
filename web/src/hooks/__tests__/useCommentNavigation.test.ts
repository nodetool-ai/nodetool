import { renderHook } from "@testing-library/react";
import { useCommentNavigation } from "../useCommentNavigation";
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

describe("useCommentNavigation", () => {
  const mockSetCenter = jest.fn();

  const mockReactFlowInstance = {
    viewportInitialized: true,
    setCenter: mockSetCenter,
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
    mockUseReactFlow.mockReturnValue(mockReactFlowInstance);
  });

  describe("commentIds", () => {
    it("should return empty array when no comments exist", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: [], edges: [] };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());

      expect(result.current.commentIds).toEqual([]);
    });

    it("should return comment node ids", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          nodes: [
            {
              id: "comment-1",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 0, y: 0 },
              data: createMockNodeData()
            },
            {
              id: "regular-node",
              type: "input.text",
              position: { x: 100, y: 0 },
              data: createMockNodeData()
            },
            {
              id: "comment-2",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 200, y: 0 },
              data: createMockNodeData()
            }
          ],
          edges: []
        };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());

      expect(result.current.commentIds).toEqual(["comment-1", "comment-2"]);
    });
  });

  describe("navigateToNextComment", () => {
    it("should not call setCenter when no comments exist", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: [], edges: [] };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());
      result.current.navigateToNextComment();

      expect(mockSetCenter).not.toHaveBeenCalled();
    });

    it("should navigate to first comment when at end", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          nodes: [
            {
              id: "comment-1",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 0, y: 0 },
              width: 200,
              height: 120,
              data: createMockNodeData()
            },
            {
              id: "comment-2",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 300, y: 0 },
              width: 200,
              height: 120,
              data: createMockNodeData()
            }
          ],
          edges: []
        };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());
      result.current.navigateToNextComment();

      expect(mockSetCenter).toHaveBeenCalledWith(400, 60, { zoom: 1, duration: 300 });
    });
  });

  describe("navigateToPreviousComment", () => {
    it("should not call setCenter when no comments exist", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: [], edges: [] };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());
      result.current.navigateToPreviousComment();

      expect(mockSetCenter).not.toHaveBeenCalled();
    });

    it("should navigate to last comment when at beginning", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = {
          nodes: [
            {
              id: "comment-1",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 0, y: 0 },
              width: 200,
              height: 120,
              data: createMockNodeData()
            },
            {
              id: "comment-2",
              type: "nodetool.workflows.base_node.Comment",
              position: { x: 300, y: 0 },
              width: 200,
              height: 120,
              data: createMockNodeData()
            }
          ],
          edges: []
        };
        return selector ? selector(state) : state;
      });

      const { result } = renderHook(() => useCommentNavigation());
      result.current.navigateToPreviousComment();

      expect(mockSetCenter).toHaveBeenCalledWith(400, 60, { zoom: 1, duration: 300 });
    });
  });
});
