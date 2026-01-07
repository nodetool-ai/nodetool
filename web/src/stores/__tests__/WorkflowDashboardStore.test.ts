import { renderHook, act } from "@testing-library/react";
import { useWorkflowDashboardStore } from "../WorkflowDashboardStore";

describe("WorkflowDashboardStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowDashboardStore.setState({
      recentWorkflows: [],
      quickActions: [
        {
          id: "new-workflow",
          label: "New Workflow",
          icon: "add",
          action: "create",
          description: "Create a new blank workflow"
        },
        {
          id: "from-template",
          label: "From Template",
          icon: "description",
          action: "template",
          description: "Start from a template"
        },
        {
          id: "import-workflow",
          label: "Import",
          icon: "upload",
          action: "import",
          description: "Import a workflow file"
        },
        {
          id: "open-recent",
          label: "Recent",
          icon: "history",
          action: "recent",
          description: "View recent workflows"
        }
      ],
      recentActivity: [],
      isExpanded: false
    });
  });

  describe("addRecentWorkflow", () => {
    it("should add a new workflow", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Test Workflow",
          nodeCount: 5
        });
      });

      expect(result.current.recentWorkflows).toHaveLength(1);
      expect(result.current.recentWorkflows[0].id).toBe("wf-1");
      expect(result.current.recentWorkflows[0].lastOpened).toBeDefined();
    });

    it("should move existing workflow to top when added again", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Workflow 1",
          nodeCount: 3
        });
      });

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-2",
          name: "Workflow 2",
          nodeCount: 5
        });
      });

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Updated Workflow 1",
          nodeCount: 10
        });
      });

      expect(result.current.recentWorkflows).toHaveLength(2);
      // Updated workflow should be at the top (most recent)
      expect(result.current.recentWorkflows[0].id).toBe("wf-1");
      expect(result.current.recentWorkflows[0].nodeCount).toBe(10);
      expect(result.current.recentWorkflows[1].id).toBe("wf-2");
    });

    it("should sort workflows by lastOpened", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Workflow 1",
          nodeCount: 1
        });
      });

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-2",
          name: "Workflow 2",
          nodeCount: 2
        });
      });

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-3",
          name: "Workflow 3",
          nodeCount: 3
        });
      });

      expect(result.current.recentWorkflows[0].id).toBe("wf-3");
      expect(result.current.recentWorkflows[1].id).toBe("wf-2");
      expect(result.current.recentWorkflows[2].id).toBe("wf-1");
    });
  });

  describe("updateRecentWorkflow", () => {
    it("should update an existing workflow", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Test Workflow",
          nodeCount: 5
        });
      });

      act(() => {
        result.current.updateRecentWorkflow("wf-1", {
          lastRunStatus: "success"
        });
      });

      expect(result.current.recentWorkflows[0].lastRunStatus).toBe("success");
    });
  });

  describe("removeRecentWorkflow", () => {
    it("should remove a workflow", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Test Workflow",
          nodeCount: 5
        });
      });

      act(() => {
        result.current.removeRecentWorkflow("wf-1");
      });

      expect(result.current.recentWorkflows).toHaveLength(0);
    });
  });

  describe("addActivity", () => {
    it("should add activity with timestamp", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addActivity({
          type: "created",
          workflowId: "wf-1",
          workflowName: "Test Workflow"
        });
      });

      expect(result.current.recentActivity).toHaveLength(1);
      expect(result.current.recentActivity[0].timestamp).toBeDefined();
      expect(result.current.recentActivity[0].id).toContain("created-wf-1");
    });

    it("should add run activity with details", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addActivity({
          type: "run",
          workflowId: "wf-1",
          workflowName: "Test Workflow",
          details: "success"
        });
      });

      expect(result.current.recentActivity[0].details).toBe("success");
    });
  });

  describe("getRecentWorkflows", () => {
    it("should return sorted workflows", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-1",
          name: "Workflow 1",
          nodeCount: 1
        });
      });

      act(() => {
        result.current.addRecentWorkflow({
          id: "wf-2",
          name: "Workflow 2",
          nodeCount: 2
        });
      });

      const workflows = result.current.getRecentWorkflows();
      expect(workflows[0].id).toBe("wf-2");
      expect(workflows[1].id).toBe("wf-1");
    });
  });

  describe("getActivityForWorkflow", () => {
    it("should filter activity by workflow", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      act(() => {
        result.current.addActivity({
          type: "opened",
          workflowId: "wf-1",
          workflowName: "Workflow 1"
        });
      });

      act(() => {
        result.current.addActivity({
          type: "created",
          workflowId: "wf-2",
          workflowName: "Workflow 2"
        });
      });

      const wf1Activity = result.current.getActivityForWorkflow("wf-1");
      expect(wf1Activity).toHaveLength(1);
      expect(wf1Activity[0].workflowId).toBe("wf-1");
    });
  });

  describe("toggleExpanded", () => {
    it("should toggle expanded state", () => {
      const { result } = renderHook(() => useWorkflowDashboardStore());

      expect(result.current.isExpanded).toBe(false);

      act(() => {
        result.current.toggleExpanded();
      });

      expect(result.current.isExpanded).toBe(true);

      act(() => {
        result.current.toggleExpanded();
      });

      expect(result.current.isExpanded).toBe(false);
    });
  });
});
