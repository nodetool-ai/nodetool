/**
 * Sibling isolation for concurrent same-workflow runs.
 *
 * Node execution state is keyed per run (`${wf}:${jobId}:${node}`) and the
 * canvas focuses one run at a time. When one run terminates, handleUpdate must
 * NOT wipe another run's per-job state. This exercises that through the real
 * runner store + real Status/Runs stores: two runs (A, B) report a node
 * "running", then A completes — B's slice (and A's own) must survive.
 */
import type { JobUpdate, NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import { createWorkflowRunnerStore } from "../WorkflowRunner";
import { handleUpdate } from "../workflowUpdates";
import useWorkflowRunsStore from "../WorkflowRunsStore";
import useStatusStore from "../StatusStore";
import useResultsStore from "../ResultsStore";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    isConnectionOpen: jest.fn().mockReturnValue(true)
  }
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(undefined)
  }
}));

const workflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

const getNodeStore = () => undefined;

beforeEach(() => {
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  useStatusStore.setState({ statuses: {} });
  useResultsStore.setState({
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

describe("concurrent same-workflow runs — sibling isolation", () => {
  it("does not wipe a sibling run's node state when another run completes", () => {
    const runnerStore = createWorkflowRunnerStore("wf");

    const nodeRunningA: NodeUpdate = {
      type: "node_update",
      job_id: "A",
      node_id: "n",
      status: "running"
    } as unknown as NodeUpdate;

    const nodeRunningB: NodeUpdate = {
      type: "node_update",
      job_id: "B",
      node_id: "n",
      status: "running"
    } as unknown as NodeUpdate;

    handleUpdate(workflow, nodeRunningA, runnerStore as never, getNodeStore);
    handleUpdate(workflow, nodeRunningB, runnerStore as never, getNodeStore);

    // Sibling B also reports progress; the old completed branch cleared
    // progress workflow-wide, so this is what proves the regression.
    useResultsStore.getState().setProgress("wf", "B", "n", 3, 10);

    // Both runs have recorded their node as running, under isolated job keys.
    expect(useStatusStore.getState().getStatus("wf", "A", "n")).toBe("running");
    expect(useStatusStore.getState().getStatus("wf", "B", "n")).toBe("running");

    // Run A terminates.
    const jobCompletedA: JobUpdate = {
      type: "job_update",
      status: "completed",
      job_id: "A",
      workflow_id: "wf"
    };
    handleUpdate(workflow, jobCompletedA, runnerStore as never, getNodeStore);

    // B's slice survives A's completion (the old code cleared the whole
    // workflow on the completed branch and would have wiped it)...
    expect(useStatusStore.getState().getStatus("wf", "B", "n")).toBe("running");
    expect(
      useResultsStore.getState().getProgress("wf", "B", "n")
    ).toMatchObject({ progress: 3, total: 10 });
    // ...and A's own finished slice persists so it can still be focused.
    expect(useStatusStore.getState().getStatus("wf", "A", "n")).toBe("running");

    runnerStore.getState().cleanup();
  });
});
