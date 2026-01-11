import { useFrequentNodesStore } from "../../stores/FrequentNodesStore";

describe("FrequentNodesStore", () => {
  beforeEach(() => {
    useFrequentNodesStore.setState({ frequentNodes: [] });
  });

  it("increments usage count for a node", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("test.Node");
    store.incrementUsage("test.Node");
    store.incrementUsage("test.Node");

    expect(store.getUsageCount("test.Node")).toBe(3);
  });

  it("tracks multiple nodes with different counts", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("nodeA");
    store.incrementUsage("nodeA");
    store.incrementUsage("nodeB");

    expect(store.getUsageCount("nodeA")).toBe(2);
    expect(store.getUsageCount("nodeB")).toBe(1);
    expect(store.getUsageCount("nodeC")).toBe(0);
  });

  it("returns most frequent nodes sorted by count", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("low");
    store.incrementUsage("low");
    store.incrementUsage("high");
    store.incrementUsage("high");
    store.incrementUsage("high");
    store.incrementUsage("medium");
    store.incrementUsage("medium");

    const mostFrequent = store.getMostFrequent(3);

    expect(mostFrequent.length).toBe(3);
    expect(mostFrequent[0].nodeType).toBe("high");
    expect(mostFrequent[0].count).toBe(3);
    expect(mostFrequent[1].nodeType).toBe("medium");
    expect(mostFrequent[2].nodeType).toBe("low");
  });

  it("resets all usage data", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("test.Node");
    store.incrementUsage("test.Node");

    store.resetUsage();

    expect(store.getUsageCount("test.Node")).toBe(0);
    expect(store.getMostFrequent()).toHaveLength(0);
  });

  it("limits to maximum frequent nodes", () => {
    const store = useFrequentNodesStore.getState();

    for (let i = 0; i < 25; i++) {
      store.incrementUsage(`node${i}.Type`);
    }

    const mostFrequent = store.getMostFrequent();
    expect(mostFrequent.length).toBeLessThanOrEqual(20);
  });

  it("does not include nodes with count less than minimum for suggestions", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("frequent");
    store.incrementUsage("frequent");
    store.incrementUsage("infrequent");

    const mostFrequent = store.getMostFrequent();

    expect(mostFrequent.length).toBe(1);
    expect(mostFrequent[0].nodeType).toBe("frequent");
  });

  it("returns top node types as array", () => {
    const store = useFrequentNodesStore.getState();

    store.incrementUsage("node1");
    store.incrementUsage("node1");
    store.incrementUsage("node2");
    store.incrementUsage("node2");
    store.incrementUsage("node3");
    store.incrementUsage("node3");
    store.incrementUsage("node3");

    const topTypes = store.getTopNodeTypes();

    expect(topTypes).toContain("node1");
    expect(topTypes).toContain("node2");
    expect(topTypes).toContain("node3");
    expect(topTypes[0]).toBe("node3");
  });

  it("updates lastUsed timestamp when incrementing", () => {
    const store = useFrequentNodesStore.getState();
    const before = Date.now() - 1000;

    // Need to increment twice to meet minimum usage threshold
    store.incrementUsage("test.Node");
    store.incrementUsage("test.Node");

    const nodes = store.getMostFrequent();
    expect(nodes.length).toBe(1);
    expect(nodes[0].lastUsed).toBeGreaterThanOrEqual(before);
  });
});
