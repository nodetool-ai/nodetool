import type { JobUpdate, WorkflowAttributes } from "../ApiTypes";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";
import { handleUpdate } from "../workflowUpdates";

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    queuePosition: null,
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

describe("handleUpdate workflow asset refresh", () => {
  let loadWorkflowAssets: jest.Mock;

  beforeEach(() => {
    loadWorkflowAssets = jest.fn().mockResolvedValue([]);
    useWorkflowAssetStore.setState({ loadWorkflowAssets } as never);
  });

  it("reloads the workflow's assets when a job completes", () => {
    const update = {
      type: "job_update",
      status: "completed",
      job_id: "job-1"
    } as unknown as JobUpdate;

    handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

    expect(loadWorkflowAssets).toHaveBeenCalledWith("workflow-1");
  });

  it("does not reload assets while the job is still running", () => {
    const update = {
      type: "job_update",
      status: "running",
      job_id: "job-1"
    } as unknown as JobUpdate;

    handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

    expect(loadWorkflowAssets).not.toHaveBeenCalled();
  });
});
