import usePerformanceProfilerStore from "../PerformanceProfilerStore";
import useExecutionTimeStore from "../ExecutionTimeStore";
import useStatusStore from "../StatusStore";

describe("PerformanceProfilerStore", () => {
  beforeEach(() => {
    useExecutionTimeStore.setState({ timings: {} });
    useStatusStore.setState({ statuses: {} });
    usePerformanceProfilerStore.setState({ profiles: {} });
  });

  describe("getProfile", () => {
    it("returns null when no timing data exists", () => {
      const nodeData = { "node1": { name: "Node 1", type: "text" } };
      const profile = usePerformanceProfilerStore.getState().getProfile("wf1", ["node1"], nodeData);
      expect(profile).toBeNull();
    });

    it("calculates profile from timing data", () => {
      useExecutionTimeStore.setState({
        timings: {
          "wf1:node1": { startTime: 1000, endTime: 2000 },
          "wf1:node2": { startTime: 1000, endTime: 1500 }
        }
      });
      useStatusStore.setState({
        statuses: {
          "wf1:node1": "completed",
          "wf1:node2": "completed"
        }
      });

      const nodeData = {
        "node1": { name: "LLM Node", type: "llm" },
        "node2": { name: "Text Output", type: "output" }
      };

      const profile = usePerformanceProfilerStore.getState().getProfile("wf1", ["node1", "node2"], nodeData);

      expect(profile).not.toBeNull();
      expect(profile!.totalDuration).toBe(1500);
      expect(profile!.nodeCount).toBe(2);
      expect(profile!.completedNodes).toBe(2);
      expect(profile!.failedNodes).toBe(0);
    });

    it("identifies bottleneck nodes", () => {
      useExecutionTimeStore.setState({
        timings: {
          "wf1:node1": { startTime: 1000, endTime: 1100 },
          "wf1:node2": { startTime: 1000, endTime: 4100 },
          "wf1:node3": { startTime: 1000, endTime: 8100 }
        }
      });
      useStatusStore.setState({
        statuses: {
          "wf1:node1": "completed",
          "wf1:node2": "completed",
          "wf1:node3": "completed"
        }
      });

      const nodeData = {
        "node1": { name: "Fast Node", type: "input" },
        "node2": { name: "Medium Node", type: "processor" },
        "node3": { name: "Slow LLM", type: "llm" }
      };

      const profile = usePerformanceProfilerStore.getState().getProfile("wf1", ["node1", "node2", "node3"], nodeData);

      expect(profile).not.toBeNull();
      expect(profile!.totalDuration).toBe(10300);
      expect(profile!.bottleneckNodes.length).toBe(1);
      expect(profile!.bottleneckNodes[0].nodeId).toBe("node3");
    });

    it("handles failed nodes", () => {
      useExecutionTimeStore.setState({
        timings: {
          "wf1:node1": { startTime: 1000, endTime: 2000 }
        }
      });
      useStatusStore.setState({
        statuses: {
          "wf1:node1": "error"
        }
      });

      const nodeData = { "node1": { name: "Failed Node", type: "llm" } };
      const profile = usePerformanceProfilerStore.getState().getProfile("wf1", ["node1"], nodeData);

      expect(profile).not.toBeNull();
      expect(profile!.failedNodes).toBe(1);
    });
  });

  describe("clearProfile", () => {
    it("removes profile from store", () => {
      useExecutionTimeStore.setState({
        timings: { "wf1:node1": { startTime: 1000, endTime: 2000 } }
      });
      useStatusStore.setState({
        statuses: { "wf1:node1": "completed" }
      });

      const nodeData = { "node1": { name: "Node", type: "input" } };
      usePerformanceProfilerStore.getState().getProfile("wf1", ["node1"], nodeData);

      expect(usePerformanceProfilerStore.getState().profiles["wf1"]).toBeDefined();

      usePerformanceProfilerStore.getState().clearProfile("wf1");

      expect(usePerformanceProfilerStore.getState().profiles["wf1"]).toBeUndefined();
    });
  });

  describe("getBottlenecks", () => {
    it("returns empty array when no profile exists", () => {
      const bottlenecks = usePerformanceProfilerStore.getState().getBottlenecks("wf1", 50);
      expect(bottlenecks).toEqual([]);
    });

    it("filters bottlenecks by threshold", () => {
      useExecutionTimeStore.setState({
        timings: {
          "wf1:node1": { startTime: 1000, endTime: 2000 },
          "wf1:node2": { startTime: 1000, endTime: 12000 }
        }
      });
      useStatusStore.setState({
        statuses: {
          "wf1:node1": "completed",
          "wf1:node2": "completed"
        }
      });

      const nodeData = {
        "node1": { name: "Fast", type: "input" },
        "node2": { name: "Slow", type: "llm" }
      };

      usePerformanceProfilerStore.getState().getProfile("wf1", ["node1", "node2"], nodeData);

      const allBottlenecks = usePerformanceProfilerStore.getState().getBottlenecks("wf1", 50);
      expect(allBottlenecks.length).toBe(1);

      const strictBottlenecks = usePerformanceProfilerStore.getState().getBottlenecks("wf1", 80);
      expect(strictBottlenecks.length).toBe(1);
    });
  });
});
