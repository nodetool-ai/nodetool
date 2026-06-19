import { createRunnerMessageHandler } from "../runnerProtocol";
import { handleUpdate } from "../../../stores/workflowUpdates";
import type { WorkflowAttributes } from "../../../stores/ApiTypes";
import type { MsgpackData, NodeStore } from "../../../stores/workflowUpdates";
import type { WorkflowRunnerStore } from "../../../stores/WorkflowRunner";

jest.mock("../../../stores/workflowUpdates", () => ({
  handleUpdate: jest.fn()
}));

const mockedHandleUpdate = handleUpdate as jest.MockedFunction<
  typeof handleUpdate
>;

function makeMockStore(): WorkflowRunnerStore {
  return {} as WorkflowRunnerStore;
}

function makeMockWorkflow(): WorkflowAttributes {
  return { id: "wf-1", name: "Test Workflow" } as WorkflowAttributes;
}

describe("createRunnerMessageHandler", () => {
  beforeEach(() => {
    mockedHandleUpdate.mockClear();
  });

  it("returns a function", () => {
    const handler = createRunnerMessageHandler(makeMockStore(), () => undefined);
    expect(typeof handler).toBe("function");
  });

  it("delegates to handleUpdate with the correct arguments", () => {
    const store = makeMockStore();
    const nodeStore = {} as NodeStore;
    const getNodeStore = jest.fn(() => nodeStore);
    const handler = createRunnerMessageHandler(store, getNodeStore);

    const workflow = makeMockWorkflow();
    const data = { type: "job_update", status: "running" } as MsgpackData;

    handler(workflow, data);

    expect(mockedHandleUpdate).toHaveBeenCalledTimes(1);
    expect(mockedHandleUpdate).toHaveBeenCalledWith(
      workflow,
      data,
      store,
      getNodeStore
    );
  });

  it("passes different data payloads through unchanged", () => {
    const store = makeMockStore();
    const handler = createRunnerMessageHandler(store, () => undefined);

    const workflow = makeMockWorkflow();

    const payload1 = { type: "node_update" } as MsgpackData;
    const payload2 = { type: "node_progress" } as MsgpackData;

    handler(workflow, payload1);
    handler(workflow, payload2);

    expect(mockedHandleUpdate).toHaveBeenCalledTimes(2);
    expect(mockedHandleUpdate).toHaveBeenNthCalledWith(
      1,
      workflow,
      payload1,
      store,
      expect.any(Function)
    );
    expect(mockedHandleUpdate).toHaveBeenNthCalledWith(
      2,
      workflow,
      payload2,
      store,
      expect.any(Function)
    );
  });
});
