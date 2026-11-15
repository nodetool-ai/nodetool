/**
 * @jest-environment node
 */
jest.mock("../../../serverState/useWorkflow", () => ({
  fetchWorkflowById: jest.fn()
}));

import { FrontendToolRegistry } from "../frontendTools";
import { makeFrontendToolState } from "../../../test-utils/frontendToolState";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";
import useResultsStore from "../../../stores/ResultsStore";
import useErrorStore from "../../../stores/ErrorStore";
import useStatusStore from "../../../stores/StatusStore";
import "../builtin/getGraph";
import "../builtin/uiActions";

const WF = "wf-run-report";

const nodes = [
  { id: "step", type: "nodetool.code.Code", position: { x: 0, y: 0 }, data: { title: "Step", properties: {} } },
  { id: "out", type: "nodetool.output.Output", position: { x: 200, y: 0 }, data: { properties: { name: "spiral" } } }
];

const stateWith = (runWorkflow: jest.Mock) =>
  makeFrontendToolState({
    currentWorkflowId: WF,
    getOpenWorkflowIds: () => [WF],
    getNodeStore: jest.fn().mockReturnValue({
      getState: () => ({ nodes, edges: [], findNode: (id: string) => nodes.find((n) => n.id === id) })
    }),
    runWorkflow
  });

const call = (state: ReturnType<typeof stateWith>, name: string, args: unknown) =>
  FrontendToolRegistry.call(name, args, `call-${name}`, { getState: () => state });

beforeEach(() => {
  useWorkflowRunsStore.getState().clearWorkflow(WF);
});

describe("ui_run_workflow wait", () => {
  it("returns only the job id without wait", async () => {
    const state = stateWith(jest.fn().mockResolvedValue("job-a"));
    await expect(call(state, "ui_run_workflow", { workflow_id: WF })).resolves.toEqual({
      ok: true,
      workflow_id: WF,
      job_id: "job-a"
    });
  });

  it("reports its own job when a sibling run of the same workflow ends differently", async () => {
    const state = stateWith(jest.fn().mockResolvedValue("job-a"));
    const runs = useWorkflowRunsStore.getState();
    runs.recordRun({ jobId: "job-a", workflowId: WF, state: "running", startedAt: 1 });
    runs.recordRun({ jobId: "job-b", workflowId: WF, state: "running", startedAt: 2 });

    const pending = call(state, "ui_run_workflow", { workflow_id: WF, wait: true });

    useResultsStore.getState().setOutputResult(WF, "job-b", "out", "sibling value");
    useErrorStore.getState().setError(WF, "job-b", "step", "sibling failure");
    runs.updateRunState(WF, "job-b", "error", "sibling job failed");
    useResultsStore.getState().setOutputResult(WF, "job-a", "out", {
      type: "image",
      uri: "asset://abc.png",
      data: new Uint8Array(4096)
    });
    runs.updateRunState(WF, "job-a", "completed");

    await expect(pending).resolves.toEqual({
      ok: true,
      workflow_id: WF,
      job_id: "job-a",
      status: "completed",
      outputs: { spiral: { type: "image", uri: "asset://abc.png" } },
      node_errors: []
    });
  });

  it("reports node errors and the job error when the run fails", async () => {
    const state = stateWith(jest.fn().mockResolvedValue("job-c"));
    const runs = useWorkflowRunsStore.getState();
    runs.recordRun({ jobId: "job-c", workflowId: WF, state: "running", startedAt: 1 });

    const pending = call(state, "ui_run_workflow", { workflow_id: WF, wait: true });
    useErrorStore.getState().setError(WF, "job-c", "step", "inputs.size is undefined");
    runs.updateRunState(WF, "job-c", "error", "Node step failed");

    await expect(pending).resolves.toMatchObject({
      status: "error",
      error: "Node step failed",
      node_errors: [{ node_id: "step", title: "Step", message: "inputs.size is undefined" }]
    });
  });

  it("returns status running at the timeout and leaves the run going", async () => {
    jest.useFakeTimers();
    try {
      const state = stateWith(jest.fn().mockResolvedValue("job-d"));
      useWorkflowRunsStore.getState().recordRun({ jobId: "job-d", workflowId: WF, state: "running", startedAt: 1 });
      const pending = call(state, "ui_run_workflow", { workflow_id: WF, wait: true, timeout_seconds: 2 });
      await jest.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toMatchObject({ job_id: "job-d", status: "running" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("ui_get_graph last_run", () => {
  it("carries the shown run's state on each node", async () => {
    const state = stateWith(jest.fn());
    const runs = useWorkflowRunsStore.getState();
    runs.recordRun({ jobId: "job-e", workflowId: WF, state: "error", startedAt: 1 });
    runs.setFocusedJob(WF, "job-e");
    useStatusStore.getState().setStatus(WF, "job-e", "step", "error");
    useErrorStore.getState().setError(WF, "job-e", "step", "boom");

    const graph = (await call(state, "ui_get_graph", { workflow_id: WF })) as {
      last_run_job_id?: string;
      nodes: Array<{ id: string; last_run?: unknown }>;
    };

    expect(graph.last_run_job_id).toBe("job-e");
    expect(graph.nodes.find((n) => n.id === "step")?.last_run).toEqual({ status: "error", error: "boom" });
    expect(graph.nodes.find((n) => n.id === "out")?.last_run).toBeUndefined();
  });
});
