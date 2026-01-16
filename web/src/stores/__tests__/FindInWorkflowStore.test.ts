import { renderHook, act } from "@testing-library/react";
import { useFindInWorkflowStore } from "../FindInWorkflowStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNode = (id: string): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  data: {
    properties: { name: `Node ${id}` },
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  }
});

describe("FindInWorkflowStore", () => {
  beforeEach(() => {
    act(() => {
      useFindInWorkflowStore.setState({
        isOpen: false,
        searchTerm: "",
        results: [],
        selectedIndex: 0,
        highlightedNodeIds: new Set()
      });
    });
  });

  describe("initial state", () => {
    it("should have correct initial values", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      expect(result.current.isOpen).toBe(false);
      expect(result.current.searchTerm).toBe("");
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });

  describe("openFind", () => {
    it("should open the find dialog and reset state", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.openFind();
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.searchTerm).toBe("");
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });

  describe("closeFind", () => {
    it("should close the find dialog and reset state", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.openFind();
        result.current.closeFind();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.searchTerm).toBe("");
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });

  describe("setSearchTerm", () => {
    it("should update search term", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.setSearchTerm("test");
      });

      expect(result.current.searchTerm).toBe("test");
    });
  });

  describe("setResults", () => {
    it("should update results and highlightedNodeIds", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1"), createMockNode("node2"), createMockNode("node3")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.setResults(mockResults);
      });

      expect(result.current.results).toEqual(mockResults);
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.highlightedNodeIds).toEqual(new Set(["node1", "node2", "node3"]));
    });

    it("should reset selectedIndex when results are empty", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.setResults([]);
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(-1);
      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });

  describe("setHighlightedNodeIds", () => {
    it("should update highlightedNodeIds", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const newSet = new Set(["node1", "node2"]);

      act(() => {
        result.current.setHighlightedNodeIds(newSet);
      });

      expect(result.current.highlightedNodeIds).toEqual(newSet);
    });
  });

  describe("clearHighlightedNodes", () => {
    it("should clear highlightedNodeIds", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.setHighlightedNodeIds(new Set(["node1", "node2"]));
        result.current.clearHighlightedNodes();
      });

      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });

  describe("navigateNext", () => {
    it("should navigate to next result", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1"), createMockNode("node2")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.setResults(mockResults);
        result.current.navigateNext();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it("should wrap around to first result", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1"), createMockNode("node2")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.setResults(mockResults);
        result.current.setSelectedIndex(1);
        result.current.navigateNext();
      });

      expect(result.current.selectedIndex).toBe(0);
    });

    it("should not navigate when results are empty", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.navigateNext();
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("navigatePrevious", () => {
    it("should navigate to previous result", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1"), createMockNode("node2")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.setResults(mockResults);
        result.current.setSelectedIndex(1);
        result.current.navigatePrevious();
      });

      expect(result.current.selectedIndex).toBe(0);
    });

    it("should wrap around to last result", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1"), createMockNode("node2")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.setResults(mockResults);
        result.current.navigatePrevious();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it("should not navigate when results are empty", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());

      act(() => {
        result.current.navigatePrevious();
      });

      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("clearSearch", () => {
    it("should clear all search state", () => {
      const { result } = renderHook(() => useFindInWorkflowStore());
      const mockNodes = [createMockNode("node1")];
      const mockResults = mockNodes.map((node, index) => ({ node, matchIndex: index }));

      act(() => {
        result.current.openFind();
        result.current.setSearchTerm("test");
        result.current.setResults(mockResults);
        result.current.clearSearch();
      });

      expect(result.current.searchTerm).toBe("");
      expect(result.current.results).toEqual([]);
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.highlightedNodeIds).toEqual(new Set());
    });
  });
});
