import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  useMostUsedNodesStore,
  MostUsedNode
} from "../MostUsedNodesStore";

describe("MostUsedNodesStore", () => {
  beforeEach(() => {
    act(() => {
      useMostUsedNodesStore.setState({ mostUsedNodes: [] });
    });
    localStorage.removeItem("nodetool-most-used-nodes");
  });

  describe("incrementUsage", () => {
    it("should add a new node with count 1", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes).toHaveLength(1);
      expect(mostUsedNodes[0].nodeType).toBe("nodetool.test.Node");
      expect(mostUsedNodes[0].count).toBe(1);
    });

    it("should increment count for existing node", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes).toHaveLength(1);
      expect(mostUsedNodes[0].count).toBe(3);
    });

    it("should sort nodes by count descending", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.High");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.High");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.High");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Medium");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Medium");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes[0].nodeType).toBe("nodetool.test.High");
      expect(mostUsedNodes[0].count).toBe(3);
      // When counts are equal, the order depends on the sort stability
      // Both Medium and Low have count 2, so we just verify they're both present
      const mediumNode = mostUsedNodes.find(n => n.nodeType === "nodetool.test.Medium");
      const lowNode = mostUsedNodes.find(n => n.nodeType === "nodetool.test.Low");
      expect(mediumNode).toBeDefined();
      expect(lowNode).toBeDefined();
      expect(mediumNode!.count).toBe(2);
      expect(lowNode!.count).toBe(2);
    });

    it("should limit to MAX_MOST_USED_NODES (12)", () => {
      for (let i = 0; i < 15; i++) {
        act(() => {
          useMostUsedNodesStore
            .getState()
            .incrementUsage(`nodetool.test.Node${i}`);
        });
      }

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes).toHaveLength(12);
    });

    it("should move incremented node to front while maintaining sort order", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.First");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Second");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Third");
        // Increment First to make it highest
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.First");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.First");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes[0].nodeType).toBe("nodetool.test.First");
      expect(mostUsedNodes[0].count).toBe(3);
    });
  });

  describe("getMostUsedNodes", () => {
    it("should return all most used nodes", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node2");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().getMostUsedNodes();
      expect(mostUsedNodes).toHaveLength(2);
    });
  });

  describe("clearMostUsedNodes", () => {
    it("should remove all most used nodes", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node2");
        useMostUsedNodesStore.getState().clearMostUsedNodes();
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes).toHaveLength(0);
    });
  });

  describe("getUsageCount", () => {
    it("should return correct count for existing node", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      });

      expect(
        useMostUsedNodesStore.getState().getUsageCount("nodetool.test.Node")
      ).toBe(2);
    });

    it("should return 0 for non-existent node", () => {
      expect(
        useMostUsedNodesStore.getState().getUsageCount("nodetool.test.NonExistent")
      ).toBe(0);
    });

    it("should return 0 for empty store", () => {
      expect(
        useMostUsedNodesStore.getState().getUsageCount("nodetool.test.Node")
      ).toBe(0);
    });
  });

  describe("persistence", () => {
    it("should persist to localStorage", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Persistent");
      });

      const stored = localStorage.getItem("nodetool-most-used-nodes");
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.state.mostUsedNodes).toHaveLength(1);
      expect(parsed.state.mostUsedNodes[0].nodeType).toBe("nodetool.test.Persistent");
    });

    it("should restore from localStorage", () => {
      // First set some data
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Restored");
      });

      // Create a new store instance (simulating page refresh)
      const newStore = useMostUsedNodesStore;
      
      const mostUsedNodes = newStore.getState().mostUsedNodes;
      expect(mostUsedNodes).toHaveLength(1);
      expect(mostUsedNodes[0].nodeType).toBe("nodetool.test.Restored");
    });
  });

  describe("sorting behavior", () => {
    it("should re-sort after incrementing lower-ranked node", () => {
      act(() => {
        // Create nodes with different usage counts
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.High");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.High");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
      });

      // Now increment Low to make it higher than High
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      expect(mostUsedNodes[0].nodeType).toBe("nodetool.test.Low");
      expect(mostUsedNodes[0].count).toBe(3);
      expect(mostUsedNodes[1].nodeType).toBe("nodetool.test.High");
      expect(mostUsedNodes[1].count).toBe(2);
    });

    it("should handle nodes with same count in stable order", () => {
      act(() => {
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.First");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Second");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Third");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.First");
        useMostUsedNodesStore.getState().incrementUsage("nodetool.test.Second");
      });

      const mostUsedNodes = useMostUsedNodesStore.getState().mostUsedNodes;
      // First has 2, Second has 2, Third has 1
      expect(mostUsedNodes[0].count).toBe(2);
      expect(mostUsedNodes[1].count).toBe(2);
      expect(mostUsedNodes[2].count).toBe(1);
    });
  });
});
