import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useWorkflowRunnerState,
  useIsWorkflowRunning
} from "../useWorkflowRunnerState";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

// Mock the WorkflowRunner module
jest.mock("../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn()
}));

const mockGetWorkflowRunnerStore = getWorkflowRunnerStore as jest.Mock;

describe("useWorkflowRunnerState", () => {
  let mockSubscribe: jest.Mock;
  let mockGetState: jest.Mock;
  let unsubscribeFn: jest.Mock;

  beforeEach(() => {
    unsubscribeFn = jest.fn();
    mockSubscribe = jest.fn().mockReturnValue(unsubscribeFn);
    mockGetState = jest.fn().mockReturnValue({ state: "idle" });

    mockGetWorkflowRunnerStore.mockReturnValue({
      getState: mockGetState,
      subscribe: mockSubscribe
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when workflowId is undefined", () => {
    const { result } = renderHook(() => useWorkflowRunnerState(undefined));
    expect(result.current).toBeNull();
    expect(mockGetWorkflowRunnerStore).not.toHaveBeenCalled();
  });

  it("returns current state when workflowId is provided", () => {
    mockGetState.mockReturnValue({ state: "running" });

    const { result } = renderHook(() =>
      useWorkflowRunnerState("workflow-123")
    );

    expect(result.current).toBe("running");
    expect(mockGetWorkflowRunnerStore).toHaveBeenCalledWith("workflow-123");
  });

  it("subscribes to store changes", () => {
    renderHook(() => useWorkflowRunnerState("workflow-123"));

    expect(mockSubscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it("updates state when store state changes", async () => {
    mockGetState.mockReturnValue({ state: "idle" });

    const { result } = renderHook(() =>
      useWorkflowRunnerState("workflow-123")
    );

    expect(result.current).toBe("idle");

    // Simulate a store state change by calling the subscriber callback
    const subscriberCallback = mockSubscribe.mock.calls[0][0];

    act(() => {
      subscriberCallback({ state: "running" }, { state: "idle" });
    });

    await waitFor(() => {
      expect(result.current).toBe("running");
    });
  });

  it("does not update state when state has not changed", async () => {
    mockGetState.mockReturnValue({ state: "idle" });

    const { result } = renderHook(() =>
      useWorkflowRunnerState("workflow-123")
    );

    expect(result.current).toBe("idle");

    // Simulate store notification without state change
    const subscriberCallback = mockSubscribe.mock.calls[0][0];

    act(() => {
      subscriberCallback({ state: "idle" }, { state: "idle" });
    });

    // State should remain the same
    expect(result.current).toBe("idle");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() =>
      useWorkflowRunnerState("workflow-123")
    );

    unmount();

    expect(unsubscribeFn).toHaveBeenCalled();
  });

  it("resubscribes when workflowId changes", () => {
    const { rerender } = renderHook(
      ({ workflowId }) => useWorkflowRunnerState(workflowId),
      { initialProps: { workflowId: "workflow-123" } }
    );

    expect(mockGetWorkflowRunnerStore).toHaveBeenCalledWith("workflow-123");
    expect(mockSubscribe).toHaveBeenCalledTimes(1);

    // Change workflow ID
    rerender({ workflowId: "workflow-456" });

    // Should unsubscribe from old and subscribe to new
    expect(unsubscribeFn).toHaveBeenCalled();
    expect(mockGetWorkflowRunnerStore).toHaveBeenCalledWith("workflow-456");
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });
});

describe("useIsWorkflowRunning", () => {
  let mockSubscribe: jest.Mock;
  let mockGetState: jest.Mock;

  beforeEach(() => {
    mockSubscribe = jest.fn().mockReturnValue(jest.fn());
    mockGetState = jest.fn().mockReturnValue({ state: "idle" });

    mockGetWorkflowRunnerStore.mockReturnValue({
      getState: mockGetState,
      subscribe: mockSubscribe
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when workflow is running", () => {
    mockGetState.mockReturnValue({ state: "running" });

    const { result } = renderHook(() => useIsWorkflowRunning("workflow-123"));

    expect(result.current).toBe(true);
  });

  it("returns false when workflow is idle", () => {
    mockGetState.mockReturnValue({ state: "idle" });

    const { result } = renderHook(() => useIsWorkflowRunning("workflow-123"));

    expect(result.current).toBe(false);
  });

  it("returns false when workflow is in error state", () => {
    mockGetState.mockReturnValue({ state: "error" });

    const { result } = renderHook(() => useIsWorkflowRunning("workflow-123"));

    expect(result.current).toBe(false);
  });

  it("returns false when workflowId is undefined", () => {
    const { result } = renderHook(() => useIsWorkflowRunning(undefined));

    expect(result.current).toBe(false);
  });

  it("updates when state transitions from idle to running", async () => {
    mockGetState.mockReturnValue({ state: "idle" });

    const { result } = renderHook(() => useIsWorkflowRunning("workflow-123"));

    expect(result.current).toBe(false);

    // Simulate state change to running
    const subscriberCallback = mockSubscribe.mock.calls[0][0];

    act(() => {
      subscriberCallback({ state: "running" }, { state: "idle" });
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });
});
