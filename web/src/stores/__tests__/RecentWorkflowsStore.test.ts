import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  useRecentWorkflowsStore,
  RecentWorkflow
} from "../RecentWorkflowsStore";

describe("RecentWorkflowsStore", () => {
  beforeEach(() => {
    act(() => {
      useRecentWorkflowsStore.setState({ recentWorkflows: [] });
    });
    localStorage.removeItem("nodetool-recent-workflows");
  });

  describe("addRecentWorkflow", () => {
    it("should add a workflow to recent list", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "My Workflow"
        );
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("workflow-1");
      expect(recentWorkflows[0].name).toBe("My Workflow");
    });

    it("should move existing workflow to front when added again", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "First Workflow"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Second Workflow"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Updated Workflow"
        );
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(2);
      expect(recentWorkflows[0].id).toBe("workflow-1");
      expect(recentWorkflows[0].name).toBe("Updated Workflow");
      expect(recentWorkflows[1].id).toBe("workflow-2");
    });

    it("should add new workflows to the front of the list", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "First"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Second"
        );
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows[0].id).toBe("workflow-2");
      expect(recentWorkflows[1].id).toBe("workflow-1");
    });

    it("should limit recent workflows to MAX_RECENT_WORKFLOWS", () => {
      for (let i = 0; i < 15; i++) {
        act(() => {
          useRecentWorkflowsStore
            .getState()
            .addRecentWorkflow(`workflow-${i}`, `Workflow ${i}`);
        });
      }

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(10);
      expect(recentWorkflows[0].id).toBe("workflow-14");
    });
  });

  describe("removeRecentWorkflow", () => {
    it("should remove a workflow from recent list", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Workflow 1"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Workflow 2"
        );
        useRecentWorkflowsStore.getState().removeRecentWorkflow("workflow-1");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(1);
      expect(recentWorkflows[0].id).toBe("workflow-2");
    });

    it("should handle removing non-existent workflow gracefully", () => {
      act(() => {
        useRecentWorkflowsStore
          .getState()
          .removeRecentWorkflow("non-existent");
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(0);
    });
  });

  describe("isRecentWorkflow", () => {
    it("should return true for recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Workflow 1"
        );
      });

      expect(
        useRecentWorkflowsStore.getState().isRecentWorkflow("workflow-1")
      ).toBe(true);
    });

    it("should return false for non-recent workflows", () => {
      expect(
        useRecentWorkflowsStore.getState().isRecentWorkflow("workflow-1")
      ).toBe(false);
    });
  });

  describe("clearRecentWorkflows", () => {
    it("should remove all recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Workflow 1"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Workflow 2"
        );
        useRecentWorkflowsStore.getState().clearRecentWorkflows();
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(0);
    });
  });

  describe("getRecentWorkflows", () => {
    it("should return all recent workflows", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Workflow 1"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Workflow 2"
        );
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().getRecentWorkflows();
      expect(recentWorkflows).toHaveLength(2);
    });
  });

  describe("persistence", () => {
    beforeEach(() => {
      act(() => {
        useRecentWorkflowsStore.setState({ recentWorkflows: [] });
      });
      localStorage.removeItem("nodetool-recent-workflows");
    });

    it("should persist recent workflows to localStorage", () => {
      act(() => {
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-1",
          "Workflow 1"
        );
        useRecentWorkflowsStore.getState().addRecentWorkflow(
          "workflow-2",
          "Workflow 2"
        );
      });

      const stored = localStorage.getItem("nodetool-recent-workflows");
      expect(stored).not.toBeNull();

      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.recentWorkflows).toHaveLength(2);
        expect(parsed.state.recentWorkflows[0].id).toBe("workflow-2");
      }
    });

    it("should load persisted data when localStorage has data", () => {
      const storedData = JSON.stringify({
        state: {
          recentWorkflows: [
            { id: "restored-1", name: "Restored 1", timestamp: Date.now() },
            { id: "restored-2", name: "Restored 2", timestamp: Date.now() }
          ]
        },
        version: 1
      });
      localStorage.setItem("nodetool-recent-workflows", storedData);

      act(() => {
        useRecentWorkflowsStore.persist.rehydrate();
      });

      const recentWorkflows = useRecentWorkflowsStore.getState().recentWorkflows;
      expect(recentWorkflows).toHaveLength(2);
      expect(recentWorkflows[0].id).toBe("restored-1");
    });
  });
});
