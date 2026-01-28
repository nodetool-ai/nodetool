/**
 * Tests for keyboard navigation functionality in NodeMenu.
 * Tests the NodeMenuStore state management for keyboard navigation.
 */

import { createNodeMenuStore } from "../../../stores/NodeMenuStore";

// Mock MetadataStore
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      metadata: {}
    }),
    subscribe: jest.fn(() => () => {})
  }
}));

describe("NodeMenuStore - Keyboard Navigation", () => {
  let store: ReturnType<typeof createNodeMenuStore>;

  beforeEach(() => {
    store = createNodeMenuStore();
    // Initialize with some mock search results
    store.setState({
      groupedSearchResults: [
        {
          title: "Results",
          nodes: [
            { node_type: "node1", title: "Node 1", namespace: "test", properties: [], outputs: [], description: "" },
            { node_type: "node2", title: "Node 2", namespace: "test", properties: [], outputs: [], description: "" },
            { node_type: "node3", title: "Node 3", namespace: "test", properties: [], outputs: [], description: "" }
          ] as any[]
        }
      ],
      selectedIndex: -1
    });
  });

  describe("selectedIndex state", () => {
    it("should initialize with selectedIndex of -1", () => {
      const freshStore = createNodeMenuStore();
      expect(freshStore.getState().selectedIndex).toBe(-1);
    });

    it("should update selectedIndex via setSelectedIndex", () => {
      store.getState().setSelectedIndex(2);
      expect(store.getState().selectedIndex).toBe(2);
    });
  });

  describe("moveSelectionDown", () => {
    it("should move selection from -1 to 0 on first arrow down", () => {
      store.getState().moveSelectionDown();
      expect(store.getState().selectedIndex).toBe(0);
    });

    it("should increment selectedIndex", () => {
      store.getState().setSelectedIndex(0);
      store.getState().moveSelectionDown();
      expect(store.getState().selectedIndex).toBe(1);
    });

    it("should wrap around to 0 when at last index", () => {
      store.getState().setSelectedIndex(2); // last index
      store.getState().moveSelectionDown();
      expect(store.getState().selectedIndex).toBe(0);
    });

    it("should not change selectedIndex when no search results", () => {
      store.setState({ groupedSearchResults: [], selectedIndex: -1 });
      store.getState().moveSelectionDown();
      expect(store.getState().selectedIndex).toBe(-1);
    });
  });

  describe("moveSelectionUp", () => {
    it("should move selection from -1 to last index on first arrow up", () => {
      store.getState().moveSelectionUp();
      expect(store.getState().selectedIndex).toBe(2); // last index
    });

    it("should decrement selectedIndex", () => {
      store.getState().setSelectedIndex(2);
      store.getState().moveSelectionUp();
      expect(store.getState().selectedIndex).toBe(1);
    });

    it("should wrap around to last index when at 0", () => {
      store.getState().setSelectedIndex(0);
      store.getState().moveSelectionUp();
      expect(store.getState().selectedIndex).toBe(2);
    });

    it("should not change selectedIndex when no search results", () => {
      store.setState({ groupedSearchResults: [], selectedIndex: -1 });
      store.getState().moveSelectionUp();
      expect(store.getState().selectedIndex).toBe(-1);
    });
  });

  describe("getSelectedNode", () => {
    it("should return null when selectedIndex is -1", () => {
      expect(store.getState().getSelectedNode()).toBeNull();
    });

    it("should return the correct node for selectedIndex", () => {
      store.getState().setSelectedIndex(1);
      const selectedNode = store.getState().getSelectedNode();
      expect(selectedNode).not.toBeNull();
      expect(selectedNode?.node_type).toBe("node2");
    });

    it("should return null for out of bounds index", () => {
      store.getState().setSelectedIndex(999);
      expect(store.getState().getSelectedNode()).toBeNull();
    });
  });

  describe("setSearchTerm resets selectedIndex", () => {
    it("should reset selectedIndex to -1 when searchTerm changes", () => {
      store.getState().setSelectedIndex(2);
      expect(store.getState().selectedIndex).toBe(2);
      
      store.getState().setSearchTerm("new search");
      expect(store.getState().selectedIndex).toBe(-1);
    });
  });

  describe("closeNodeMenu resets selectedIndex", () => {
    it("should reset selectedIndex to -1 when menu is closed", () => {
      store.setState({ isMenuOpen: true, selectedIndex: 2 });
      store.getState().closeNodeMenu();
      expect(store.getState().selectedIndex).toBe(-1);
    });
  });
});
