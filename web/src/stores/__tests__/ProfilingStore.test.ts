import { act } from "react-dom/test-utils";
import useProfilingStore, { NodeProfile } from "../ProfilingStore";

describe("ProfilingStore", () => {
  beforeEach(() => {
    act(() => {
      useProfilingStore.setState({ profiles: {}, isProfiling: false, currentWorkflowId: null });
    });
  });

  describe("startProfiling", () => {
    it("should initialize a new profile for a workflow", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
      });

      const profile = useProfilingStore.getState().profiles["workflow-1"];
      expect(profile).toBeDefined();
      expect(profile.workflowId).toBe("workflow-1");
      expect(profile.startTime).toBeDefined();
      expect(profile.nodeProfiles).toEqual({});
    });

    it("should set isProfiling to true", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
      });

      expect(useProfilingStore.getState().isProfiling).toBe(true);
      expect(useProfilingStore.getState().currentWorkflowId).toBe("workflow-1");
    });
  });

  describe("endProfiling", () => {
    it("should finalize the profile with total duration", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().endProfiling("workflow-1");
      });

      const profile = useProfilingStore.getState().profiles["workflow-1"];
      expect(profile.endTime).toBeDefined();
      expect(profile.totalDuration).toBeDefined();
      expect(profile.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it("should set isProfiling to false", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().endProfiling("workflow-1");
      });

      expect(useProfilingStore.getState().isProfiling).toBe(false);
      expect(useProfilingStore.getState().currentWorkflowId).toBeNull();
    });
  });

  describe("addNodeProfile", () => {
    it("should add a node profile to the workflow", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-1",
          nodeType: "text",
          title: "Text Node",
          duration: 1000,
          startTime: Date.now() - 1000,
          endTime: Date.now(),
          status: "completed",
        });
      });

      const profile = useProfilingStore.getState().profiles["workflow-1"];
      expect(profile.nodeProfiles["node-1"]).toBeDefined();
      expect(profile.nodeProfiles["node-1"].duration).toBe(1000);
    });

    it("should update existing node profiles", () => {
      const nodeProfile: NodeProfile = {
        nodeId: "node-1",
        nodeType: "text",
        title: "Text Node",
        duration: 1000,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        status: "completed",
      };

      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", nodeProfile);
      });

      const updatedProfile: NodeProfile = {
        ...nodeProfile,
        duration: 2000,
      };

      act(() => {
        useProfilingStore.getState().addNodeProfile("workflow-1", updatedProfile);
      });

      const profile = useProfilingStore.getState().profiles["workflow-1"];
      expect(profile.nodeProfiles["node-1"].duration).toBe(2000);
    });
  });

  describe("getNodeDuration", () => {
    it("should return the duration of a specific node", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-1",
          nodeType: "text",
          title: "Text Node",
          duration: 1500,
          startTime: Date.now() - 1500,
          endTime: Date.now(),
          status: "completed",
        });
      });

      const duration = useProfilingStore.getState().getNodeDuration("workflow-1", "node-1");
      expect(duration).toBe(1500);
    });

    it("should return undefined for non-existent nodes", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
      });

      const duration = useProfilingStore.getState().getNodeDuration("workflow-1", "non-existent");
      expect(duration).toBeUndefined();
    });
  });

  describe("getSlowestNodes", () => {
    it("should return nodes sorted by duration (slowest first)", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-1",
          nodeType: "text",
          title: "Fast Node",
          duration: 500,
          startTime: Date.now(),
          endTime: Date.now(),
          status: "completed",
        });
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-2",
          nodeType: "image",
          title: "Slow Node",
          duration: 3000,
          startTime: Date.now(),
          endTime: Date.now(),
          status: "completed",
        });
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-3",
          nodeType: "audio",
          title: "Medium Node",
          duration: 1500,
          startTime: Date.now(),
          endTime: Date.now(),
          status: "completed",
        });
      });

      const slowestNodes = useProfilingStore.getState().getSlowestNodes("workflow-1");
      expect(slowestNodes.length).toBe(3);
      expect(slowestNodes[0].nodeId).toBe("node-2");
      expect(slowestNodes[1].nodeId).toBe("node-3");
      expect(slowestNodes[2].nodeId).toBe("node-1");
    });

    it("should respect the limit parameter", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        for (let i = 0; i < 5; i++) {
          useProfilingStore.getState().addNodeProfile("workflow-1", {
            nodeId: `node-${i}`,
            nodeType: "text",
            title: `Node ${i}`,
            duration: (i + 1) * 1000,
            startTime: Date.now(),
            endTime: Date.now(),
            status: "completed",
          });
        }
      });

      const slowestNodes = useProfilingStore.getState().getSlowestNodes("workflow-1", 2);
      expect(slowestNodes.length).toBe(2);
    });
  });

  describe("getStatistics", () => {
    it("should return correct statistics for a workflow", () => {
      const baseTime = Date.now();
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-1",
          nodeType: "text",
          title: "Fast Node",
          duration: 500,
          startTime: baseTime,
          endTime: baseTime + 500,
          status: "completed",
        });
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-2",
          nodeType: "image",
          title: "Slow Node",
          duration: 3000,
          startTime: baseTime + 500,
          endTime: baseTime + 3500,
          status: "completed",
        });
        useProfilingStore.getState().endProfiling("workflow-1");
      });

      const stats = useProfilingStore.getState().getStatistics("workflow-1");
      expect(stats).not.toBeNull();
      expect(stats!.nodeCount).toBe(2);
      expect(stats!.slowestNode).not.toBeNull();
      expect(stats!.slowestNode!.nodeId).toBe("node-2");
      expect(stats!.fastestNode).not.toBeNull();
      expect(stats!.fastestNode!.nodeId).toBe("node-1");
    });

    it("should return null for non-existent workflows", () => {
      const stats = useProfilingStore.getState().getStatistics("non-existent");
      expect(stats).toBeNull();
    });
  });

  describe("clearProfile", () => {
    it("should remove a profile from the store", () => {
      act(() => {
        useProfilingStore.getState().startProfiling("workflow-1");
        useProfilingStore.getState().addNodeProfile("workflow-1", {
          nodeId: "node-1",
          nodeType: "text",
          title: "Test Node",
          duration: 1000,
          startTime: Date.now(),
          endTime: Date.now(),
          status: "completed",
        });
        useProfilingStore.getState().clearProfile("workflow-1");
      });

      expect(useProfilingStore.getState().profiles["workflow-1"]).toBeUndefined();
    });
  });
});
