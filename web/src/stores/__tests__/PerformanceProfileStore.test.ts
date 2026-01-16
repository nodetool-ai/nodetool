import { renderHook, act } from "@testing-library/react";
import usePerformanceProfileStore, {
  NodePerformanceData,
  WorkflowPerformanceProfile
} from "../../stores/PerformanceProfileStore";

describe("PerformanceProfileStore", () => {
  beforeEach(() => {
    act(() => {
      usePerformanceProfileStore.getState().clearAllProfiles();
    });
  });

  describe("recordExecution", () => {
    it("should create a new profile for first execution", () => {
      const nodeTimings = {
        "node-1": { nodeName: "LLM Node", nodeType: "llm", duration: 5000 },
        "node-2": { nodeName: "Output Node", nodeType: "output", duration: 100 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          nodeTimings
        );
      });

      const profile = usePerformanceProfileStore.getState().getProfile("workflow-1");
      expect(profile).toBeDefined();
      expect(profile?.workflowId).toBe("workflow-1");
      expect(profile?.workflowName).toBe("Test Workflow");
      expect(profile?.totalRuns).toBe(1);
      expect(profile?.totalDuration).toBe(5100);
      expect(Object.keys(profile?.nodeData || {})).toHaveLength(2);
    });

    it("should aggregate data for multiple executions", () => {
      const firstTimings = {
        "node-1": { nodeName: "LLM Node", nodeType: "llm", duration: 5000 }
      };

      const secondTimings = {
        "node-1": { nodeName: "LLM Node", nodeType: "llm", duration: 3000 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          firstTimings
        );
      });

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          secondTimings
        );
      });

      const profile = usePerformanceProfileStore.getState().getProfile("workflow-1");
      expect(profile?.totalRuns).toBe(2);
      expect(profile?.nodeData["node-1"].executionCount).toBe(2);
      expect(profile?.nodeData["node-1"].averageDuration).toBe(4000);
    });

    it("should identify bottlenecks correctly", () => {
      const timings = {
        "slow-node": { nodeName: "Slow Node", nodeType: "llm", duration: 10000 },
        "fast-node": { nodeName: "Fast Node", nodeType: "output", duration: 100 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          timings
        );
      });

      const profile = usePerformanceProfileStore.getState().getProfile("workflow-1");
      expect(profile?.bottlenecks).toHaveLength(2);
      expect(profile?.bottlenecks[0].nodeName).toBe("Slow Node");
    });
  });

  describe("clearProfile", () => {
    it("should remove a profile", () => {
      const nodeTimings = {
        "node-1": { nodeName: "Test Node", nodeType: "test", duration: 1000 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          nodeTimings
        );
      });

      expect(usePerformanceProfileStore.getState().getProfile("workflow-1")).toBeDefined();

      act(() => {
        usePerformanceProfileStore.getState().clearProfile("workflow-1");
      });

      expect(usePerformanceProfileStore.getState().getProfile("workflow-1")).toBeUndefined();
    });
  });

  describe("clearAllProfiles", () => {
    it("should remove all profiles", () => {
      const nodeTimings = {
        "node-1": { nodeName: "Test Node", nodeType: "test", duration: 1000 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow 1",
          nodeTimings
        );
      });

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-2",
          "Test Workflow 2",
          nodeTimings
        );
      });

      expect(usePerformanceProfileStore.getState().getProfile("workflow-1")).toBeDefined();
      expect(usePerformanceProfileStore.getState().getProfile("workflow-2")).toBeDefined();

      act(() => {
        usePerformanceProfileStore.getState().clearAllProfiles();
      });

      expect(usePerformanceProfileStore.getState().getProfile("workflow-1")).toBeUndefined();
      expect(usePerformanceProfileStore.getState().getProfile("workflow-2")).toBeUndefined();
    });
  });

  describe("setCurrentProfile", () => {
    it("should set the current profile", () => {
      const nodeTimings = {
        "node-1": { nodeName: "Test Node", nodeType: "test", duration: 1000 }
      };

      act(() => {
        usePerformanceProfileStore.getState().recordExecution(
          "workflow-1",
          "Test Workflow",
          nodeTimings
        );
      });

      act(() => {
        usePerformanceProfileStore.getState().setCurrentProfile("workflow-1");
      });

      const currentProfile = usePerformanceProfileStore.getState().getCurrentProfile();
      expect(currentProfile?.workflowId).toBe("workflow-1");
    });

    it("should set currentProfile to null for non-existent workflow", () => {
      act(() => {
        usePerformanceProfileStore.getState().setCurrentProfile("non-existent");
      });

      const currentProfile = usePerformanceProfileStore.getState().getCurrentProfile();
      expect(currentProfile).toBeNull();
    });
  });
});
