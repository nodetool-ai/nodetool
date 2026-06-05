/**
 * Proves the per-run flip for ResultsStore-backed accessors: node progress and
 * edge status are keyed by job, and the accessor hooks resolve the workflow's
 * *focused* run from WorkflowRunsStore. Two concurrent runs (A, B) carry
 * different values for the same node/edge; the hook returns whichever run is
 * focused, and re-renders when focus switches.
 */
import { renderHook, act } from "@testing-library/react";
import useResultsStore from "../../../stores/ResultsStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import { useNodeProgress, useEdgeStatus } from "../useNodeExecState";

const WF = "wf";
const NODE = "n";
const EDGE = "e";

beforeEach(() => {
  useResultsStore.setState({ progress: {}, edges: {} });
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
});

describe("useNodeProgress — focused-run isolation", () => {
  it("returns the focused run's progress and re-renders when focus switches", () => {
    act(() => {
      // B is recorded last, so it auto-focuses.
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "running", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useResultsStore.getState().setProgress(WF, "A", NODE, 1, 2);
      useResultsStore.getState().setProgress(WF, "B", NODE, 2, 2);
    });

    expect(useWorkflowRunsStore.getState().getFocusedJob(WF)).toBe("B");

    const { result } = renderHook(() => useNodeProgress(WF, NODE));
    // Focused = B
    expect(result.current).toMatchObject({ progress: 2, total: 2 });

    // Switch focus to A — the hook must re-render with A's progress.
    act(() => {
      useWorkflowRunsStore.getState().setFocusedJob(WF, "A");
    });
    expect(result.current).toMatchObject({ progress: 1, total: 2 });
  });
});

describe("useEdgeStatus — focused-run isolation", () => {
  it("returns the focused run's edge status and re-renders when focus switches", () => {
    act(() => {
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "A", workflowId: WF, state: "running", startedAt: 1 });
      useWorkflowRunsStore
        .getState()
        .recordRun({ jobId: "B", workflowId: WF, state: "running", startedAt: 2 });
      useResultsStore.getState().setEdge(WF, "A", EDGE, "message_sent", 3);
      useResultsStore.getState().setEdge(WF, "B", EDGE, "drained", 7);
    });

    expect(useWorkflowRunsStore.getState().getFocusedJob(WF)).toBe("B");

    const { result } = renderHook(() => useEdgeStatus(WF, EDGE));
    // Focused = B
    expect(result.current).toEqual({ status: "drained", counter: 7 });

    // Switch focus to A — the hook must re-render with A's edge status.
    act(() => {
      useWorkflowRunsStore.getState().setFocusedJob(WF, "A");
    });
    expect(result.current).toEqual({ status: "message_sent", counter: 3 });
  });
});
