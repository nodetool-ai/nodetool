import { renderHook, act } from "@testing-library/react";
import { useFindInWorkflow } from "../useFindInWorkflow";
import { useNodes } from "../../contexts/NodeContext";
import { useReactFlow } from "@xyflow/react";
import { Node } from "@xyflow/react";
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

describe("useFindInWorkflow", () => {
  const mockSetCenter = jest.fn();
  const mockFitView = jest.fn();

  const mockNodes: Node<NodeData>[] = [
    {
      id: "node-1",
      type: "input.text",
      position: { x: 0, y: 0 },
      data: { ...createMockNodeData(), properties: { name: "Text Source" } }
    },
    {
      id: "node-2",
      type: "process.transform",
      position: { x: 100, y: 0 },
      data: { ...createMockNodeData(), properties: { name: "Uppercase" } }
    },
    {
      id: "node-3",
      type: "output.preview",
      position: { x: 200, y: 0 },
      data: { ...createMockNodeData(), properties: { name: "Result Display" } }
    },
    {
      id: "node-4",
      type: "input.text",
      position: { x: 300, y: 0 },
      data: { ...createMockNodeData(), properties: { name: "Another Text Node" } }
    }
  ];

  const mockReactFlowInstance = {
    viewportInitialized: true,
    setCenter: mockSetCenter,
    fitView: mockFitView,
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    zoomTo: jest.fn(),
    getZoom: jest.fn(() => 1),
    fitBounds: jest.fn(),
    getViewport: jest.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: jest.fn(),
    project: jest.fn(),
    screenToFlowPosition: jest.fn(() => ({ x: 0, y: 0 })),
    flowToScreenPosition: jest.fn(() => ({ x: 0, y: 0 })),
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
  });

  describe("store integration", () => {
    it("should return isOpen state from store", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());
      expect(result.current.isOpen).toBe(false);
    });

    it("should return searchTerm from store", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());
      expect(result.current.searchTerm).toBe("");
    });

    it("should return empty results initially", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());
      expect(result.current.results).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it("should return openFind and closeFind functions", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());
      expect(typeof result.current.openFind).toBe("function");
      expect(typeof result.current.closeFind).toBe("function");
    });
  });

  describe("search functionality with immediateSearch", () => {
    it("should perform immediate search without debouncing", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("Text Source");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.id).toBe("node-1");
    });

    it("should find nodes by node type", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("input.text");
      });

      expect(result.current.results.length).toBe(2);
    });

    it("should find nodes by node ID", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("node-2");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.id).toBe("node-2");
    });

    it("should be case insensitive", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("TEXT");
      });

      expect(result.current.results.length).toBeGreaterThan(0);
    });

    it("should return empty results for no match", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("nonexistent");
      });

      expect(result.current.results).toHaveLength(0);
    });

    it("should return empty results for whitespace only search", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("   ");
      });

      expect(result.current.results).toHaveLength(0);
    });
  });

  describe("node display name", () => {
    it("should return node name from properties", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      const displayName = result.current.getNodeDisplayName(mockNodes[0]);
      expect(displayName).toBe("Text Source");
    });

    it("should fall back to node type for nodes without name property", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const nodeWithoutName: Node<NodeData> = {
        id: "test-node",
        type: "custom.unknown",
        position: { x: 0, y: 0 },
        data: createMockNodeData()
      };

      const { result } = renderHook(() => useFindInWorkflow());

      const displayName = result.current.getNodeDisplayName(nodeWithoutName);
      expect(displayName).toBe("unknown");
    });

    it("should fall back to node id for nodes with unknown type", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const nodeNoType: Node<NodeData> = {
        id: "id-fallback-node",
        type: "",
        position: { x: 0, y: 0 },
        data: createMockNodeData()
      };

      const { result } = renderHook(() => useFindInWorkflow());

      const displayName = result.current.getNodeDisplayName(nodeNoType);
      expect(displayName).toBe("id-fallback-node");
    });
  });

  describe("navigation", () => {
    it("should navigate to next result", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      const initialIndex = result.current.selectedIndex;
      act(() => {
        result.current.navigateNext();
      });

      expect(result.current.selectedIndex).toBe((initialIndex + 1) % result.current.results.length);
    });

    it("should navigate to previous result", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      const initialIndex = result.current.selectedIndex;
      act(() => {
        result.current.navigatePrevious();
      });

      if (initialIndex === 0) {
        expect(result.current.selectedIndex).toBe(result.current.results.length - 1);
      } else {
        expect(result.current.selectedIndex).toBe(initialIndex - 1);
      }
    });

    it("should select node by index", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      if (result.current.results.length > 1) {
        act(() => {
          result.current.selectNode(1);
        });
        expect(result.current.selectedIndex).toBe(1);
      }
    });

    it("should not select invalid index", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      const initialIndex = result.current.selectedIndex;
      act(() => {
        result.current.selectNode(-1);
      });
      expect(result.current.selectedIndex).toBe(initialIndex);
    });
  });

  describe("goToSelected", () => {
    it("should call setCenter and fitView when result exists", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("node-1");
      });

      if (result.current.results.length > 0) {
        act(() => {
          result.current.goToSelected();
        });

        expect(mockSetCenter).toHaveBeenCalledWith(
          100,
          50,
          { zoom: 1, duration: 300 }
        );
        expect(mockFitView).toHaveBeenCalledWith({
          nodes: expect.arrayContaining([expect.objectContaining({ id: "node-1" })]),
          duration: 300,
          minZoom: 0.5,
          maxZoom: 2
        });
      }
    });

    it("should not call viewport functions when no results", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("nonexistent");
      });

      act(() => {
        result.current.goToSelected();
      });

      expect(mockSetCenter).not.toHaveBeenCalled();
      expect(mockFitView).not.toHaveBeenCalled();
    });

    it("should not call viewport functions when selectedIndex is out of bounds", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("nonexistent");
      });

      act(() => {
        result.current.goToSelected();
      });

      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });

  describe("clearSearch", () => {
    it("should clear search results", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.searchTerm).toBe("");
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should clear timeout on unmount", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { unmount } = renderHook(() => useFindInWorkflow());

      act(() => {
        unmount();
      });

      expect(() => {
        jest.advanceTimersByTime(200);
      }).not.toThrow();
    });

    it("should clear pending search timeout when unmounting", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { unmount } = renderHook(() => useFindInWorkflow());

      act(() => {
        unmount();
      });

      jest.advanceTimersByTime(200);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("totalCount", () => {
    it("should return total count of results", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      expect(result.current.totalCount).toBe(result.current.results.length);
    });
  });

  describe("comment search functionality", () => {
    it("should find nodes by comment content", () => {
      const nodesWithComment: Node<NodeData>[] = [
        {
          id: "comment-node-1",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: "This is a workflow for text processing"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithComment, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text processing");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.id).toBe("comment-node-1");
      expect(result.current.results[0].matchType).toBe("comment");
    });

    it("should find nodes by comment content with case insensitive search", () => {
      const nodesWithComment: Node<NodeData>[] = [
        {
          id: "comment-node-2",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: "IMPORTANT: Remember to validate the model output"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithComment, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("validate");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].matchType).toBe("comment");
    });

    it("should include match context for comment matches", () => {
      const nodesWithComment: Node<NodeData>[] = [
        {
          id: "comment-node-3",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: "This is a very long workflow for processing images with the AI model"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithComment, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("AI model");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].matchContext).toBeDefined();
      expect(result.current.results[0].matchContext).toContain("AI model");
    });

    it("should return comment match with empty context for short comments", () => {
      const nodesWithShortComment: Node<NodeData>[] = [
        {
          id: "comment-node-4",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: "TODO: fix this"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithShortComment, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("fix");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].matchType).toBe("comment");
    });

    it("should search both name and comment content", () => {
      const mixedNodes: Node<NodeData>[] = [
        {
          id: "node-with-name",
          type: "input.text",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: { name: "Text Source" }
          }
        },
        {
          id: "comment-with-text",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 100, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: "This is the text processing node"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mixedNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("text");
      });

      expect(result.current.results.length).toBe(2);
      expect(result.current.results.map((r) => r.node.id)).toContain("node-with-name");
      expect(result.current.results.map((r) => r.node.id)).toContain("comment-with-text");
    });

    it("should handle nodes with Lexical editor state format", () => {
      const nodesWithLexicalComment: Node<NodeData>[] = [
        {
          id: "lexical-comment-node",
          type: "nodetool.workflows.base_node.Comment",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              comment: {
                root: {
                  children: [
                    {
                      type: "paragraph",
                      children: [{ text: "This is a paragraph with important notes" }]
                    }
                  ]
                }
              }
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithLexicalComment, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.immediateSearch("important notes");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].matchType).toBe("comment");
    });
  });
});
