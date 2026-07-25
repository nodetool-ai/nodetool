import {
  createAppRuntimeStore,
  getAppRuntimeStore,
  disposeAppRuntimeStore,
  workflowInstanceId
} from "../runtime/appRuntimeStore";

describe("appRuntimeStore", () => {
  it("starts with four empty namespaces", () => {
    const store = createAppRuntimeStore();
    const state = store.getState();
    expect(state.inputs).toEqual({});
    expect(state.outputs).toEqual({});
    expect(state.variables).toEqual({});
    expect(state.view).toEqual({});
    expect(state.invocations).toEqual({});
  });

  it("applies events through the shared reducer", () => {
    const store = createAppRuntimeStore();
    store.getState().dispatchEvent({
      type: "setInput",
      key: "main:in1",
      value: "hello"
    });
    store.getState().dispatchEvent({ type: "toggleVariable", variableId: "dark" });
    expect(store.getState().inputs["main:in1"].value).toBe("hello");
    expect(store.getState().variables.dark).toBe(true);
  });

  it("keeps widget-local view state out of the workflow's inputs", () => {
    const store = createAppRuntimeStore();
    store
      .getState()
      .dispatchEvent({ type: "setView", key: "Slider-1:value", value: 7 });
    expect(store.getState().view["Slider-1:value"]).toBe(7);
    expect(store.getState().inputs["Slider-1:value"]).toBeUndefined();
  });

  it("accepts seeded state (used by the marketing preview)", () => {
    const store = createAppRuntimeStore({ variables: { result: "demo" } });
    expect(store.getState().variables.result).toBe("demo");
  });
});

describe("appRuntimeStore registry", () => {
  const instance = workflowInstanceId("wf-1");

  afterEach(() => {
    disposeAppRuntimeStore(instance);
  });

  it("returns the same store per instance id, so values survive remounts", () => {
    const first = getAppRuntimeStore(instance);
    first
      .getState()
      .dispatchEvent({ type: "setVariable", variableId: "result", value: "streamed" });
    expect(getAppRuntimeStore(instance)).toBe(first);
    expect(getAppRuntimeStore(instance).getState().variables.result).toBe(
      "streamed"
    );
    expect(getAppRuntimeStore(workflowInstanceId("wf-2"))).not.toBe(first);
    disposeAppRuntimeStore(workflowInstanceId("wf-2"));
  });

  it("dispose drops the stored state", () => {
    getAppRuntimeStore(instance)
      .getState()
      .dispatchEvent({ type: "setVariable", variableId: "result", value: "old" });
    disposeAppRuntimeStore(instance);
    expect(
      getAppRuntimeStore(instance).getState().variables.result
    ).toBeUndefined();
  });
});
