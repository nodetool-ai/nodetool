import useNodeTimingStore from "../NodeTimingStore";

describe("NodeTimingStore", () => {
  beforeEach(() => {
    useNodeTimingStore.getState().clearAllTimings();
  });

  it("should track node start time", () => {
    const { startNode, getTiming } = useNodeTimingStore.getState();

    startNode("workflow-1", "node-1");

    const timing = getTiming("workflow-1", "node-1");
    expect(timing).toBeDefined();
    expect(timing?.startTime).toBeGreaterThan(0);
    expect(timing?.endTime).toBeNull();
    expect(timing?.duration).toBeNull();
  });

  it("should track node end time and duration", () => {
    const { startNode, endNode, getTiming } = useNodeTimingStore.getState();

    startNode("workflow-1", "node-1");

    const startTiming = getTiming("workflow-1", "node-1");
    const startTime = startTiming?.startTime;

    endNode("workflow-1", "node-1");

    const endTiming = getTiming("workflow-1", "node-1");
    expect(endTiming).toBeDefined();
    expect(endTiming?.startTime).toBe(startTime);
    expect(endTiming?.endTime).toBeGreaterThanOrEqual(startTime!);
    expect(endTiming?.duration).toBeGreaterThanOrEqual(0);
  });

  it("should not set duration if node never started", () => {
    const { endNode, getTiming } = useNodeTimingStore.getState();

    endNode("workflow-1", "node-1");

    const timing = getTiming("workflow-1", "node-1");
    expect(timing).toBeUndefined();
  });

  it("should clear timings for a workflow", () => {
    const { startNode, clearTimings, getTiming } =
      useNodeTimingStore.getState();

    startNode("workflow-1", "node-1");
    startNode("workflow-1", "node-2");
    startNode("workflow-2", "node-1");

    clearTimings("workflow-1");

    expect(getTiming("workflow-1", "node-1")).toBeUndefined();
    expect(getTiming("workflow-1", "node-2")).toBeUndefined();
    expect(getTiming("workflow-2", "node-1")).toBeDefined();
  });

  it("should clear all timings", () => {
    const { startNode, clearAllTimings, getTiming } =
      useNodeTimingStore.getState();

    startNode("workflow-1", "node-1");
    startNode("workflow-2", "node-1");

    clearAllTimings();

    expect(getTiming("workflow-1", "node-1")).toBeUndefined();
    expect(getTiming("workflow-2", "node-1")).toBeUndefined();
  });

  it("should handle multiple nodes independently", () => {
    const { startNode, endNode, getTiming } = useNodeTimingStore.getState();

    startNode("workflow-1", "node-1");
    startNode("workflow-1", "node-2");

    endNode("workflow-1", "node-1");

    const timing1 = getTiming("workflow-1", "node-1");
    const timing2 = getTiming("workflow-1", "node-2");

    expect(timing1?.duration).not.toBeNull();
    expect(timing2?.duration).toBeNull();
  });
});
