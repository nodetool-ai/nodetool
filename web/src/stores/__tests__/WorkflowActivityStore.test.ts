import { renderHook, act } from "@testing-library/react";
import { useWorkflowActivityStore } from "../WorkflowActivityStore";
import type { Node } from "@xyflow/react";

describe("WorkflowActivityStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    useWorkflowActivityStore.getState().clearHistory();
  });

  const createMockNodes = (count: number): Node[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node-${i}`,
      type: "mock",
      position: { x: 0, y: 0 },
      data: {}
    }));
  };

  describe("startExecution", () => {
    it("should create a new execution with running status", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(3);

      act(() => {
        result.current.startExecution("wf-1", "Test Workflow", mockNodes);
      });

      expect(result.current.executions).toHaveLength(1);
      expect(result.current.executions[0]).toMatchObject({
        workflowId: "wf-1",
        workflowName: "Test Workflow",
        status: "running",
        nodeCount: 3,
        endTime: null
      });
      expect(result.current.executions[0].startTime).toBeInstanceOf(Date);
      expect(result.current.executions[0].id).toBeTruthy();
    });

    it("should add executions in chronological order (newest first)", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "First", mockNodes);
        result.current.startExecution("wf-2", "Second", mockNodes);
        result.current.startExecution("wf-3", "Third", mockNodes);
      });

      expect(result.current.executions).toHaveLength(3);
      expect(result.current.executions[0].workflowName).toBe("Third");
      expect(result.current.executions[1].workflowName).toBe("Second");
      expect(result.current.executions[2].workflowName).toBe("First");
    });
  });

  describe("completeExecution", () => {
    it("should update execution to completed status with duration", async () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(2);

      let executionId: string;
      act(() => {
        executionId = result.current.startExecution("wf-1", "Test", mockNodes);
      });

      // Wait a bit to ensure duration is calculated
      await new Promise((resolve) => setTimeout(resolve, 100));

      act(() => {
        result.current.completeExecution(executionId!);
      });

      const execution = result.current.executions[0];
      expect(execution.status).toBe("completed");
      expect(execution.endTime).toBeInstanceOf(Date);
      expect(execution.duration).toBeGreaterThan(0);
    });
  });

  describe("failExecution", () => {
    it("should update execution to failed status with error message", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      let executionId: string;
      act(() => {
        executionId = result.current.startExecution("wf-1", "Test", mockNodes);
      });

      act(() => {
        result.current.failExecution(executionId!, "Node processing failed");
      });

      const execution = result.current.executions[0];
      expect(execution.status).toBe("failed");
      expect(execution.errorMessage).toBe("Node processing failed");
      expect(execution.endTime).toBeInstanceOf(Date);
      expect(execution.duration).toBeGreaterThan(0);
    });
  });

  describe("cancelExecution", () => {
    it("should update execution to cancelled status", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      let executionId: string;
      act(() => {
        executionId = result.current.startExecution("wf-1", "Test", mockNodes);
      });

      act(() => {
        result.current.cancelExecution(executionId!);
      });

      const execution = result.current.executions[0];
      expect(execution.status).toBe("cancelled");
      expect(execution.endTime).toBeInstanceOf(Date);
      expect(execution.duration).toBeGreaterThan(0);
    });
  });

  describe("removeExecution", () => {
    it("should remove execution from history", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "First", mockNodes);
        result.current.startExecution("wf-2", "Second", mockNodes);
      });

      expect(result.current.executions).toHaveLength(2);

      act(() => {
        result.current.removeExecution(result.current.executions[0].id);
      });

      expect(result.current.executions).toHaveLength(1);
      expect(result.current.executions[0].workflowName).toBe("Second");
    });
  });

  describe("clearHistory", () => {
    it("should clear all executions", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "First", mockNodes);
        result.current.startExecution("wf-2", "Second", mockNodes);
        result.current.startExecution("wf-3", "Third", mockNodes);
      });

      expect(result.current.executions).toHaveLength(3);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.executions).toHaveLength(0);
    });
  });

  describe("getExecutionsByWorkflow", () => {
    it("should return executions for a specific workflow", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "Workflow 1", mockNodes);
        result.current.startExecution("wf-2", "Workflow 2", mockNodes);
        result.current.startExecution("wf-1", "Workflow 1", mockNodes);
        result.current.startExecution("wf-3", "Workflow 3", mockNodes);
      });

      const wf1Executions = result.current.getExecutionsByWorkflow("wf-1");
      expect(wf1Executions).toHaveLength(2);
      expect(wf1Executions.every((e) => e.workflowId === "wf-1")).toBe(true);
    });
  });

  describe("getRecentExecutions", () => {
    it("should return recent executions up to limit", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        for (let i = 1; i <= 15; i++) {
          result.current.startExecution(`wf-${i}`, `Workflow ${i}`, mockNodes);
        }
      });

      const recent5 = result.current.getRecentExecutions(5);
      expect(recent5).toHaveLength(5);
      expect(recent5[0].workflowName).toBe("Workflow 15");

      const recentDefault = result.current.getRecentExecutions();
      expect(recentDefault).toHaveLength(10);
    });
  });

  describe("getFailedExecutions", () => {
    it("should return only failed executions", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "First", mockNodes);
        result.current.startExecution("wf-2", "Second", mockNodes);
        result.current.startExecution("wf-3", "Third", mockNodes);
        result.current.startExecution("wf-4", "Fourth", mockNodes);

        const executions = result.current.executions;
        result.current.completeExecution(executions[0].id);
        result.current.failExecution(executions[1].id, "Error 1");
        result.current.failExecution(executions[3].id, "Error 2");
        // executions[2] remains running
      });

      const failed = result.current.getFailedExecutions();
      expect(failed).toHaveLength(2);
      expect(failed.every((e) => e.status === "failed")).toBe(true);
    });
  });

  describe("searchExecutions", () => {
    it("should search executions by workflow name", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "Image Generator", mockNodes);
        result.current.startExecution("wf-2", "Text Processor", mockNodes);
        result.current.startExecution("wf-3", "Image Upscaler", mockNodes);
        result.current.startExecution("wf-4", "Video Editor", mockNodes);
      });

      const imageResults = result.current.searchExecutions("image");
      expect(imageResults).toHaveLength(2);
      expect(imageResults.every((e) =>
        e.workflowName.toLowerCase().includes("image")
      )).toBe(true);
    });

    it("should be case-insensitive", () => {
      const { result } = renderHook(() => useWorkflowActivityStore());
      const mockNodes = createMockNodes(1);

      act(() => {
        result.current.startExecution("wf-1", "Test Workflow", mockNodes);
      });

      const results1 = result.current.searchExecutions("test");
      const results2 = result.current.searchExecutions("TEST");
      const results3 = result.current.searchExecutions("Test");

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results3).toHaveLength(1);
    });
  });
});
