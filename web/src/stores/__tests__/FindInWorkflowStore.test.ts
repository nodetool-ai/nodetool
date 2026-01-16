import { act } from "@testing-library/react";
import { useFindInWorkflowStore, FindResult } from "../FindInWorkflowStore";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("FindInWorkflowStore", () => {
  beforeEach(() => {
    useFindInWorkflowStore.setState({
      isOpen: false,
      searchTerm: "",
      results: [],
      selectedIndex: 0
    });
  });

  describe("initial state", () => {
    it("is closed by default", () => {
      const { isOpen } = useFindInWorkflowStore.getState();
      expect(isOpen).toBe(false);
    });

    it("has empty search term", () => {
      const { searchTerm } = useFindInWorkflowStore.getState();
      expect(searchTerm).toBe("");
    });

    it("has empty results array", () => {
      const { results } = useFindInWorkflowStore.getState();
      expect(results).toEqual([]);
    });

    it("selectedIndex starts at 0", () => {
      const { selectedIndex } = useFindInWorkflowStore.getState();
      expect(selectedIndex).toBe(0);
    });
  });

  describe("openFind", () => {
    it("opens the find dialog", () => {
      const { openFind } = useFindInWorkflowStore.getState();
      act(() => {
        openFind();
      });

      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);
    });

    it("resets search state when opening", () => {
      // Set up some existing state
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
        useFindInWorkflowStore.getState().setResults([{} as FindResult]);
        useFindInWorkflowStore.getState().setSelectedIndex(5);
      });

      // Open should reset everything
      act(() => {
        useFindInWorkflowStore.getState().openFind();
      });

      const state = useFindInWorkflowStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.searchTerm).toBe("");
      expect(state.results).toEqual([]);
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("closeFind", () => {
    it("closes the find dialog", () => {
      act(() => {
        useFindInWorkflowStore.getState().openFind();
      });

      act(() => {
        useFindInWorkflowStore.getState().closeFind();
      });

      expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
    });

    it("resets search state when closing", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
        useFindInWorkflowStore.getState().setResults([{} as FindResult]);
        useFindInWorkflowStore.getState().setSelectedIndex(5);
      });

      act(() => {
        useFindInWorkflowStore.getState().closeFind();
      });

      const state = useFindInWorkflowStore.getState();
      expect(state.searchTerm).toBe("");
      expect(state.results).toEqual([]);
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("setSearchTerm", () => {
    it("updates search term", () => {
      const { setSearchTerm } = useFindInWorkflowStore.getState();
      act(() => {
        setSearchTerm("my search");
      });

      expect(useFindInWorkflowStore.getState().searchTerm).toBe("my search");
    });

    it("handles empty string", () => {
      const { setSearchTerm } = useFindInWorkflowStore.getState();
      act(() => {
        setSearchTerm("");
      });

      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });

    it("handles special characters", () => {
      const { setSearchTerm } = useFindInWorkflowStore.getState();
      act(() => {
        setSearchTerm("test[]().*?");
      });

      expect(useFindInWorkflowStore.getState().searchTerm).toBe("test[]().*?");
    });
  });

  describe("setResults", () => {
    it("sets results array", () => {
      const mockNode: Node<NodeData> = {
        id: "node1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Test Node" }
      };
      const results: FindResult[] = [
        { node: mockNode, matchIndex: 0 }
      ];

      const { setResults } = useFindInWorkflowStore.getState();
      act(() => {
        setResults(results);
      });

      expect(useFindInWorkflowStore.getState().results).toEqual(results);
    });

    it("selects first result when results are provided", () => {
      const results: FindResult[] = [
        {} as FindResult,
        {} as FindResult,
        {} as FindResult
      ];

      const { setResults } = useFindInWorkflowStore.getState();
      act(() => {
        setResults(results);
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("sets selectedIndex to -1 when results are empty", () => {
      const { setResults } = useFindInWorkflowStore.getState();
      act(() => {
        setResults([]);
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("setSelectedIndex", () => {
    it("updates selected index", () => {
      const { setSelectedIndex } = useFindInWorkflowStore.getState();
      act(() => {
        setSelectedIndex(5);
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(5);
    });

    it("handles negative index", () => {
      const { setSelectedIndex } = useFindInWorkflowStore.getState();
      act(() => {
        setSelectedIndex(-1);
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("navigateNext", () => {
    it("cycles through results", () => {
      const mockNode: Node<NodeData> = {
        id: "node1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Test Node" }
      };
      const results: FindResult[] = [
        { node: mockNode, matchIndex: 0 },
        { node: { ...mockNode, id: "node2" }, matchIndex: 1 },
        { node: { ...mockNode, id: "node3" }, matchIndex: 2 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(results);
      });

      const { navigateNext } = useFindInWorkflowStore.getState();
      act(() => {
        navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      act(() => {
        navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(2);

      act(() => {
        navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0); // Wraps around
    });

    it("does nothing when results are empty", () => {
      const { navigateNext } = useFindInWorkflowStore.getState();
      act(() => {
        navigateNext();
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("navigatePrevious", () => {
    it("cycles backwards through results", () => {
      const mockNode: Node<NodeData> = {
        id: "node1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Test Node" }
      };
      const results: FindResult[] = [
        { node: mockNode, matchIndex: 0 },
        { node: { ...mockNode, id: "node2" }, matchIndex: 1 },
        { node: { ...mockNode, id: "node3" }, matchIndex: 2 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(results);
        useFindInWorkflowStore.getState().setSelectedIndex(1);
      });

      const { navigatePrevious } = useFindInWorkflowStore.getState();
      act(() => {
        navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);

      act(() => {
        navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(2); // Wraps around
    });

    it("does nothing when results are empty", () => {
      const { navigatePrevious } = useFindInWorkflowStore.getState();
      act(() => {
        navigatePrevious();
      });

      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("clearSearch", () => {
    it("clears all search state", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
        useFindInWorkflowStore.getState().setResults([{} as FindResult]);
        useFindInWorkflowStore.getState().setSelectedIndex(5);
      });

      act(() => {
        useFindInWorkflowStore.getState().clearSearch();
      });

      const state = useFindInWorkflowStore.getState();
      expect(state.searchTerm).toBe("");
      expect(state.results).toEqual([]);
      expect(state.selectedIndex).toBe(0);
    });

    it("does not close the dialog", () => {
      act(() => {
        useFindInWorkflowStore.getState().openFind();
        useFindInWorkflowStore.getState().clearSearch();
      });

      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("full search workflow", () => {
      // Open find dialog
      act(() => {
        useFindInWorkflowStore.getState().openFind();
      });
      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);

      // Type search term
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
      });
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("test");

      // Set results
      const mockNode: Node<NodeData> = {
        id: "node1",
        type: "default",
        position: { x: 0, y: 0 },
        data: { label: "Test Node" }
      };
      const results: FindResult[] = [
        { node: mockNode, matchIndex: 0 },
        { node: { ...mockNode, id: "node2" }, matchIndex: 5 }
      ];
      act(() => {
        useFindInWorkflowStore.getState().setResults(results);
      });

      // Navigate through results
      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      act(() => {
        useFindInWorkflowStore.getState().navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);

      // Clear search
      act(() => {
        useFindInWorkflowStore.getState().clearSearch();
      });
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
      expect(useFindInWorkflowStore.getState().results).toEqual([]);

      // Close
      act(() => {
        useFindInWorkflowStore.getState().closeFind();
      });
      expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
    });
  });
});
