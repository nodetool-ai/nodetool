import { resolveWorkflowId } from "../workflow";
import type { FrontendToolState } from "../../frontendTools";

function makeState(
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState {
  return {
    currentWorkflowId: "wf-default",
    setCurrentWorkflowId: jest.fn(),
    nodeMetadata: {},
    getNodeStore: jest.fn().mockReturnValue(null),
    ...overrides
  } as unknown as FrontendToolState;
}

describe("resolveWorkflowId", () => {
  it("returns currentWorkflowId when no workflow_id is provided", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    expect(resolveWorkflowId(state)).toBe("wf-123");
  });

  it("returns currentWorkflowId when workflow_id is null", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    expect(resolveWorkflowId(state, null)).toBe("wf-123");
  });

  it("returns currentWorkflowId when workflow_id is undefined", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    expect(resolveWorkflowId(state, undefined)).toBe("wf-123");
  });

  it("throws when no current workflow is selected and no id provided", () => {
    const state = makeState({ currentWorkflowId: "" });
    expect(() => resolveWorkflowId(state)).toThrow(
      "No current workflow selected"
    );
  });

  it("returns the provided workflow_id when it differs from current", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    expect(resolveWorkflowId(state, "wf-other")).toBe("wf-other");
  });

  it("calls setCurrentWorkflowId when workflow_id differs from current", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    resolveWorkflowId(state, "wf-other");
    expect(state.setCurrentWorkflowId).toHaveBeenCalledWith("wf-other");
  });

  it("does not call setCurrentWorkflowId when workflow_id matches current", () => {
    const state = makeState({ currentWorkflowId: "wf-123" });
    resolveWorkflowId(state, "wf-123");
    expect(state.setCurrentWorkflowId).not.toHaveBeenCalled();
  });
});
