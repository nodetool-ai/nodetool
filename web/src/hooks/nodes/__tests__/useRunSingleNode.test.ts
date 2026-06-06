import { renderHook, act } from "@testing-library/react";
import { useRunSingleNode } from "../useRunSingleNode";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));

jest.mock("../../../utils/edgeValue", () => ({
  resolveExternalEdgeValue: jest.fn()
}));

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { resolveExternalEdgeValue } from "../../../utils/edgeValue";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockUseResultsStore = useResultsStore as unknown as jest.Mock;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockResolveExternalEdgeValue = resolveExternalEdgeValue as jest.Mock;

describe("useRunSingleNode", () => {
  const mockRun = jest.fn();
  const mockFindNode = jest.fn();
  const mockGetResult = jest.fn();
  const mockAddNotification = jest.fn();

  const nodeId = "node-1";
  const workflowId = "workflow-1";

  const defaultNode = {
    id: nodeId,
    type: "nodetool.image.Crop",
    data: {
      properties: { left: 0 },
      dynamic_properties: { image: "const-image" }
    }
  };

  const defaultWorkflow = { id: workflowId, name: "Test Workflow" };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        edges: [],
        workflow: defaultWorkflow,
        findNode: mockFindNode
      })
    });

    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { run: mockRun, state: "idle" };
        return selector(state);
      }
    );

    mockUseResultsStore.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { getResult: mockGetResult };
        return selector(state);
      }
    );

    mockUseNotificationStore.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { addNotification: mockAddNotification };
        return selector(state);
      }
    );

    mockFindNode.mockImplementation((id: string) =>
      id === nodeId ? defaultNode : undefined
    );

    mockResolveExternalEdgeValue.mockReturnValue({
      value: undefined,
      hasValue: false,
      isFallback: false
    });
  });

  it("returns early when workflow is already running", () => {
    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const state = { run: mockRun, state: "running" };
        return selector(state);
      }
    );

    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns early when node is not found", () => {
    mockFindNode.mockReturnValue(undefined);

    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("applies edge overrides to dynamic_properties when key exists there", () => {
    const edge = {
      id: "e1",
      source: "upstream",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "image"
    };

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        edges: [edge],
        workflow: defaultWorkflow,
        findNode: mockFindNode
      })
    });

    mockResolveExternalEdgeValue.mockReturnValue({
      value: "upstream-image",
      hasValue: true,
      isFallback: false
    });

    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const passedNode = nodesPassedToRun.find(
      (n: { id: string }) => n.id === nodeId
    );
    expect(passedNode.data.dynamic_properties.image).toBe("upstream-image");
  });

  it("applies edge overrides to properties when key does not exist in dynamic_properties", () => {
    const edge = {
      id: "e1",
      source: "upstream",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "left"
    };

    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        edges: [edge],
        workflow: defaultWorkflow,
        findNode: mockFindNode
      })
    });

    mockResolveExternalEdgeValue.mockReturnValue({
      value: 42,
      hasValue: true,
      isFallback: false
    });

    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const nodesPassedToRun = mockRun.mock.calls[0][2];
    const passedNode = nodesPassedToRun.find(
      (n: { id: string }) => n.id === nodeId
    );
    expect(passedNode.data.properties.left).toBe(42);
  });

  it("passes subgraphNodeIds as a Set containing only the target node id", () => {
    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const subgraphNodeIds = mockRun.mock.calls[0][5];
    expect(subgraphNodeIds).toBeInstanceOf(Set);
    expect(subgraphNodeIds.has(nodeId)).toBe(true);
    expect(subgraphNodeIds.size).toBe(1);
  });

  it("shows notification after triggering run", () => {
    const { result } = renderHook(() => useRunSingleNode(nodeId));

    act(() => {
      result.current.runSingleNode();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        alert: false
      })
    );
  });
});
