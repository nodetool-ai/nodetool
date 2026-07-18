import { renderHook, act } from "@testing-library/react";
import { useWorkflowDirty } from "../useWorkflowDirty";

type Listener = (state: any, prev: any) => void;

const makeStore = (initialDirty: boolean) => {
  let currentState = { workflowIsDirty: initialDirty };
  const listeners = new Set<Listener>();
  return {
    getState: () => currentState,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    _setDirty: (dirty: boolean) => {
      const prev = currentState;
      currentState = { workflowIsDirty: dirty };
      listeners.forEach((fn) => fn(currentState, prev));
    }
  };
};

let mockNodeStores: Record<string, ReturnType<typeof makeStore>> = {};

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn((selector: (state: any) => any) => {
    const state = { nodeStores: mockNodeStores };
    return selector(state);
  })
}));

describe("useWorkflowDirty", () => {
  beforeEach(() => {
    mockNodeStores = {};
  });

  it("returns false when workflowId is undefined", () => {
    const { result } = renderHook(() => useWorkflowDirty(undefined));
    expect(result.current).toBe(false);
  });

  it("returns false when the workflow has no store", () => {
    const { result } = renderHook(() => useWorkflowDirty("nonexistent-id"));
    expect(result.current).toBe(false);
  });

  it("reflects the initial dirty state from the store", () => {
    const store = makeStore(true);
    mockNodeStores["wf-1"] = store;

    const { result } = renderHook(() => useWorkflowDirty("wf-1"));
    expect(result.current).toBe(true);
  });

  it("updates when the store dirty state changes", () => {
    const store = makeStore(false);
    mockNodeStores["wf-2"] = store;

    const { result } = renderHook(() => useWorkflowDirty("wf-2"));
    expect(result.current).toBe(false);

    act(() => {
      store._setDirty(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      store._setDirty(false);
    });
    expect(result.current).toBe(false);
  });
});
