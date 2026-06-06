/**
 * Proves the per-run flip: node status/error are keyed by job, and the
 * accessor hooks resolve the workflow's *focused* run from WorkflowRunsStore.
 * Two concurrent runs (A, B) carry different values for the same node; the
 * hook returns whichever run is focused, and re-renders when focus switches.
 */
import { renderHook, act } from "@testing-library/react";
import useStatusStore from "../../../stores/StatusStore";
import useErrorStore from "../../../stores/ErrorStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useNodeStatus, useNodeError } from "../useNodeExecState";

const WF = "wf";
const NODE = "n";

beforeEach(() => {
  useStatusStore.setState({ statuses: {} });
  useErrorStore.setState({ errors: {} });
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
});

describe("useNodeStatus — focused-run isolation", () => {
  it("returns the focused run's status and re-renders when focus switches", () => {
    act(() => {
      // B is recorded last, so it auto-focuses.
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "running", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useStatusStore.getState().setStatus(WF, "A", NODE, "running");
      useStatusStore.getState().setStatus(WF, "B", NODE, "completed");
    });

    expect(useWorkflowRunsStore.getState().getFocusedJob(WF)).toBe("B");

    const { result } = renderHook(() => useNodeStatus(WF, NODE));
    // Focused = B
    expect(result.current).toBe("completed");

    // Switch focus to A — the hook must re-render with A's status.
    act(() => {
      useWorkflowRunsStore.getState().setFocusedJob(WF, "A");
    });
    expect(result.current).toBe("running");
  });
});

describe("useNodeError — focused-run isolation", () => {
  it("returns the focused run's error and re-renders when focus switches", () => {
    act(() => {
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "error", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useErrorStore.getState().setError(WF, "A", NODE, "boom-A");
      // B has no error for this node.
    });

    const { result } = renderHook(() => useNodeError(WF, NODE));
    // Focused = B → no error.
    expect(result.current).toBeUndefined();

    act(() => {
      useWorkflowRunsStore.getState().setFocusedJob(WF, "A");
    });
    expect(result.current).toBe("boom-A");
  });
});
