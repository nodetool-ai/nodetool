import { renderHook, act } from "@testing-library/react";
import { useWorkflowActivity } from "../useWorkflowActivity";
import { useWorkflowActivityStore } from "../../stores/WorkflowActivityStore";
import type { Node } from "@xyflow/react";

describe("useWorkflowActivity", () => {
  const createMockNodes = (count: number): Node[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node-${i}`,
      type: "mock",
      position: { x: 0, y: 0 },
      data: {}
    }));
  };

  beforeEach(() => {
    useWorkflowActivityStore.getState().clearHistory();
  });

  it("should return null when workflowId is null", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity(null, "Test Workflow", [])
    );

    const executionId = result.current.start();
    expect(executionId).toBeNull();
  });

  it("should return null when workflowName is null", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity("wf-1", null, [])
    );

    const executionId = result.current.start();
    expect(executionId).toBeNull();
  });

  it("should start execution tracking", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity("wf-1", "Test Workflow", createMockNodes(3))
    );

    const executionId = result.current.start();
    expect(executionId).toBeTruthy();
    const executions = useWorkflowActivityStore.getState().executions;
    expect(executions).toHaveLength(1);
    expect(executions[0].workflowId).toBe("wf-1");
  });

  it("should complete execution", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity("wf-1", "Test", createMockNodes(1))
    );

    const executionId = result.current.start();
    act(() => {
      result.current.complete(executionId!);
    });

    const execution = useWorkflowActivityStore.getState().executions[0];
    expect(execution.status).toBe("completed");
  });

  it("should fail execution with error message", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity("wf-1", "Test", createMockNodes(1))
    );

    const executionId = result.current.start();
    act(() => {
      result.current.fail(executionId!, "Node error");
    });

    const execution = useWorkflowActivityStore.getState().executions[0];
    expect(execution.status).toBe("failed");
    expect(execution.errorMessage).toBe("Node error");
  });

  it("should cancel execution", () => {
    const { result } = renderHook(() =>
      useWorkflowActivity("wf-1", "Test", createMockNodes(1))
    );

    const executionId = result.current.start();
    act(() => {
      result.current.cancel(executionId!);
    });

    const execution = useWorkflowActivityStore.getState().executions[0];
    expect(execution.status).toBe("cancelled");
  });
});
