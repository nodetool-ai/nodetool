/**
 * Ambient-liveness counter: how many *other* (non-focused) runs are currently
 * executing this node. The focused run is represented by the node's primary
 * animation, so it is excluded here. Only runs in the `running` state with the
 * node in an active node-status (running/starting/booting) are counted.
 */
import { renderHook, act } from "@testing-library/react";
import useStatusStore from "../../../stores/StatusStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useNodeActiveRunCount } from "../useNodeExecState";

const WF = "wf";
const NODE = "n";

beforeEach(() => {
  useStatusStore.setState({ statuses: {} });
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
});

describe("useNodeActiveRunCount", () => {
  it("returns 0 when there are no runs", () => {
    const { result } = renderHook(() => useNodeActiveRunCount(WF, NODE));
    expect(result.current).toBe(0);
  });

  it("counts other running runs where the node is active, excluding the focused run", () => {
    act(() => {
      // C is recorded last, so it auto-focuses.
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "running", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "C", workflowId: WF, state: "running", startedAt: 3 });
      useStatusStore.getState().setStatus(WF, "A", NODE, "running");
      useStatusStore.getState().setStatus(WF, "B", NODE, "starting");
      // C is active too, but it is the focused run → excluded.
      useStatusStore.getState().setStatus(WF, "C", NODE, "running");
    });

    expect(useWorkflowRunsStore.getState().getFocusedJob(WF)).toBe("C");

    const { result } = renderHook(() => useNodeActiveRunCount(WF, NODE));
    expect(result.current).toBe(2);
  });

  it("excludes non-running runs and nodes that are not active", () => {
    act(() => {
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "completed", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "focus", workflowId: WF, state: "running", startedAt: 3 });
      // A: node "active" but the run itself is completed → excluded.
      useStatusStore.getState().setStatus(WF, "A", NODE, "running");
      // B: run is running but the node already finished → excluded.
      useStatusStore.getState().setStatus(WF, "B", NODE, "completed");
    });

    const { result } = renderHook(() => useNodeActiveRunCount(WF, NODE));
    expect(result.current).toBe(0);
  });

  it("re-renders when another run's node becomes active and inactive", () => {
    act(() => {
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "other", workflowId: WF, state: "running", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "focus", workflowId: WF, state: "running", startedAt: 2 });
    });

    expect(useWorkflowRunsStore.getState().getFocusedJob(WF)).toBe("focus");

    const { result } = renderHook(() => useNodeActiveRunCount(WF, NODE));
    expect(result.current).toBe(0);

    act(() => {
      useStatusStore.getState().setStatus(WF, "other", NODE, "running");
    });
    expect(result.current).toBe(1);

    act(() => {
      useStatusStore.getState().setStatus(WF, "other", NODE, "completed");
    });
    expect(result.current).toBe(0);
  });
});
