import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useWorkflowExecutionProgress,
  formatElapsedTime
} from "../useWorkflowExecutionProgress";
import useStatusStore from "../../stores/StatusStore";
import { useNodes } from "../../contexts/NodeContext";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockUseNodes = useNodes as jest.Mock;

describe("useWorkflowExecutionProgress", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStatusStore.setState({ statuses: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns initial state with zero counts when no nodes", () => {
    mockUseNodes.mockImplementation((selector) =>
      selector({ nodes: [] })
    );

    const { result } = renderHook(() =>
      useWorkflowExecutionProgress("workflow-1", false)
    );

    expect(result.current).toEqual({
      total: 0,
      completed: 0,
      running: 0,
      pending: 0,
      error: 0,
      progressPercent: 0,
      elapsedMs: 0
    });
  });

  it("calculates progress from node statuses", () => {
    const mockNodes = [
      { id: "node-1", type: "some.type" },
      { id: "node-2", type: "some.type" },
      { id: "node-3", type: "some.type" },
      { id: "node-4", type: "some.type" }
    ];

    mockUseNodes.mockImplementation((selector) =>
      selector({ nodes: mockNodes })
    );

    useStatusStore.setState({
      statuses: {
        "workflow-1:node-1": "completed",
        "workflow-1:node-2": "running",
        "workflow-1:node-3": "error"
      }
    });

    const { result } = renderHook(() =>
      useWorkflowExecutionProgress("workflow-1", false)
    );

    expect(result.current.total).toBe(4);
    expect(result.current.completed).toBe(1);
    expect(result.current.running).toBe(1);
    expect(result.current.error).toBe(1);
    expect(result.current.pending).toBe(1);
    expect(result.current.progressPercent).toBe(50);
  });

  it("excludes Comment and Preview nodes from count", () => {
    const mockNodes = [
      { id: "node-1", type: "some.type" },
      { id: "node-2", type: "nodetool.workflows.base_node.Comment" },
      { id: "node-3", type: "nodetool.workflows.base_node.Preview" }
    ];

    mockUseNodes.mockImplementation((selector) =>
      selector({ nodes: mockNodes })
    );

    const { result } = renderHook(() =>
      useWorkflowExecutionProgress("workflow-1", false)
    );

    expect(result.current.total).toBe(1);
  });

  it("tracks elapsed time when executing", async () => {
    jest.useFakeTimers();

    const mockNodes = [{ id: "node-1", type: "some.type" }];
    mockUseNodes.mockImplementation((selector) =>
      selector({ nodes: mockNodes })
    );

    const { result, rerender } = renderHook(
      ({ isExecuting }) =>
        useWorkflowExecutionProgress("workflow-1", isExecuting),
      { initialProps: { isExecuting: true } }
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(result.current.elapsedMs).toBeGreaterThan(0);
    });

    rerender({ isExecuting: false });

    expect(result.current.elapsedMs).toBe(0);
  });
});

describe("formatElapsedTime", () => {
  it("formats milliseconds", () => {
    expect(formatElapsedTime(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatElapsedTime(5000)).toBe("5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedTime(125000)).toBe("2m 5s");
  });
});
