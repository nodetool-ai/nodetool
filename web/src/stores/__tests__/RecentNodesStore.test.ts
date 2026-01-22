import { act } from "@testing-library/react";
import { useRecentNodesStore, RecentNode as _RecentNode } from "../RecentNodesStore";

describe("RecentNodesStore", () => {
  beforeEach(() => {
    useRecentNodesStore.setState(useRecentNodesStore.getInitialState());
  });

  afterEach(() => {
    useRecentNodesStore.setState(useRecentNodesStore.getInitialState());
  });

  it("initializes with empty recentNodes array", () => {
    expect(useRecentNodesStore.getState().recentNodes).toEqual([]);
  });

  describe("addRecentNode", () => {
    it("adds first node to empty list", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("textNode");
      });

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].nodeType).toBe("textNode");
      expect(nodes[0].timestamp).toBeDefined();
    });

    it("adds multiple nodes in order", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("node1");
        useRecentNodesStore.getState().addRecentNode("node2");
        useRecentNodesStore.getState().addRecentNode("node3");
      });

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(3);
      expect(nodes[0].nodeType).toBe("node3");
      expect(nodes[1].nodeType).toBe("node2");
      expect(nodes[2].nodeType).toBe("node1");
    });

    it("moves existing node to front when added again", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("node1");
        useRecentNodesStore.getState().addRecentNode("node2");
        useRecentNodesStore.getState().addRecentNode("node1");
      });

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(2);
      expect(nodes[0].nodeType).toBe("node1");
      expect(nodes[1].nodeType).toBe("node2");
    });

    it("limits to MAX_RECENT_NODES (12)", () => {
      // Add 15 nodes
      for (let i = 1; i <= 15; i++) {
        act(() => {
          useRecentNodesStore.getState().addRecentNode(`node${i}`);
        });
      }

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(12);
      expect(nodes[0].nodeType).toBe("node15");
      expect(nodes[11].nodeType).toBe("node4");
    });

    it("removes duplicate when adding to full list", () => {
      // Fill up to 12 nodes
      for (let i = 1; i <= 12; i++) {
        act(() => {
          useRecentNodesStore.getState().addRecentNode(`node${i}`);
        });
      }

      // Add an existing node - should move it to front
      act(() => {
        useRecentNodesStore.getState().addRecentNode("node5");
      });

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(12);
      expect(nodes[0].nodeType).toBe("node5");
    });
  });

  describe("getRecentNodes", () => {
    it("returns empty array when no nodes added", () => {
      const nodes = useRecentNodesStore.getState().getRecentNodes();
      expect(nodes).toEqual([]);
    });

    it("returns added nodes", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("testNode");
      });

      const nodes = useRecentNodesStore.getState().getRecentNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].nodeType).toBe("testNode");
    });
  });

  describe("clearRecentNodes", () => {
    it("clears all recent nodes", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("node1");
        useRecentNodesStore.getState().addRecentNode("node2");
        useRecentNodesStore.getState().clearRecentNodes();
      });

      expect(useRecentNodesStore.getState().recentNodes).toEqual([]);
    });

    it("can add new nodes after clearing", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("node1");
        useRecentNodesStore.getState().clearRecentNodes();
        useRecentNodesStore.getState().addRecentNode("node2");
      });

      const nodes = useRecentNodesStore.getState().recentNodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].nodeType).toBe("node2");
    });
  });

  describe("complete workflow", () => {
    it("handles typical user workflow", () => {
      // User adds some nodes
      act(() => {
        useRecentNodesStore.getState().addRecentNode("textNode");
        useRecentNodesStore.getState().addRecentNode("imageNode");
        useRecentNodesStore.getState().addRecentNode("audioNode");
      });

      let nodes = useRecentNodesStore.getState().getRecentNodes();
      expect(nodes).toHaveLength(3);

      // User reuses an existing node - should move to front
      act(() => {
        useRecentNodesStore.getState().addRecentNode("textNode");
      });

      nodes = useRecentNodesStore.getState().getRecentNodes();
      expect(nodes[0].nodeType).toBe("textNode");
      expect(nodes[1].nodeType).toBe("audioNode");
      expect(nodes[2].nodeType).toBe("imageNode");

      // User clears history
      act(() => {
        useRecentNodesStore.getState().clearRecentNodes();
      });

      expect(useRecentNodesStore.getState().getRecentNodes()).toEqual([]);
    });
  });
});
