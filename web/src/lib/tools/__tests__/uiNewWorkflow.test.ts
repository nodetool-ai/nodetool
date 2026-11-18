/**
 * @jest-environment node
 */
jest.mock("../builtin/openDocument", () => ({
  openDocument: jest.fn()
}));

import { FrontendToolRegistry } from "../frontendTools";
import { makeFrontendToolState } from "../../../test-utils/frontendToolState";
import { openDocument } from "../builtin/openDocument";
import "../builtin/uiActions";

const openDocumentMock = openDocument as jest.MockedFunction<typeof openDocument>;

describe("ui_new_workflow", () => {
  it("saves an empty named workflow, opens it, and returns its id", async () => {
    const order: string[] = [];
    const draft = { id: "draft-1", name: "New Workflow", graph: { nodes: [], edges: [] } };
    const state = makeFrontendToolState({
      newWorkflow: jest.fn().mockReturnValue(draft),
      addWorkflow: jest.fn(() => order.push("add")),
      saveWorkflow: jest.fn(async () => {
        order.push("save");
      })
    });
    openDocumentMock.mockImplementation(async (_type, id) => {
      order.push("open");
      return { ok: true, type: "workflow", id, already_open: false, url: `workflow://${id}` };
    });

    const result = await FrontendToolRegistry.call(
      "ui_new_workflow",
      { name: "Spiral" },
      "new-workflow",
      { getState: () => state }
    );

    expect(result).toEqual({ ok: true, workflow_id: "draft-1", url: "workflow://draft-1" });
    expect(state.saveWorkflow).toHaveBeenCalledWith({ ...draft, name: "Spiral" });
    expect(openDocumentMock).toHaveBeenCalledWith("workflow", "draft-1", expect.anything());
    expect(order).toEqual(["add", "save", "open"]);
  });

  it("does not open a tab when the save fails", async () => {
    openDocumentMock.mockReset();
    const state = makeFrontendToolState({
      newWorkflow: jest.fn().mockReturnValue({ id: "draft-2", name: "", graph: { nodes: [], edges: [] } }),
      saveWorkflow: jest.fn().mockRejectedValue(new Error("offline"))
    });

    await expect(
      FrontendToolRegistry.call("ui_new_workflow", {}, "new-workflow-fail", { getState: () => state })
    ).rejects.toThrow("offline");
    expect(openDocumentMock).not.toHaveBeenCalled();
  });
});
