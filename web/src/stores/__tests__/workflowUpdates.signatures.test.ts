/**
 * Spec §3.4 / test S38: handleUpdate stamps each produced (completed) live
 * generation with its dispatch-time inputSignature (read back from the
 * runSignatures registry keyed by jobId), and clears the registry when the run
 * reaches a terminal job_update so it doesn't leak across runs.
 */
import type {
  GenerationComplete,
  JobUpdate,
  NodeUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import { handleUpdate } from "../workflowUpdates";
import {
  recordRunSignatures,
  getRunSignature,
  clearRunSignatures
} from "../runSignatures";

// Keep the real registry (record/get share one in-memory map) but spy on the
// clear so the job-terminal test can assert it fired with the run's job_id.
jest.mock("../runSignatures", () => {
  const actual =
    jest.requireActual<typeof import("../runSignatures")>("../runSignatures");
  return {
    ...actual,
    clearRunSignatures: jest.fn(actual.clearRunSignatures)
  };
});

const mockAddNotification = jest.fn();

const mockRunnerStore = {
  getState: () => ({
    job_id: null,
    state: "running",
    queuePosition: null,
    statusMessage: null,
    addNotification: mockAddNotification
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
  (clearRunSignatures as jest.Mock).mockClear();
});

const dispatch = (data: unknown) =>
  handleUpdate(
    mockWorkflow,
    data as never,
    mockRunnerStore as never,
    () => undefined
  );

const gens = (nodeId: string) =>
  useResultsStore.getState().getLiveGenerations("workflow-1", nodeId);

const genComplete = (
  jobId: string,
  index: number,
  output: unknown,
  nodeId: string
): GenerationComplete =>
  ({
    type: "generation_complete",
    node_id: nodeId,
    node_name: "Computed",
    node_type: "test.Computed",
    index,
    outputs: { output },
    job_id: jobId
  }) as unknown as GenerationComplete;

const nodeUpdate = (
  status: string,
  jobId: string,
  nodeId: string,
  extra: Record<string, unknown> = {}
): NodeUpdate =>
  ({
    type: "node_update",
    node_id: nodeId,
    node_name: "Computed",
    node_type: "test.Computed",
    status,
    job_id: jobId,
    ...extra
  }) as unknown as NodeUpdate;

describe("handleUpdate — stamps live generations with dispatch inputSignature (S38)", () => {
  it("generation_complete: stamps the recorded signature onto the completed generation", () => {
    const jobId = "sig-gc-1";
    const nodeId = "n-gc";
    recordRunSignatures(jobId, { [nodeId]: "SIG-A" });

    dispatch(genComplete(jobId, 0, "img0", nodeId));

    const list = gens(nodeId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId,
      status: "completed",
      outputs: { output: "img0" },
      inputSignature: "SIG-A"
    });

    clearRunSignatures(jobId);
  });

  it("node_update{completed} fallback: stamps the recorded signature onto the synthesized generation", () => {
    const jobId = "sig-nu-1";
    const nodeId = "n-nu";
    recordRunSignatures(jobId, { [nodeId]: "SIG-B" });

    // No prior generation_complete for this (jobId, nodeId) → the fallback fires.
    dispatch(nodeUpdate("completed", jobId, nodeId, { result: { output: 7 } }));

    const list = gens(nodeId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId,
      status: "completed",
      outputs: { output: 7 },
      inputSignature: "SIG-B"
    });

    clearRunSignatures(jobId);
  });

  it("no recorded signature: completed generation carries undefined inputSignature (no crash)", () => {
    const jobId = "sig-none-1";
    const nodeId = "n-none";

    dispatch(genComplete(jobId, 0, "img0", nodeId));

    const list = gens(nodeId);
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("completed");
    expect(list[0].inputSignature).toBeUndefined();
  });

  it("clears the run's signature registry on a terminal job_update", () => {
    const jobId = "sig-term-1";
    const nodeId = "n-term";
    recordRunSignatures(jobId, { [nodeId]: "SIG-C" });
    expect(getRunSignature(jobId, nodeId)).toBe("SIG-C");

    dispatch({
      type: "job_update",
      status: "completed",
      job_id: jobId,
      workflow_id: "workflow-1"
    } as unknown as JobUpdate);

    expect(clearRunSignatures).toHaveBeenCalledWith(jobId);
    // ...and the entry is actually gone, so it can't leak into the next run.
    expect(getRunSignature(jobId, nodeId)).toBeUndefined();
  });
});
