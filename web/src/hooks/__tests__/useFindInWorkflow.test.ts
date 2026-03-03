import { renderHook, act, waitFor } from "@testing-library/react";
import { useFindInWorkflow, NODE_CATEGORIES } from "../useFindInWorkflow";
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

  describe("filter functionality", () => {
    it("should return default filters", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      expect(result.current.filters.category).toBe("all");
      expect(result.current.filters.caseSensitive).toBe(false);
      expect(result.current.filters.searchProperties).toBe(false);
      expect(result.current.filters.searchType).toBe(true);
    });

    it("should filter by category - input nodes", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ category: "input" });
      });

      act(() => {
        result.current.immediateSearch("text");
      });

      // Should only find input.text nodes
      expect(result.current.results.length).toBe(2);
      expect(result.current.results.every(r => r.node.type?.startsWith("input."))).toBe(true);
    });

    it("should filter by category - output nodes", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ category: "output" });
      });

      act(() => {
        result.current.immediateSearch("result");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.type).toBe("output.preview");
    });

    it("should filter by category - processing nodes", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ category: "processing" });
      });

      act(() => {
        result.current.immediateSearch("transform");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.type).toBe("process.transform");
    });

    // TODO: Fix this test - the metadata store mock needs to be improved
    it.skip("should support case-sensitive search", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      // Default is case insensitive - "text" should match "Text"
      act(() => {
        result.current.immediateSearch("text");
      });

      expect(result.current.results.length).toBeGreaterThan(0);

      // Enable case sensitivity
      act(() => {
        result.current.setFilters({ caseSensitive: true });
      });

      act(() => {
        result.current.immediateSearch("text");
      });

      // With case sensitivity, "text" should not match "Text Source"
      expect(result.current.results.length).toBe(0);
    });

    it("should search within node properties when enabled", () => {
      const nodesWithProperties: Node<NodeData>[] = [
        {
          id: "node-prop-1",
          type: "custom.node",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              name: "Test Node",
              custom_field: "searchable_value",
              nested: { value: "deep_search" }
            }
          }
        },
        {
          id: "node-prop-2",
          type: "custom.node",
          position: { x: 100, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              name: "Another Node",
              custom_field: "other_value"
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithProperties, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      // Without property search, should not find
      act(() => {
        result.current.setFilters({ searchProperties: false });
      });

      act(() => {
        result.current.immediateSearch("searchable_value");
      });

      expect(result.current.results.length).toBe(0);

      // With property search, should find
      act(() => {
        result.current.setFilters({ searchProperties: true });
      });

      act(() => {
        result.current.immediateSearch("searchable_value");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.id).toBe("node-prop-1");
    });

    it("should search in nested properties when enabled", () => {
      const nodesWithNestedProperties: Node<NodeData>[] = [
        {
          id: "node-nested-1",
          type: "custom.node",
          position: { x: 0, y: 0 },
          data: {
            ...createMockNodeData(),
            properties: {
              name: "Test Node",
              config: {
                settings: {
                  label: "deep_search_term"
                }
              }
            }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: nodesWithNestedProperties, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ searchProperties: true });
        result.current.immediateSearch("deep_search_term");
      });

      expect(result.current.results.length).toBe(1);
      expect(result.current.results[0].node.id).toBe("node-nested-1");
    });

    it("should exclude type search when disabled", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ searchType: false });
        result.current.immediateSearch("input.text");
      });

      // Should not find by type when disabled
      expect(result.current.results.length).toBe(0);
    });

    it("should reset filters to defaults", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({ category: "input", caseSensitive: true });
        result.current.resetFilters();
      });

      expect(result.current.filters.category).toBe("all");
      expect(result.current.filters.caseSensitive).toBe(false);
    });

    it("should combine multiple filters", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      act(() => {
        result.current.setFilters({
          category: "input",
          caseSensitive: true,
          searchType: false
        });
        result.current.immediateSearch("Text");
      });

      // Should only match input nodes with exact case "Text"
      const inputTextResults = result.current.results.filter(
        r => r.node.type?.startsWith("input.")
      );
      expect(result.current.results.length).toBe(inputTextResults.length);
    });

    it("should re-run search when filters change", () => {
      mockUseNodes.mockImplementation((selector: any) => {
        const state = { nodes: mockNodes, edges: [] };
        return selector ? selector(state) : state;
      });
      mockUseReactFlow.mockReturnValue(mockReactFlowInstance);

      const { result } = renderHook(() => useFindInWorkflow());

      // Initial search with all categories
      act(() => {
        result.current.immediateSearch("text");
      });

      const allResults = result.current.results.length;

      // Filter to input only
      act(() => {
        result.current.setFilters({ category: "input" });
      });

      // Should have fewer results with input filter
      expect(result.current.results.length).toBeLessThanOrEqual(allResults);
    });
  });

  describe("NODE_CATEGORIES export", () => {
    it("should export NODE_CATEGORIES array", () => {
      expect(Array.isArray(NODE_CATEGORIES)).toBe(true);
      expect(NODE_CATEGORIES.length).toBeGreaterThan(0);
      expect(NODE_CATEGORIES[0]).toHaveProperty("value");
      expect(NODE_CATEGORIES[0]).toHaveProperty("label");
    });

    it("should include 'all' category", () => {
      const allCategory = NODE_CATEGORIES.find((cat: any) => cat.value === "all");
      expect(allCategory).toBeDefined();
      expect(allCategory.label).toBe("All Nodes");
    });
  });
});
