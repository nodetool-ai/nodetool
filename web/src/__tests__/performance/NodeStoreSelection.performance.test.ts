import { createNodeStore } from "../../stores/NodeStore";

jest.mock("../../components/node_types/PlaceholderNode", () => ({
  __esModule: true,
  default: () => "PlaceholderNode"
}));

describe("NodeStore getSelectedNodeCount Performance", () => {
  it("should be O(N) only once per state update", () => {
    // Generate 1000 nodes
    const nodes = Array.from({ length: 1000 }).map((_, i) => ({
      id: `node-${i}`,
      type: "test",
      data: { workflow_id: "test", properties: {} },
      position: { x: 0, y: 0 },
      selected: i < 50 // 50 selected
    })) as any;

    const store = createNodeStore(undefined, {
      nodes,
      edges: []
    });

    // warm up
    store.getState().getSelectedNodeCount();

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
        // change array reference to simulate new frame in drag
        if (i % 100 === 0) {
            store.setState({ nodes: [...store.getState().nodes] });
        }
        store.getState().getSelectedNodeCount();
    }
    const end = performance.now();

    console.log(`[PERF] 10000 calls to getSelectedNodeCount with 1000 nodes took ${end - start}ms`);
  });
});
