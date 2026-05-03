import type { FrontendToolState } from "../frontendTools";

const createMockState = (): FrontendToolState => ({
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
  newWorkflow: jest.fn() as unknown as () => ReturnType<FrontendToolState["newWorkflow"]>,
  createNew: jest.fn(),
  searchTemplates: jest.fn(),
  copy: jest.fn()
});

describe("frontendToolRuntimeState", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("throws when state is not initialized", async () => {
    const { getFrontendToolRuntimeState } = await import(
      "../frontendToolRuntimeState"
    );

    expect(() => getFrontendToolRuntimeState()).toThrow(
      "Frontend tool runtime state is not initialized"
    );
  });

  it("stores state via setFrontendToolRuntimeState", async () => {
    const { setFrontendToolRuntimeState, getFrontendToolRuntimeState } =
      await import("../frontendToolRuntimeState");

    const mockState = createMockState();
    setFrontendToolRuntimeState(mockState);

    expect(() => getFrontendToolRuntimeState()).not.toThrow();
  });

  it("returns the stored state after set", async () => {
    const { setFrontendToolRuntimeState, getFrontendToolRuntimeState } =
      await import("../frontendToolRuntimeState");

    const mockState = createMockState();
    setFrontendToolRuntimeState(mockState);

    expect(getFrontendToolRuntimeState()).toBe(mockState);
  });

  it("replaces the previous state when set again", async () => {
    const { setFrontendToolRuntimeState, getFrontendToolRuntimeState } =
      await import("../frontendToolRuntimeState");

    const firstState = createMockState();
    const secondState = createMockState();
    secondState.currentWorkflowId = "workflow-123";

    setFrontendToolRuntimeState(firstState);
    setFrontendToolRuntimeState(secondState);

    expect(getFrontendToolRuntimeState()).toBe(secondState);
    expect(getFrontendToolRuntimeState()).not.toBe(firstState);
  });
});
