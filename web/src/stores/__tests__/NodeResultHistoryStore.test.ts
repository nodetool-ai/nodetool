import { useNodeResultHistoryStore } from "../NodeResultHistoryStore";

describe("NodeResultHistoryStore", () => {
  beforeEach(() => {
    // Clear history before each test
    useNodeResultHistoryStore.getState().clearAllHistory();
  });

  it("should add result to history", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";
    const nodeId = "node1";
    const result = {
      result: { output: "test" },
      timestamp: Date.now(),
      jobId: "job1",
      status: "completed"
    };

    store.addToHistory(workflowId, nodeId, result);
    const history = store.getHistory(workflowId, nodeId);

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(result);
  });

  it("should maintain history order (most recent first)", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";
    const nodeId = "node1";

    const result1 = {
      result: { output: "first" },
      timestamp: 1000,
      jobId: "job1",
      status: "completed"
    };

    const result2 = {
      result: { output: "second" },
      timestamp: 2000,
      jobId: "job2",
      status: "completed"
    };

    store.addToHistory(workflowId, nodeId, result1);
    store.addToHistory(workflowId, nodeId, result2);

    const history = store.getHistory(workflowId, nodeId);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(result2); // Most recent first
    expect(history[1]).toEqual(result1);
  });

  it("should get correct history count", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";
    const nodeId = "node1";

    expect(store.getHistoryCount(workflowId, nodeId)).toBe(0);

    store.addToHistory(workflowId, nodeId, {
      result: { output: "test" },
      timestamp: Date.now(),
      jobId: "job1",
      status: "completed"
    });

    expect(store.getHistoryCount(workflowId, nodeId)).toBe(1);
  });

  it("should clear node history", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";
    const nodeId = "node1";

    store.addToHistory(workflowId, nodeId, {
      result: { output: "test" },
      timestamp: Date.now(),
      jobId: "job1",
      status: "completed"
    });

    expect(store.getHistoryCount(workflowId, nodeId)).toBe(1);

    store.clearNodeHistory(workflowId, nodeId);
    expect(store.getHistoryCount(workflowId, nodeId)).toBe(0);
  });

  it("should clear workflow history", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";

    store.addToHistory(workflowId, "node1", {
      result: { output: "test1" },
      timestamp: Date.now(),
      jobId: "job1",
      status: "completed"
    });

    store.addToHistory(workflowId, "node2", {
      result: { output: "test2" },
      timestamp: Date.now(),
      jobId: "job1",
      status: "completed"
    });

    expect(store.getHistoryCount(workflowId, "node1")).toBe(1);
    expect(store.getHistoryCount(workflowId, "node2")).toBe(1);

    store.clearWorkflowHistory(workflowId);
    expect(store.getHistoryCount(workflowId, "node1")).toBe(0);
    expect(store.getHistoryCount(workflowId, "node2")).toBe(0);
  });

  it("should limit history to 100 items", () => {
    const store = useNodeResultHistoryStore.getState();
    const workflowId = "workflow1";
    const nodeId = "node1";

    // Add 150 results
    for (let i = 0; i < 150; i++) {
      store.addToHistory(workflowId, nodeId, {
        result: { output: `test${i}` },
        timestamp: Date.now() + i,
        jobId: `job${i}`,
        status: "completed"
      });
    }

    const history = store.getHistory(workflowId, nodeId);
    expect(history).toHaveLength(100); // Limited to 100
    expect(history[0].result.output).toBe("test149"); // Most recent
  });
});
