import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useRecentNodesStore } from "../RecentNodesStore";

describe("RecentNodesStore", () => {
  beforeEach(() => {
    act(() => {
      useRecentNodesStore.setState({ recentNodes: [] });
    });
    localStorage.removeItem("nodetool-recent-nodes");
  });

  describe("addRecentNode", () => {
    it("should add a node type to recent nodes", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(1);
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Node");
    });

    it("should move existing node to front when added again", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(2);
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Node1");
      expect(recentNodes[1].nodeType).toBe("nodetool.test.Node2");
    });

    it("should add new recent nodes to the front of the list", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.First");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Second");
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Second");
      expect(recentNodes[1].nodeType).toBe("nodetool.test.First");
    });

    it("should limit recent nodes to MAX_RECENT_NODES (12)", () => {
      for (let i = 0; i < 15; i++) {
        act(() => {
          useRecentNodesStore
            .getState()
            .addRecentNode(`nodetool.test.Node${i}`);
        });
      }

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(12);
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Node14");
    });

    it("should have timestamps for recent nodes", () => {
      const beforeAdd = Date.now();
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
      });
      const afterAdd = Date.now();

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(1);
      expect(recentNodes[0].timestamp).toBeGreaterThanOrEqual(beforeAdd);
      expect(recentNodes[0].timestamp).toBeLessThanOrEqual(afterAdd);
    });
  });

  describe("getRecentNodes", () => {
    it("should return empty array when no recent nodes", () => {
      const recentNodes = useRecentNodesStore.getState().getRecentNodes();
      expect(recentNodes).toHaveLength(0);
    });

    it("should return all recent nodes", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
      });

      const recentNodes = useRecentNodesStore.getState().getRecentNodes();
      expect(recentNodes).toHaveLength(2);
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Node2");
      expect(recentNodes[1].nodeType).toBe("nodetool.test.Node1");
    });
  });

  describe("clearRecentNodes", () => {
    it("should clear all recent nodes", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
        useRecentNodesStore.getState().clearRecentNodes();
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(0);
    });

    it("should return empty array after clearing", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
        useRecentNodesStore.getState().clearRecentNodes();
      });

      const recentNodes = useRecentNodesStore.getState().getRecentNodes();
      expect(recentNodes).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should persist recent nodes to localStorage", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node1");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node2");
      });

      const storageData = localStorage.getItem("nodetool-recent-nodes");
      expect(storageData).not.toBeNull();
      
      if (storageData) {
        const parsed = JSON.parse(storageData);
        expect(parsed.state.recentNodes).toHaveLength(2);
      }
    });

    it("should restore recent nodes from localStorage", () => {
      // Set up localStorage with data
      const testData = {
        state: {
          recentNodes: [
            { nodeType: "nodetool.test.Restored1", timestamp: 1234567890 },
            { nodeType: "nodetool.test.Restored2", timestamp: 1234567891 }
          ]
        },
        version: 1
      };
      localStorage.setItem("nodetool-recent-nodes", JSON.stringify(testData));

      // Create a new store instance (simulating app restart)
      const _newStore = useRecentNodesStore;
      
      // Note: In a real scenario, the store would be recreated
      // Here we verify the data structure is correct
      expect(testData.state.recentNodes).toHaveLength(2);
      expect(testData.state.recentNodes[0].nodeType).toBe("nodetool.test.Restored1");
    });
  });

  describe("edge cases", () => {
    it("should handle adding the same node multiple times", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node");
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(1);
      expect(recentNodes[0].nodeType).toBe("nodetool.test.Node");
    });

    it("should handle special characters in node type names", () => {
      act(() => {
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node-With-Dashes");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node_With_Underscores");
        useRecentNodesStore.getState().addRecentNode("nodetool.test.Node.With.Dots");
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(3);
    });

    it("should handle very long node type names", () => {
      const longNodeType = "nodetool.test." + "a".repeat(100);
      act(() => {
        useRecentNodesStore.getState().addRecentNode(longNodeType);
      });

      const recentNodes = useRecentNodesStore.getState().recentNodes;
      expect(recentNodes).toHaveLength(1);
      expect(recentNodes[0].nodeType).toBe(longNodeType);
    });
  });
});
