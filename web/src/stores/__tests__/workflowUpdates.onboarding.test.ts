import type { JobUpdate, WorkflowAttributes } from "../ApiTypes";
import { stub } from "../../test-utils/doubles";
import useOnboardingStore from "../OnboardingStore";
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

const jobUpdate = (status: string, jobId: string): JobUpdate =>
  stub<JobUpdate>({ type: "job_update", status, job_id: jobId });

const dispatch = (status: string, jobId = "runner-job") =>
  handleUpdate(
    mockWorkflow,
    jobUpdate(status, jobId),
    mockRunnerStore as never,
    () => undefined
  );

beforeEach(() => {
  useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  mockRunnerStore.setState.mockClear();
});

describe("handleUpdate — run-workflow onboarding step", () => {
  it("marks the step when a run completes", () => {
    dispatch("completed");
    expect(useOnboardingStore.getState().completedSteps).toContain(
      "run-workflow"
    );
  });

  it.each(["running", "failed", "cancelled"])(
    "does not mark the step for a %s run",
    (status) => {
      dispatch(status);
      expect(useOnboardingStore.getState().completedSteps).not.toContain(
        "run-workflow"
      );
    }
  );

  it("does not mark the step for a silent preview run", () => {
    markJobSilent("preview-1");
    try {
      dispatch("completed", "preview-1");
      expect(useOnboardingStore.getState().completedSteps).not.toContain(
        "run-workflow"
      );
    } finally {
      unmarkJobSilent("preview-1");
    }
  });
});
