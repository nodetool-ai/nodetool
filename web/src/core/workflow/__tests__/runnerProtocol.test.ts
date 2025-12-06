import { createRunnerMessageHandler } from "../runnerProtocol";
import { handleUpdate } from "../../../stores/workflowUpdates";

jest.mock("../../../stores/workflowUpdates", () => ({
  handleUpdate: jest.fn()
}));

describe("runnerProtocol", () => {
  it("delegates message handling to workflowUpdates", () => {
    const store = {} as any;
    const handler = createRunnerMessageHandler(store as any);
    const workflow = { id: "wf-123" } as any;
    const data = { type: "job_update" };

    handler(workflow, data);

    expect(handleUpdate).toHaveBeenCalledWith(workflow, data, store);
  });
});
