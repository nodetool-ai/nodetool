/**
 * Tests for useNodeExecState accessor hooks.
 * These hooks centralize node exec-state reads so the focused-run lens
 * can be resolved in one place in a later task.
 */
import { renderHook, act } from "@testing-library/react";
import useStatusStore from "../../../stores/StatusStore";
import useResultsStore from "../../../stores/ResultsStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import {
  useNodeStatus,
  useNodeProgress,
} from "../useNodeExecState";

const WF = "wf-test";
const JOB = "job-1";
const NODE = "node-1";

beforeEach(() => {
  // Reset relevant slices of each store to a clean state
  useStatusStore.setState({ statuses: {} });
  useResultsStore.setState({ progress: {}, edges: {} });
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  // Most status reads resolve against the workflow's focused run.
  useWorkflowRunsStore.getState().recordRun({
    jobId: JOB,
    workflowId: WF,
    state: "running",
    startedAt: 1
  });
});

describe("useNodeStatus", () => {
  it("returns undefined when no status has been set", () => {
    const { result } = renderHook(() => useNodeStatus(WF, NODE));
    expect(result.current).toBeUndefined();
  });

  it("returns the status value that was set in the store", () => {
    act(() => {
      useStatusStore.getState().setStatus(WF, JOB, NODE, "running");
    });
    const { result } = renderHook(() => useNodeStatus(WF, NODE));
    expect(result.current).toBe("running");
  });

  it("re-renders when the store value changes", () => {
    const { result } = renderHook(() => useNodeStatus(WF, NODE));
    expect(result.current).toBeUndefined();

    act(() => {
      useStatusStore.getState().setStatus(WF, JOB, NODE, "running");
    });
    expect(result.current).toBe("running");

    act(() => {
      useStatusStore.getState().setStatus(WF, JOB, NODE, "completed");
    });
    expect(result.current).toBe("completed");
  });

  it("is keyed by workflowId+nodeId — changes to another node don't affect this hook", () => {
    act(() => {
      useStatusStore.getState().setStatus(WF, JOB, NODE, "running");
      useStatusStore.getState().setStatus(WF, JOB, "node-2", "completed");
    });
    const { result } = renderHook(() => useNodeStatus(WF, NODE));
    expect(result.current).toBe("running");
  });
});

describe("useNodeProgress", () => {
  it("returns undefined when no progress has been set", () => {
    const { result } = renderHook(() => useNodeProgress(WF, NODE));
    expect(result.current).toBeUndefined();
  });

  it("returns the progress object that was set in the store", () => {
    act(() => {
      useResultsStore.getState().setProgress(WF, JOB, NODE, 3, 10);
    });
    const { result } = renderHook(() => useNodeProgress(WF, NODE));
    expect(result.current).toEqual({ progress: 3, total: 10, chunk: "" });
  });

  it("re-renders when progress updates", () => {
    const { result } = renderHook(() => useNodeProgress(WF, NODE));
    expect(result.current).toBeUndefined();

    act(() => {
      useResultsStore.getState().setProgress(WF, JOB, NODE, 5, 20);
    });
    expect(result.current?.progress).toBe(5);
    expect(result.current?.total).toBe(20);

    act(() => {
      useResultsStore.getState().setProgress(WF, JOB, NODE, 20, 20);
    });
    expect(result.current?.progress).toBe(20);
  });
});

