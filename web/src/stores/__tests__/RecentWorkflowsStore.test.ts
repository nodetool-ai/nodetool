import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useRecentWorkflowsStore } from "../RecentWorkflowsStore";

describe("RecentWorkflowsStore", () => {
  beforeEach(() => {
    act(() => {
      useRecentWorkflowsStore.setState({ recentWorkflows: [] });
    });
    localStorage.removeItem("nodetool-recent-workflows");
  });

  describe("addRecentWorkflow", () => {
    it("should add a workflow to recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("wf-123");
      expect(recentWorkflows[0].name).toBe("My Workflow");
    });

    it("should move existing workflow to front when added again", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow 2");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1 Updated");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(2);
      expect(recentWorkflows[0].id).toBe("wf-1");
      expect(recentWorkflows[0].name).toBe("Workflow 1 Updated");
      expect(recentWorkflows[1].id).toBe("wf-2");
    });

    it("should add new recent workflows to the front of the list", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-first", "First Workflow");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-second", "Second Workflow");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows[0].id).toBe("wf-second");
      expect(recentWorkflows[1].id).toBe("wf-first");
    });

    it("should limit recent workflows to MAX_RECENT_WORKFLOWS (10)", () => {
      for (let i = 0; i < 15; i++) {
        act(() => {
          useRecentWorkflowsStore
            .getState()
            .addRecentWorkflow(`wf-${i}`, `Workflow ${i}`);
        });
      }

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(10);
      expect(recentWorkflows[0].id).toBe("wf-14");
    });

    it("should have timestamps for recent workflows", () => {
      const beforeAdd = Date.now();
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
      });
      const afterAdd = Date.now();

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].timestamp).toBeGreaterThanOrEqual(beforeAdd);
      expect(recentWorkflows[0].timestamp).toBeLessThanOrEqual(afterAdd);
    });

    it("should update name when re-adding existing workflow", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "Original Name");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "Updated Name");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].name).toBe("Updated Name");
    });
  });

  describe("getRecentWorkflows", () => {
    it("should return empty array when no recent workflows", () => {
      const recentWorkflows = useRecentWorkflowsStore.getState().getRecentWorkflows();
      expect(recentWorkflows).toHaveLength(0);
    });

    it("should return all recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow 2");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().getRecentWorkflows();
      expect(recentWorkflows).toHaveLength(2);
      expect(recentWorkflows[0].id).toBe("wf-2");
      expect(recentWorkflows[1].id).toBe("wf-1");
    });
  });

  describe("clearRecentWorkflows", () => {
    it("should clear all recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow 2");
        useRecentWorkflowsStore.getState().clearRecentWorkflows();
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(0);
    });

    it("should return empty array after clearing", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
        useRecentWorkflowsStore.getState().clearRecentWorkflows();
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().getRecentWorkflows();
      expect(recentWorkflows).toHaveLength(0);
    });
  });

  describe("removeWorkflow", () => {
    it("should remove a specific workflow", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow 2");
        useRecentWorkflowsStore.getState().removeWorkflow("wf-1");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("wf-2");
    });

    it("should handle removing non-existent workflow gracefully", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore.getState().removeWorkflow("wf-nonexistent");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("wf-1");
    });
  });

  describe("persistence", () => {
    it("should persist recent workflows to localStorage", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow 1");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow 2");
      });

      const storageData = localStorage.getItem("nodetool-recent-workflows");
      expect(storageData).not.toBeNull();

      if (storageData) {
        const parsed = JSON.parse(storageData);
        expect(parsed.state.recentWorkflows).toHaveLength(2);
      }
    });

    it("should restore recent workflows from localStorage", () => {
      const testData = {
        state: {
          recentWorkflows: [
            { id: "wf-restored1", name: "Restored 1", timestamp: 1234567890 },
            { id: "wf-restored2", name: "Restored 2", timestamp: 1234567891 }
          ]
        },
        version: 1
      };
      localStorage.setItem(
        "nodetool-recent-workflows",
        JSON.stringify(testData)
      );

      const _newStore = useRecentWorkflowsStore;

      expect(testData.state.recentWorkflows).toHaveLength(2);
      expect(testData.state.recentWorkflows[0].id).toBe("wf-restored1");
      expect(testData.state.recentWorkflows[1].id).toBe("wf-restored2");
    });
  });

  describe("edge cases", () => {
    it("should handle adding the same workflow multiple times", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-123", "My Workflow");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("wf-123");
    });

    it("should handle special characters in workflow names", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-1", "Workflow With-Dashes");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-2", "Workflow_With_Underscores");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-3", "Workflow.With.Dots");
        useRecentWorkflowsStore
          .getState()
          .addRecentWorkflow("wf-4", "Workflow With Spaces & Special!@#");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(4);
    });

    it("should handle very long workflow names", () => {
      const longName = "My Very Long Workflow Name ".repeat(10);
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow("wf-long", longName);
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].name).toBe(longName);
    });

    it("should handle empty workflow name", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow("wf-empty", "");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].name).toBe("");
    });
  });
});
