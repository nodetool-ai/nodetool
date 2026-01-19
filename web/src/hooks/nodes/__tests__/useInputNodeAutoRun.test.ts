import { renderHook, act } from "@testing-library/react";
import {
  useInputNodeAutoRun,
  isAutoRunInputNode
} from "../useInputNodeAutoRun";

// Mock the dependencies
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useNodeStoreRef: jest.fn()
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

jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: jest.fn()
}));

import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { subgraph } from "../../../core/graph";
import { useSettingsStore } from "../../../stores/SettingsStore";

const mockUseNodes = useNodes as jest.Mock;
const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;

const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockSubgraph = subgraph as jest.Mock;
const mockUseSettingsStore = useSettingsStore as unknown as jest.Mock;

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

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        nodes: defaultMockNodes,
        edges: defaultMockEdges,
        workflow: defaultMockWorkflow,
        findNode: mockFindNode
      })
    });

    mockUseWebsocketRunner.mockImplementation((selector) => {
      const state = { run: mockRun, state: "idle" };
      return selector(state);
    });

    mockUseResultsStore.mockReturnValue(mockGetResult);

    // Default: instantUpdate is disabled
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: false } };
      return selector(state);
    });

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

  it("debounces onPropertyChange calls for input nodes when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
      return selector(state);
    });

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

  it("onPropertyChangeComplete triggers immediately without debounce when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

    // Should have called run immediately
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("onPropertyChangeComplete cancels pending debounced call when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
      return selector(state);
    });

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

    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

  it("calls subgraph to get downstream nodes when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

    expect(mockSubgraph).toHaveBeenCalledWith(
      defaultMockEdges,
      defaultMockNodes,
      defaultMockNodes[0]
    );
  });

  it("injects cached values for all external dependencies in subgraph when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
      return selector(state);
    });

    // Setup a more complex graph:
    // external-1 -> downstream-1 (not in subgraph but connected to downstream)
    // input-1 -> downstream-1
    // downstream-1 -> downstream-2
    const complexNodes = [
      {
        id: "external-1",
        type: "nodetool.constant.String",
        data: { properties: { value: "external" } }
      },
      {
        id: "input-1",
        type: "nodetool.input.StringInput",
        data: { properties: { name: "test", value: "hello" } }
      },
      {
        id: "downstream-1",
        type: "nodetool.llm.Chat",
        data: { properties: {} }
      },
      {
        id: "downstream-2",
        type: "nodetool.output.TextOutput",
        data: { properties: {} }
      }
    ];

    const complexEdges = [
      { source: "external-1", target: "downstream-1", sourceHandle: "output", targetHandle: "context" },
      { source: "input-1", target: "downstream-1", sourceHandle: "output", targetHandle: "prompt" },
      { source: "downstream-1", target: "downstream-2", sourceHandle: "output", targetHandle: "value" }
    ];

    mockUseNodes.mockReturnValue({
      nodes: complexNodes,
      edges: complexEdges,
      workflow: defaultMockWorkflow,
      findNode: (id: string) => complexNodes.find((n) => n.id === id)
    });

    mockFindNode.mockImplementation((id: string) =>
      complexNodes.find((n) => n.id === id)
    );

    // Subgraph from input-1 includes: input-1, downstream-1, downstream-2
    // But NOT external-1
    mockSubgraph.mockReturnValue({
      nodes: [complexNodes[1], complexNodes[2], complexNodes[3]],
      edges: [complexEdges[1], complexEdges[2]]
    });

    // external-1 has a cached result
    mockGetResult.mockImplementation((workflowId: string, nodeId: string) => {
      if (nodeId === "external-1") {
        return { output: "cached external value" };
      }
      return undefined;
    });

    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

    // Verify run was called
    expect(mockRun).toHaveBeenCalledTimes(1);

    // Check that the nodes passed to run have the cached value injected
    const runCallArgs = mockRun.mock.calls[0];
    const nodesPassedToRun = runCallArgs[2]; // Third argument is nodes

    // Find downstream-1 in the passed nodes
    const downstream1 = nodesPassedToRun.find(
      (n: { id: string }) => n.id === "downstream-1"
    );

    // It should have the cached value from external-1 injected into its "context" property
    expect(downstream1.data.properties.context).toBe("cached external value");
  });

  it("handles multiple external dependencies to different nodes in subgraph when instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
      return selector(state);
    });

    // Setup:
    // external-1 -> downstream-1 (context)
    // external-2 -> downstream-2 (input)
    // input-1 -> downstream-1 -> downstream-2
    const multiExternalNodes = [
      {
        id: "external-1",
        type: "nodetool.constant.String",
        data: { properties: { value: "ext1" } }
      },
      {
        id: "external-2",
        type: "nodetool.constant.Integer",
        data: { properties: { value: 42 } }
      },
      {
        id: "input-1",
        type: "nodetool.input.StringInput",
        data: { properties: { name: "test", value: "hello" } }
      },
      {
        id: "downstream-1",
        type: "nodetool.llm.Chat",
        data: { properties: {} }
      },
      {
        id: "downstream-2",
        type: "nodetool.output.TextOutput",
        data: { properties: {} }
      }
    ];

    const multiExternalEdges = [
      { source: "external-1", target: "downstream-1", sourceHandle: "output", targetHandle: "context" },
      { source: "external-2", target: "downstream-2", sourceHandle: "output", targetHandle: "count" },
      { source: "input-1", target: "downstream-1", sourceHandle: "output", targetHandle: "prompt" },
      { source: "downstream-1", target: "downstream-2", sourceHandle: "output", targetHandle: "value" }
    ];

    mockUseNodes.mockReturnValue({
      nodes: multiExternalNodes,
      edges: multiExternalEdges,
      workflow: defaultMockWorkflow,
      findNode: (id: string) => multiExternalNodes.find((n) => n.id === id)
    });

    mockFindNode.mockImplementation((id: string) =>
      multiExternalNodes.find((n) => n.id === id)
    );

    // Subgraph from input-1: input-1, downstream-1, downstream-2
    mockSubgraph.mockReturnValue({
      nodes: [multiExternalNodes[2], multiExternalNodes[3], multiExternalNodes[4]],
      edges: [multiExternalEdges[2], multiExternalEdges[3]]
    });

    // Both external nodes have cached results
    mockGetResult.mockImplementation((workflowId: string, nodeId: string) => {
      if (nodeId === "external-1") {
        return { output: "cached from ext1" };
      }
      if (nodeId === "external-2") {
        return { output: 100 };
      }
      return undefined;
    });

    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

    expect(mockRun).toHaveBeenCalledTimes(1);

    const runCallArgs = mockRun.mock.calls[0];
    const nodesPassedToRun = runCallArgs[2];

    // downstream-1 should have context from external-1
    const downstream1 = nodesPassedToRun.find(
      (n: { id: string }) => n.id === "downstream-1"
    );
    expect(downstream1.data.properties.context).toBe("cached from ext1");

    // downstream-2 should have count from external-2
    const downstream2 = nodesPassedToRun.find(
      (n: { id: string }) => n.id === "downstream-2"
    );
    expect(downstream2.data.properties.count).toBe(100);
  });

  it("falls back to input/constant node values when cached results are missing and instantUpdate is enabled", () => {
    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
      return selector(state);
    });

    const nodesWithLiterals = [
      {
        id: "input-1",
        type: "nodetool.input.StringInput",
        data: { properties: { name: "Genre", value: "horror" } }
      },
      {
        id: "input-2",
        type: "nodetool.input.StringInput",
        data: { properties: { name: "Character", value: "Reluctant Hero" } }
      },
      {
        id: "template-1",
        type: "nodetool.constant.String",
        data: { properties: { value: "template text" } }
      },
      {
        id: "format-1",
        type: "nodetool.text.FormatText",
        data: { properties: {} }
      }
    ];

    const literalEdges = [
      { source: "input-1", target: "format-1", sourceHandle: "output", targetHandle: "GENRE" },
      { source: "input-2", target: "format-1", sourceHandle: "output", targetHandle: "CHARACTER" },
      { source: "template-1", target: "format-1", sourceHandle: "output", targetHandle: "template" }
    ];

    mockUseNodes.mockReturnValue({
      nodes: nodesWithLiterals,
      edges: literalEdges,
      workflow: defaultMockWorkflow,
      findNode: (id: string) => nodesWithLiterals.find((n) => n.id === id)
    });

    mockFindNode.mockImplementation((id: string) =>
      nodesWithLiterals.find((n) => n.id === id)
    );

    mockSubgraph.mockReturnValue({
      nodes: [nodesWithLiterals[0], nodesWithLiterals[3]],
      edges: [literalEdges[0]]
    });

    // Enable instantUpdate
    mockUseSettingsStore.mockImplementation((selector) => {
      const state = { settings: { instantUpdate: true } };
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

    const runCallArgs = mockRun.mock.calls[0];
    const nodesPassedToRun = runCallArgs[2];
    const formatNode = nodesPassedToRun.find(
      (n: { id: string }) => n.id === "format-1"
    );

    expect(formatNode.data.properties.CHARACTER).toBe("Reluctant Hero");
    expect(formatNode.data.properties.template).toBe("template text");
  });

  describe("instantUpdate setting", () => {
    it("triggers auto-run for non-input nodes when instantUpdate is enabled", () => {
      // Enable instantUpdate
      mockUseSettingsStore.mockImplementation((selector) => {
        const state = { settings: { instantUpdate: true } };
        return selector(state);
      });

      // Use a non-input node type
      const { result } = renderHook(() =>
        useInputNodeAutoRun({
          nodeId: "input-1",
          nodeType: "nodetool.llm.Chat", // Non-input node
          propertyName: "prompt"
        })
      );

      act(() => {
        result.current.onPropertyChangeComplete();
      });

      // Should trigger when instantUpdate is enabled
      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it("does not trigger for any nodes when instantUpdate is disabled", () => {
      // Disable instantUpdate (default)
      mockUseSettingsStore.mockImplementation((selector) => {
        const state = { settings: { instantUpdate: false } };
        return selector(state);
      });

      // Use a non-input node type
      const { result } = renderHook(() =>
        useInputNodeAutoRun({
          nodeId: "input-1",
          nodeType: "nodetool.llm.Chat", // Non-input node
          propertyName: "prompt"
        })
      );

      act(() => {
        result.current.onPropertyChangeComplete();
      });

      // Should NOT trigger when instantUpdate is disabled
      expect(mockRun).not.toHaveBeenCalled();
    });

    it("does not trigger for input nodes when instantUpdate is disabled", () => {
      // Disable instantUpdate
      mockUseSettingsStore.mockImplementation((selector) => {
        const state = { settings: { instantUpdate: false } };
        return selector(state);
      });

      // Use an input node type
      const { result } = renderHook(() =>
        useInputNodeAutoRun({
          nodeId: "input-1",
          nodeType: "nodetool.input.StringInput", // Input node
          propertyName: "value"
        })
      );

      act(() => {
        result.current.onPropertyChangeComplete();
      });

      // Input nodes should NOT trigger when instantUpdate is disabled
      expect(mockRun).not.toHaveBeenCalled();
    });

    it("triggers for input nodes when instantUpdate is enabled", () => {
      // Enable instantUpdate
      mockUseSettingsStore.mockImplementation((selector) => {
        const state = { settings: { instantUpdate: true } };
        return selector(state);
      });

      // Use an input node type
      const { result } = renderHook(() =>
        useInputNodeAutoRun({
          nodeId: "input-1",
          nodeType: "nodetool.input.StringInput", // Input node
          propertyName: "value"
        })
      );

      act(() => {
        result.current.onPropertyChangeComplete();
      });

      // Input nodes should trigger when instantUpdate is enabled
      expect(mockRun).toHaveBeenCalledTimes(1);
    });
  });
});
