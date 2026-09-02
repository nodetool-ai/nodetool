import { makeFrontendToolState } from "../../../test-utils/frontendToolState";

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

    const mockState = makeFrontendToolState();
    setFrontendToolRuntimeState(mockState);

    expect(() => getFrontendToolRuntimeState()).not.toThrow();
  });

  it("returns the stored state after set", async () => {
    const { setFrontendToolRuntimeState, getFrontendToolRuntimeState } =
      await import("../frontendToolRuntimeState");

    const mockState = makeFrontendToolState();
    setFrontendToolRuntimeState(mockState);

    expect(getFrontendToolRuntimeState()).toBe(mockState);
  });

  it("replaces the previous state when set again", async () => {
    const { setFrontendToolRuntimeState, getFrontendToolRuntimeState } =
      await import("../frontendToolRuntimeState");

    const firstState = makeFrontendToolState();
    const secondState = makeFrontendToolState();
    secondState.currentWorkflowId = "workflow-123";

    setFrontendToolRuntimeState(firstState);
    setFrontendToolRuntimeState(secondState);

    expect(getFrontendToolRuntimeState()).toBe(secondState);
    expect(getFrontendToolRuntimeState()).not.toBe(firstState);
  });
});
