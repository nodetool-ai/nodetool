import { resolveWorkflowId } from "../workflow";
import type { FrontendToolState } from "../../frontendTools";

function createMockState(
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState {
  return {
    nodeMetadata: {},
    currentWorkflowId: null,
    getWorkflow: jest.fn(),
    addWorkflow: jest.fn(),
    removeWorkflow: jest.fn(),
    getNodeStore: jest.fn(),
    updateWorkflow: jest.fn(),
    saveWorkflow: jest.fn(),
    getCurrentWorkflow: jest.fn(),
    setCurrentWorkflowId: jest.fn(),
    fetchWorkflow: jest.fn(),
    newWorkflow: jest.fn() as unknown as () => ReturnType<
      FrontendToolState["newWorkflow"]
    >,
    createNew: jest.fn(),
    searchTemplates: jest.fn(),
    copy: jest.fn(),
    ...overrides
  };
}

describe("resolveWorkflowId", () => {
  it("returns the explicit workflow_id when provided", () => {
    const state = createMockState({ currentWorkflowId: "current-wf" });
    const result = resolveWorkflowId(state, "explicit-wf");
    expect(result).toBe("explicit-wf");
  });

  it("falls back to currentWorkflowId when workflow_id is undefined", () => {
    const state = createMockState({ currentWorkflowId: "current-wf" });
    const result = resolveWorkflowId(state, undefined);
    expect(result).toBe("current-wf");
  });

  it("falls back to currentWorkflowId when workflow_id is null", () => {
    const state = createMockState({ currentWorkflowId: "current-wf" });
    const result = resolveWorkflowId(state, null);
    expect(result).toBe("current-wf");
  });

  it("throws when no workflow_id is provided and no current workflow", () => {
    const state = createMockState({ currentWorkflowId: null });
    expect(() => resolveWorkflowId(state)).toThrow(
      "No current workflow selected"
    );
  });

  it("does not switch the active tab when explicit id differs from current", () => {
    const state = createMockState({ currentWorkflowId: "old-wf" });
    const result = resolveWorkflowId(state, "new-wf");
    expect(result).toBe("new-wf");
    expect(state.setCurrentWorkflowId).not.toHaveBeenCalled();
  });

  it("does not call setCurrentWorkflowId when explicit id matches current", () => {
    const state = createMockState({ currentWorkflowId: "same-wf" });
    resolveWorkflowId(state, "same-wf");
    expect(state.setCurrentWorkflowId).not.toHaveBeenCalled();
  });

  it("does not call setCurrentWorkflowId when using fallback", () => {
    const state = createMockState({ currentWorkflowId: "current-wf" });
    resolveWorkflowId(state);
    expect(state.setCurrentWorkflowId).not.toHaveBeenCalled();
  });
});
