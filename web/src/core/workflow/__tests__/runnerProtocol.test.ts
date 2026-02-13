import { createRunnerMessageHandler } from "../runnerProtocol";
import { handleUpdate } from "../../../stores/workflowUpdates";
import type { MsgpackData } from "../../../stores/workflowUpdates";

jest.mock("../../../stores/workflowUpdates", () => ({
  handleUpdate: jest.fn()
}));

describe("runnerProtocol", () => {
  it("delegates message handling to workflowUpdates", () => {
    const store = {} as any;
    const handler = createRunnerMessageHandler(store as any);
    const workflow = { id: "wf-123" } as any;
    const data: MsgpackData = { type: "job_update", status: "pending", workflow_id: "wf-123" };

    handler(workflow, data);

    expect(handleUpdate).toHaveBeenCalledWith(workflow, data, store);
  });
});
