import type { NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import useProviderOnboardingStore from "../ProviderOnboardingStore";
import { handleUpdate } from "../workflowUpdates";

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

let nodeCounter = 0;

type NodeUpdateFixture = {
  type: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: string;
  error: string;
  error_detail?: NodeUpdate["error_detail"];
  job_id: string;
};

const nodeError = (
  jobId: string,
  detail?: NodeUpdate["error_detail"]
): NodeUpdate => {
  const update: NodeUpdateFixture = {
    type: "node_update",
    node_id: `node-${++nodeCounter}`,
    node_name: "Chat",
    node_type: "nodetool.llm.Chat",
    status: "error",
    error: "401 Incorrect API key",
    job_id: jobId
  };
  if (detail) update.error_detail = detail;
  return update as unknown as NodeUpdate;
};

const dispatch = (update: NodeUpdate) =>
  handleUpdate(mockWorkflow, update, mockRunnerStore as never, () => undefined);

const authDetail = {
  code: "provider_auth",
  provider: "openai",
  secret_key: "OPENAI_API_KEY"
} as const;

beforeEach(() => {
  useProviderOnboardingStore.getState().dismiss();
});

describe("handleUpdate — provider auth failures", () => {
  it("opens onboarding on the key that failed", () => {
    dispatch(nodeError("job-a", authDetail));

    const state = useProviderOnboardingStore.getState();
    expect(state.open).toBe(true);
    expect(state.highlightSecretKey).toBe("OPENAI_API_KEY");
    expect(state.reason).toMatch(/openai/i);
  });

  it("opens once per run, not once per failing node", () => {
    dispatch(nodeError("job-b", authDetail));
    useProviderOnboardingStore.getState().dismiss();
    dispatch(nodeError("job-b", authDetail));

    expect(useProviderOnboardingStore.getState().open).toBe(false);
  });

  it("leaves onboarding shut for an error that is not about credentials", () => {
    dispatch(nodeError("job-c"));
    dispatch(
      nodeError("job-c", {
        code: "something_else",
        provider: "openai",
        secret_key: "OPENAI_API_KEY"
      })
    );

    expect(useProviderOnboardingStore.getState().open).toBe(false);
  });
});
