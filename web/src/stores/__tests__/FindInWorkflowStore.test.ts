import { useFindInWorkflowStore, FindResult } from "../FindInWorkflowStore";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNode = (id: string, label: string): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  data: {
    properties: { label },
    dynamic_properties: {},
    dynamic_outputs: {},
    selectable: true,
    workflow_id: "test-workflow"
  }
});

describe("FindInWorkflowStore", () => {
  beforeEach(() => {
    useFindInWorkflowStore.setState(useFindInWorkflowStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with isOpen set to false", () => {
      const state = useFindInWorkflowStore.getInitialState();
      expect(state.isOpen).toBe(false);
    });

    it("should initialize with empty searchTerm", () => {
      const state = useFindInWorkflowStore.getInitialState();
      expect(state.searchTerm).toBe("");
    });

    it("should initialize with empty results array", () => {
      const state = useFindInWorkflowStore.getInitialState();
      expect(state.results).toEqual([]);
    });

    it("should initialize with selectedIndex set to 0", () => {
      const state = useFindInWorkflowStore.getInitialState();
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("openFind", () => {
    it("should set isOpen to true", () => {
      useFindInWorkflowStore.getState().openFind();
      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);
    });

    it("should reset searchTerm when opening", () => {
      useFindInWorkflowStore.setState({ searchTerm: "test" });
      useFindInWorkflowStore.getState().openFind();
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });

    it("should reset results when opening", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "test"), matchIndex: 0 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults });
      useFindInWorkflowStore.getState().openFind();
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
    });

    it("should reset selectedIndex when opening", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 5 });
      useFindInWorkflowStore.getState().openFind();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("closeFind", () => {
    it("should set isOpen to false", () => {
      useFindInWorkflowStore.setState({ isOpen: true });
      useFindInWorkflowStore.getState().closeFind();
      expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
    });

    it("should clear searchTerm when closing", () => {
      useFindInWorkflowStore.setState({ searchTerm: "test" });
      useFindInWorkflowStore.getState().closeFind();
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });

    it("should clear results when closing", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "test"), matchIndex: 0 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults });
      useFindInWorkflowStore.getState().closeFind();
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
    });

    it("should reset selectedIndex when closing", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 3 });
      useFindInWorkflowStore.getState().closeFind();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("setSearchTerm", () => {
    it("should update searchTerm", () => {
      useFindInWorkflowStore.getState().setSearchTerm("new term");
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("new term");
    });

    it("should handle empty string", () => {
      useFindInWorkflowStore.setState({ searchTerm: "test" });
      useFindInWorkflowStore.getState().setSearchTerm("");
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });
  });

  describe("setResults", () => {
    it("should update results", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 }
      ];
      useFindInWorkflowStore.getState().setResults(mockResults);
      expect(useFindInWorkflowStore.getState().results).toEqual(mockResults);
    });

    it("should reset selectedIndex to 0 when results are provided", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 5 });
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 }
      ];
      useFindInWorkflowStore.getState().setResults(mockResults);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("should set selectedIndex to -1 when results are empty", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 5 });
      useFindInWorkflowStore.getState().setResults([]);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("setSelectedIndex", () => {
    it("should update selectedIndex", () => {
      useFindInWorkflowStore.getState().setSelectedIndex(3);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(3);
    });

    it("should handle negative values", () => {
      useFindInWorkflowStore.getState().setSelectedIndex(-1);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("navigateNext", () => {
    it("should not navigate when results are empty", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 0 });
      useFindInWorkflowStore.getState().navigateNext();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("should increment selectedIndex within bounds", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 },
        { node: createMockNode("3", "node3"), matchIndex: 2 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults, selectedIndex: 1 });
      useFindInWorkflowStore.getState().navigateNext();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(2);
    });

    it("should wrap to 0 when at last result", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults, selectedIndex: 1 });
      useFindInWorkflowStore.getState().navigateNext();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("navigatePrevious", () => {
    it("should not navigate when results are empty", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 0 });
      useFindInWorkflowStore.getState().navigatePrevious();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("should decrement selectedIndex within bounds", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults, selectedIndex: 1 });
      useFindInWorkflowStore.getState().navigatePrevious();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("should wrap to last index when at first result", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults, selectedIndex: 0 });
      useFindInWorkflowStore.getState().navigatePrevious();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);
    });
  });

  describe("clearSearch", () => {
    it("should clear searchTerm", () => {
      useFindInWorkflowStore.setState({ searchTerm: "test" });
      useFindInWorkflowStore.getState().clearSearch();
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });

    it("should clear results", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 }
      ];
      useFindInWorkflowStore.setState({ results: mockResults });
      useFindInWorkflowStore.getState().clearSearch();
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
    });

    it("should reset selectedIndex", () => {
      useFindInWorkflowStore.setState({ selectedIndex: 5 });
      useFindInWorkflowStore.getState().clearSearch();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("full workflow", () => {
    it("should handle complete find workflow", () => {
      const mockResults: FindResult[] = [
        { node: createMockNode("1", "node1"), matchIndex: 0 },
        { node: createMockNode("2", "node2"), matchIndex: 1 },
        { node: createMockNode("3", "node3"), matchIndex: 2 }
      ];

      useFindInWorkflowStore.getState().openFind();
      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);

      useFindInWorkflowStore.getState().setSearchTerm("test");
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("test");

      useFindInWorkflowStore.getState().setResults(mockResults);
      expect(useFindInWorkflowStore.getState().results).toHaveLength(3);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);

      useFindInWorkflowStore.getState().navigateNext();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      useFindInWorkflowStore.getState().navigateNext();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(2);

      useFindInWorkflowStore.getState().navigatePrevious();
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      useFindInWorkflowStore.getState().closeFind();
      expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
    });
  });
});
