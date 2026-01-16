import { act } from "react";
import { useRecentNodesStore } from "../RecentNodesStore";

describe("RecentNodesStore", () => {
  beforeEach(() => {
    useRecentNodesStore.setState({ recentNodes: [] });
  });

  afterEach(() => {
    useRecentNodesStore.setState({ recentNodes: [] });
  });

  it("initializes with empty recent nodes", () => {
    const { recentNodes } = useRecentNodesStore.getState();
    expect(recentNodes).toEqual([]);
  });

  it("adds a node to recent nodes", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("text-node");
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes).toHaveLength(1);
    expect(recentNodes[0].nodeType).toBe("text-node");
    expect(recentNodes[0].timestamp).toBeDefined();
  });

  it("moves node to front when added again", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("text-node");
      useRecentNodesStore.getState().addRecentNode("image-node");
      useRecentNodesStore.getState().addRecentNode("text-node");
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes[0].nodeType).toBe("text-node");
    expect(recentNodes[1].nodeType).toBe("image-node");
  });

  it("removes duplicate when adding existing node", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("text-node");
      useRecentNodesStore.getState().addRecentNode("image-node");
      useRecentNodesStore.getState().addRecentNode("text-node");
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes.filter(n => n.nodeType === "text-node")).toHaveLength(1);
  });

  it("limits to MAX_RECENT_NODES (12)", () => {
    act(() => {
      for (let i = 0; i < 20; i++) {
        useRecentNodesStore.getState().addRecentNode(`node-${i}`);
      }
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes).toHaveLength(12);
    expect(recentNodes[0].nodeType).toBe("node-19");
    expect(recentNodes[11].nodeType).toBe("node-8");
  });

  it("clears all recent nodes", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("node-1");
      useRecentNodesStore.getState().addRecentNode("node-2");
      useRecentNodesStore.getState().clearRecentNodes();
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes).toEqual([]);
  });

  it("getRecentNodes returns current state", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("test-node");
    });
    const result = useRecentNodesStore.getState().getRecentNodes();
    expect(result).toHaveLength(1);
  });

  it("preserves order of different node types", () => {
    act(() => {
      useRecentNodesStore.getState().addRecentNode("a");
      useRecentNodesStore.getState().addRecentNode("b");
      useRecentNodesStore.getState().addRecentNode("c");
      useRecentNodesStore.getState().addRecentNode("d");
    });
    const recentNodes = useRecentNodesStore.getState().getRecentNodes();
    expect(recentNodes.map(n => n.nodeType)).toEqual(["d", "c", "b", "a"]);
  });
});
