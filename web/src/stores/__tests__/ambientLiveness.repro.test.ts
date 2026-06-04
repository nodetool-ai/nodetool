/**
 * Reproduction: with two concurrent same-workflow runs driven through the REAL
 * handleUpdate reducer, a node that is running in the non-focused run must make
 * useNodeActiveRunCount return 1 (drives the ambient ring/badge).
 *
 * This exercises the full path the live app uses: job_update messages populate
 * WorkflowRunsStore (run registry + focus), node_update messages populate
 * StatusStore per job. If this passes, the store layer is correct and any live
 * gap is in message delivery; if it fails, the store layer is the bug.
 */
import { renderHook } from "@testing-library/react";
import type { JobUpdate, NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import { createWorkflowRunnerStore } from "../WorkflowRunner";
import { handleUpdate } from "../workflowUpdates";
import useWorkflowRunsStore from "../WorkflowRunsStore";
import useStatusStore from "../StatusStore";
import useResultsStore from "../ResultsStore";
import { useNodeActiveRunCount } from "../../hooks/nodes/useNodeExecState";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    isConnectionOpen: jest.fn().mockReturnValue(true)
  }
}));

jest.mock("../../queryClient", () => ({
  queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) }
}));

const workflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

const getNodeStore = () => undefined;

const jobUpdate = (job_id: string, status: string): JobUpdate =>
  ({ type: "job_update", job_id, status, workflow_id: "wf" }) as JobUpdate;

const nodeUpdate = (
  job_id: string,
  node_id: string,
  status: string
): NodeUpdate =>
  ({
    type: "node_update",
    job_id,
    node_id,
    status,
    workflow_id: "wf"
  }) as unknown as NodeUpdate;

beforeEach(() => {
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  useStatusStore.setState({ statuses: {} });
  useResultsStore.setState({
    results: {},
    outputResults: {},
    providerCosts: {},
    progress: {},
    edges: {},
    chunks: {},
    tasks: {},
    toolCalls: {},
    planningUpdates: {}
  });
});

describe("ambient liveness — two concurrent runs through handleUpdate", () => {
  it("counts the non-focused run that is running a node", () => {
    const runnerStore = createWorkflowRunnerStore("wf");

    // Run A starts and runs node "left".
    handleUpdate(workflow, jobUpdate("A", "running"), runnerStore as never, getNodeStore);
    handleUpdate(workflow, nodeUpdate("A", "left", "running"), runnerStore as never, getNodeStore);

    // Run B starts (auto-focuses, latest-wins) and runs node "right".
    handleUpdate(workflow, jobUpdate("B", "running"), runnerStore as never, getNodeStore);
    handleUpdate(workflow, nodeUpdate("B", "right", "running"), runnerStore as never, getNodeStore);

    // Focus is on B (the latest run).
    expect(useWorkflowRunsStore.getState().getFocusedJob("wf")).toBe("B");

    // Both runs registered and running.
    const runs = useWorkflowRunsStore.getState().getRuns("wf");
    expect(runs.find((r) => r.jobId === "A")?.state).toBe("running");
    expect(runs.find((r) => r.jobId === "B")?.state).toBe("running");

    // "left" is running in A (non-focused) → ambient count 1.
    const { result: left } = renderHook(() => useNodeActiveRunCount("wf", "left"));
    expect(left.current).toBe(1);

    // "right" is running only in the focused run B → ambient count 0.
    const { result: right } = renderHook(() => useNodeActiveRunCount("wf", "right"));
    expect(right.current).toBe(0);

    runnerStore.getState().cleanup();
  });
});
