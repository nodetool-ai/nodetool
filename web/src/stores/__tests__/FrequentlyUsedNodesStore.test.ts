import { useFrequentlyUsedNodesStore } from "../FrequentlyUsedNodesStore";

describe("FrequentlyUsedNodesStore", () => {
  beforeEach(() => {
    useFrequentlyUsedNodesStore.setState({
      usageMap: {},
      lastUsedMap: {}
    });
  });

  describe("incrementUsage", () => {
    it("should increment usage count for a node type", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
      const usageMap = useFrequentlyUsedNodesStore.getState().usageMap;
      expect(usageMap["nodetool.test.Node1"]).toBe(1);
    });

    it("should increment usage count multiple times for the same node", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      const usageMap = useFrequentlyUsedNodesStore.getState().usageMap;
      expect(usageMap["nodetool.test.Node"]).toBe(3);
    });

    it("should track different node types separately", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node2");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
      const usageMap = useFrequentlyUsedNodesStore.getState().usageMap;
      expect(usageMap["nodetool.test.Node1"]).toBe(2);
      expect(usageMap["nodetool.test.Node2"]).toBe(1);
    });

    it("should update lastUsed timestamp", () => {
      const before = Date.now() - 100;
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      const after = Date.now() + 100;
      const lastUsed = useFrequentlyUsedNodesStore.getState().lastUsedMap["nodetool.test.Node"];
      expect(lastUsed).toBeGreaterThanOrEqual(before);
      expect(lastUsed).toBeLessThanOrEqual(after);
    });
  });

  describe("getFrequentlyUsed", () => {
    it("should return empty array when no nodes have been used", () => {
      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed).toEqual([]);
    });

    it("should return nodes sorted by usage count (descending)", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.High");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.High");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Low");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Medium");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Medium");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Medium");

      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed.length).toBe(3);
      expect(frequentlyUsed[0].nodeType).toBe("nodetool.test.Medium");
      expect(frequentlyUsed[0].count).toBe(3);
      expect(frequentlyUsed[1].nodeType).toBe("nodetool.test.High");
      expect(frequentlyUsed[1].count).toBe(2);
      expect(frequentlyUsed[2].nodeType).toBe("nodetool.test.Low");
      expect(frequentlyUsed[2].count).toBe(1);
    });

    it("should break ties by last used (more recent first)", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.First");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Second");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.First");

      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed.length).toBe(2);
      expect(frequentlyUsed[0].nodeType).toBe("nodetool.test.First");
      expect(frequentlyUsed[1].nodeType).toBe("nodetool.test.Second");
    });

    it("should limit results to specified limit", () => {
      for (let i = 1; i <= 10; i++) {
        useFrequentlyUsedNodesStore.getState().incrementUsage(`nodetool.test.Node${i}`);
      }

      const limited = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed(5);
      expect(limited.length).toBe(5);
    });

    it("should default to 8 items when no limit specified", () => {
      for (let i = 1; i <= 12; i++) {
        useFrequentlyUsedNodesStore.getState().incrementUsage(`nodetool.test.Node${i}`);
      }

      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed.length).toBe(8);
    });

    it("should include count and lastUsed in result", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed.length).toBe(1);
      expect(frequentlyUsed[0]).toHaveProperty("nodeType", "nodetool.test.Node");
      expect(frequentlyUsed[0]).toHaveProperty("count", 1);
      expect(frequentlyUsed[0]).toHaveProperty("lastUsed");
    });
  });

  describe("clearUsageData", () => {
    it("should clear all usage data", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node1");
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node2");

      useFrequentlyUsedNodesStore.getState().clearUsageData();

      const usageMap = useFrequentlyUsedNodesStore.getState().usageMap;
      const lastUsedMap = useFrequentlyUsedNodesStore.getState().lastUsedMap;
      expect(Object.keys(usageMap)).toHaveLength(0);
      expect(Object.keys(lastUsedMap)).toHaveLength(0);
    });

    it("should return empty array after clearing", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Node");
      useFrequentlyUsedNodesStore.getState().clearUsageData();
      const frequentlyUsed = useFrequentlyUsedNodesStore.getState().getFrequentlyUsed();
      expect(frequentlyUsed).toEqual([]);
    });
  });

  describe("persistence", () => {
    it("should persist usageMap and lastUsedMap to localStorage", () => {
      useFrequentlyUsedNodesStore.getState().incrementUsage("nodetool.test.Persistent");

      const state = useFrequentlyUsedNodesStore.getState();
      expect(state.usageMap["nodetool.test.Persistent"]).toBe(1);
      expect(state.lastUsedMap["nodetool.test.Persistent"]).toBeDefined();
    });
  });
});
