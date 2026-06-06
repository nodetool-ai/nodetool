import { makeUpstreamResultGetter } from "../upstreamResult";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { HYDRATED_JOB_ID } from "../../stores/workflowResultHydration";

const WF = "wf1";

const reset = () => {
  useResultsStore.setState({ results: {}, outputResults: {} } as never);
  useWorkflowRunsStore.setState({
    runs: {},
    focusedJob: {},
    pinned: {}
  } as never);
};

describe("makeUpstreamResultGetter", () => {
  beforeEach(reset);

  it("finds a hydrated upstream result even when another run is focused", () => {
    // A real run B is focused but never produced node-x; the upstream value
    // lives only in the hydrated bucket. The getter must still find it.
    useWorkflowRunsStore.getState().recordRun({
      jobId: "B",
      workflowId: WF,
      state: "completed",
      startedAt: 100
    });
    useResultsStore
      .getState()
      .setOutputResult(WF, HYDRATED_JOB_ID, "node-x", { type: "image" });

    const get = makeUpstreamResultGetter(WF);
    expect(get(WF, "node-x")).toEqual({ type: "image" });
  });

  it("prefers the focused run over older runs and the hydrated baseline", () => {
    useWorkflowRunsStore.getState().recordRun({
      jobId: "old",
      workflowId: WF,
      state: "completed",
      startedAt: 1
    });
    useWorkflowRunsStore.getState().recordRun({
      jobId: "new",
      workflowId: WF,
      state: "completed",
      startedAt: 2
    });
    // recordRun auto-focuses the latest ("new").
    useResultsStore.getState().setResult(WF, "old", "node-x", { output: "old" });
    useResultsStore.getState().setResult(WF, "new", "node-x", { output: "new" });
    useResultsStore
      .getState()
      .setOutputResult(WF, HYDRATED_JOB_ID, "node-x", { output: "hydrated" });

    const get = makeUpstreamResultGetter(WF);
    expect(get(WF, "node-x")).toEqual({ output: "new" });
  });

  it("falls back to the newest run that has a value when the focused one has none", () => {
    useWorkflowRunsStore.getState().recordRun({
      jobId: "older",
      workflowId: WF,
      state: "completed",
      startedAt: 1
    });
    useWorkflowRunsStore.getState().recordRun({
      jobId: "focused",
      workflowId: WF,
      state: "completed",
      startedAt: 2
    });
    // "focused" is the latest/focused run but produced nothing for node-x.
    useResultsStore
      .getState()
      .setResult(WF, "older", "node-x", { output: "older" });

    const get = makeUpstreamResultGetter(WF);
    expect(get(WF, "node-x")).toEqual({ output: "older" });
  });

  it("returns undefined when no run holds a value", () => {
    const get = makeUpstreamResultGetter(WF);
    expect(get(WF, "node-x")).toBeUndefined();
  });
});
