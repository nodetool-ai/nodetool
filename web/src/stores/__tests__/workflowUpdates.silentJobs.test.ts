import type { NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import { handleUpdate } from "../workflowUpdates";
import { markJobSilent, unmarkJobSilent } from "../previewJobs";

const mockRunnerStore = {
  getState: () => ({
    job_id: "runner-job",
    state: "running",
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

const nodeUpdate = (status: string, jobId: string): NodeUpdate =>
  ({
    type: "node_update",
    node_id: "n1",
    node_name: "Node 1",
    node_type: "test.Node",
    status,
    result: status === "completed" ? { output: 1 } : undefined,
    job_id: jobId
  }) as unknown as NodeUpdate;

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useStatusStore.setState({ statuses: {} } as never);
  mockRunnerStore.setState.mockClear();
});

describe("handleUpdate — silent (live-preview) jobs", () => {
  it("updates the live generation but records no per-node status", () => {
    markJobSilent("preview-1");
    try {
      handleUpdate(
        mockWorkflow,
        nodeUpdate("running", "preview-1"),
        mockRunnerStore as never,
        () => undefined
      );
      handleUpdate(
        mockWorkflow,
        nodeUpdate("completed", "preview-1"),
        mockRunnerStore as never,
        () => undefined
      );

      // The picture still updates …
      const gens = useResultsStore
        .getState()
        .getLiveGenerations("workflow-1", "n1");
      expect(gens).toHaveLength(1);
      expect(gens[0]).toMatchObject({ status: "completed" });

      // … but nothing drives the running ring / timing badge / ambient ring.
      expect(
        useStatusStore.getState().getStatus("workflow-1", "preview-1", "n1")
      ).toBeUndefined();
    } finally {
      unmarkJobSilent("preview-1");
    }
  });

  it("still records status for a normal (non-silent) job", () => {
    handleUpdate(
      mockWorkflow,
      nodeUpdate("completed", "normal-1"),
      mockRunnerStore as never,
      () => undefined
    );
    expect(
      useStatusStore.getState().getStatus("workflow-1", "normal-1", "n1")
    ).toBe("completed");
  });
});
