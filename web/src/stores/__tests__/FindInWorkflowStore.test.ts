import { act } from "@testing-library/react";
import { useFindInWorkflowStore, FindResult, SearchFilters } from "../FindInWorkflowStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNode = (id: string): Node<NodeData> => ({
  id,
  type: "default",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  }
});

describe("FindInWorkflowStore", () => {
  beforeEach(() => {
    useFindInWorkflowStore.setState(useFindInWorkflowStore.getInitialState());
  });

  it("initializes with correct default state", () => {
    expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
    expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    expect(useFindInWorkflowStore.getState().results).toEqual([]);
    expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
  });

  describe("openFind", () => {
    it("opens find dialog and resets state", () => {
      act(() => {
        useFindInWorkflowStore.getState().openFind();
      });
      expect(useFindInWorkflowStore.getState().isOpen).toBe(true);
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("closeFind", () => {
    it("closes find dialog and resets state", () => {
      act(() => {
        useFindInWorkflowStore.getState().openFind();
        useFindInWorkflowStore.getState().setSearchTerm("test");
      });
      act(() => {
        useFindInWorkflowStore.getState().closeFind();
      });
      expect(useFindInWorkflowStore.getState().isOpen).toBe(false);
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("setSearchTerm", () => {
    it("sets search term", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test search");
      });
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("test search");
    });

    it("clears search term with empty string", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
      });
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("");
      });
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
    });
  });

  describe("setResults", () => {
    it("sets results and resets selected index to 0", () => {
      const mockNode = createMockNode("node-1");
      const mockResults: FindResult[] = [
        { node: mockNode, matchIndex: 0 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(mockResults);
      });
      expect(useFindInWorkflowStore.getState().results).toEqual(mockResults);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("sets selected index to -1 when results are empty", () => {
      act(() => {
        useFindInWorkflowStore.getState().setResults([]);
      });
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(-1);
    });
  });

  describe("setSelectedIndex", () => {
    it("sets selected index", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSelectedIndex(5);
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(5);
    });
  });

  describe("navigateNext", () => {
    it("does nothing when results are empty", () => {
      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("navigates to next result", () => {
      const mockNode1 = createMockNode("node-1");
      const mockNode2 = createMockNode("node-2");
      const mockNode3 = createMockNode("node-3");
      const mockResults: FindResult[] = [
        { node: mockNode1, matchIndex: 0 },
        { node: mockNode2, matchIndex: 1 },
        { node: mockNode3, matchIndex: 2 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(mockResults);
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);

      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(2);
    });

    it("wraps around to first result", () => {
      const mockNode1 = createMockNode("node-1");
      const mockNode2 = createMockNode("node-2");
      const mockResults: FindResult[] = [
        { node: mockNode1, matchIndex: 0 },
        { node: mockNode2, matchIndex: 1 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(mockResults);
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);

      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      act(() => {
        useFindInWorkflowStore.getState().navigateNext();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("navigatePrevious", () => {
    it("does nothing when results are empty", () => {
      act(() => {
        useFindInWorkflowStore.getState().navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("navigates to previous result", () => {
      const mockNode1 = createMockNode("node-1");
      const mockNode2 = createMockNode("node-2");
      const mockNode3 = createMockNode("node-3");
      const mockResults: FindResult[] = [
        { node: mockNode1, matchIndex: 0 },
        { node: mockNode2, matchIndex: 1 },
        { node: mockNode3, matchIndex: 2 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(mockResults);
        useFindInWorkflowStore.getState().setSelectedIndex(2);
      });

      act(() => {
        useFindInWorkflowStore.getState().navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);

      act(() => {
        useFindInWorkflowStore.getState().navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });

    it("wraps around to last result", () => {
      const mockNode1 = createMockNode("node-1");
      const mockNode2 = createMockNode("node-2");
      const mockResults: FindResult[] = [
        { node: mockNode1, matchIndex: 0 },
        { node: mockNode2, matchIndex: 1 }
      ];

      act(() => {
        useFindInWorkflowStore.getState().setResults(mockResults);
      });

      act(() => {
        useFindInWorkflowStore.getState().navigatePrevious();
      });
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(1);
    });
  });

  describe("clearSearch", () => {
    it("clears search term, results, and resets index", () => {
      act(() => {
        useFindInWorkflowStore.getState().setSearchTerm("test");
        useFindInWorkflowStore.getState().setSelectedIndex(5);
      });
      act(() => {
        useFindInWorkflowStore.getState().clearSearch();
      });
      expect(useFindInWorkflowStore.getState().searchTerm).toBe("");
      expect(useFindInWorkflowStore.getState().results).toEqual([]);
      expect(useFindInWorkflowStore.getState().selectedIndex).toBe(0);
    });
  });

  describe("filters", () => {
    it("initializes with empty filters", () => {
      expect(useFindInWorkflowStore.getState().filters).toEqual({});
      expect(useFindInWorkflowStore.getState().showFilters).toBe(false);
    });

    it("sets filters", () => {
      const newFilters: SearchFilters = {
        typeCategory: "image",
        connectionState: "connected"
      };

      act(() => {
        useFindInWorkflowStore.getState().setFilters(newFilters);
      });

      expect(useFindInWorkflowStore.getState().filters).toEqual(newFilters);
    });

    it("updates individual filter", () => {
      act(() => {
        useFindInWorkflowStore.getState().updateFilter("typeCategory", "text");
      });

      expect(useFindInWorkflowStore.getState().filters.typeCategory).toBe("text");

      act(() => {
        useFindInWorkflowStore.getState().updateFilter("connectionState", "disconnected");
      });

      expect(useFindInWorkflowStore.getState().filters.typeCategory).toBe("text");
      expect(useFindInWorkflowStore.getState().filters.connectionState).toBe("disconnected");
    });

    it("toggles filters visibility", () => {
      expect(useFindInWorkflowStore.getState().showFilters).toBe(false);

      act(() => {
        useFindInWorkflowStore.getState().toggleFilters();
      });

      expect(useFindInWorkflowStore.getState().showFilters).toBe(true);

      act(() => {
        useFindInWorkflowStore.getState().toggleFilters();
      });

      expect(useFindInWorkflowStore.getState().showFilters).toBe(false);
    });

    it("clears individual filter by setting to undefined", () => {
      act(() => {
        useFindInWorkflowStore.getState().updateFilter("typeCategory", "image");
      });

      expect(useFindInWorkflowStore.getState().filters.typeCategory).toBe("image");

      act(() => {
        useFindInWorkflowStore.getState().updateFilter("typeCategory", undefined);
      });

      expect(useFindInWorkflowStore.getState().filters.typeCategory).toBeUndefined();
    });
  });
});
