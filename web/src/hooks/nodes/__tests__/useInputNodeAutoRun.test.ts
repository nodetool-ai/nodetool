import { renderHook, act } from "@testing-library/react";
import {
  useInputNodeAutoRun,
  isAutoRunInputNode
} from "../useInputNodeAutoRun";

// Mock the dependencies
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../core/graph", () => ({
  subgraph: jest.fn()
}));

import { useNodes } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { subgraph } from "../../../core/graph";

const mockUseNodes = useNodes as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockSubgraph = subgraph as jest.Mock;

describe("isAutoRunInputNode", () => {
  it("returns true for input node types", () => {
    expect(isAutoRunInputNode("nodetool.input.StringInput")).toBe(true);
    expect(isAutoRunInputNode("nodetool.input.IntegerInput")).toBe(true);
    expect(isAutoRunInputNode("nodetool.input.FloatInput")).toBe(true);
    expect(isAutoRunInputNode("nodetool.input.BooleanInput")).toBe(true);
    expect(isAutoRunInputNode("nodetool.input.ImageInput")).toBe(true);
  });

  it("returns false for non-input node types", () => {
    expect(isAutoRunInputNode("nodetool.constant.String")).toBe(false);
    expect(isAutoRunInputNode("nodetool.output.ImageOutput")).toBe(false);
    expect(isAutoRunInputNode("comfy.image.LoadImage")).toBe(false);
    expect(isAutoRunInputNode("")).toBe(false);
  });
});

describe("useInputNodeAutoRun", () => {
  const mockRun = jest.fn();
  const mockFindNode = jest.fn();
  const mockGetResult = jest.fn();

  const defaultMockNodes = [
    {
      id: "input-1",
      type: "nodetool.input.StringInput",
      data: { properties: { name: "test", value: "hello" } }
    },
    {
      id: "downstream-1",
      type: "nodetool.llm.Chat",
      data: { properties: {} }
    }
  ];

  const defaultMockEdges = [
    { source: "input-1", target: "downstream-1" }
  ];

  const defaultMockWorkflow = { id: "workflow-1", name: "Test Workflow" };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockUseNodes.mockReturnValue({
      nodes: defaultMockNodes,
      edges: defaultMockEdges,
      workflow: defaultMockWorkflow,
      findNode: mockFindNode
    });

    mockUseWebsocketRunner.mockImplementation((selector) => {
      const state = { run: mockRun, state: "idle" };
      return selector(state);
    });

    mockUseResultsStore.mockReturnValue(mockGetResult);

    mockFindNode.mockImplementation((id: string) =>
      defaultMockNodes.find((n) => n.id === id)
    );

    mockSubgraph.mockReturnValue({
      nodes: [defaultMockNodes[0], defaultMockNodes[1]],
      edges: defaultMockEdges
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not trigger auto-run for non-input nodes", () => {
    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "some-node",
        nodeType: "nodetool.constant.String",
        propertyName: "value"
      })
    );

    act(() => {
      result.current.onPropertyChange();
    });

    // Fast-forward timers
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("debounces onPropertyChange calls for input nodes", () => {
    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "input-1",
        nodeType: "nodetool.input.StringInput",
        propertyName: "value"
      })
    );

    // Call multiple times rapidly
    act(() => {
      result.current.onPropertyChange();
      result.current.onPropertyChange();
      result.current.onPropertyChange();
    });

    // Should not have called run yet
    expect(mockRun).not.toHaveBeenCalled();

    // Fast-forward past debounce time
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Should have called run once
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("onPropertyChangeComplete triggers immediately without debounce", () => {
    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "input-1",
        nodeType: "nodetool.input.StringInput",
        propertyName: "value"
      })
    );

    act(() => {
      result.current.onPropertyChangeComplete();
    });

    // Should have called run immediately
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("onPropertyChangeComplete cancels pending debounced call", () => {
    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "input-1",
        nodeType: "nodetool.input.StringInput",
        propertyName: "value"
      })
    );

    // Start a debounced call
    act(() => {
      result.current.onPropertyChange();
    });

    // Then complete immediately
    act(() => {
      result.current.onPropertyChangeComplete();
    });

    // Should have called run once (from onPropertyChangeComplete)
    expect(mockRun).toHaveBeenCalledTimes(1);

    // Fast-forward - debounced call should have been cancelled
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Still only one call
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when workflow is already running", () => {
    mockUseWebsocketRunner.mockImplementation((selector) => {
      const state = { run: mockRun, state: "running" };
      return selector(state);
    });

    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "input-1",
        nodeType: "nodetool.input.StringInput",
        propertyName: "value"
      })
    );

    act(() => {
      result.current.onPropertyChangeComplete();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("calls subgraph to get downstream nodes", () => {
    const { result } = renderHook(() =>
      useInputNodeAutoRun({
        nodeId: "input-1",
        nodeType: "nodetool.input.StringInput",
        propertyName: "value"
      })
    );

    act(() => {
      result.current.onPropertyChangeComplete();
    });

    expect(mockSubgraph).toHaveBeenCalledWith(
      defaultMockEdges,
      defaultMockNodes,
      defaultMockNodes[0]
    );
  });
});
