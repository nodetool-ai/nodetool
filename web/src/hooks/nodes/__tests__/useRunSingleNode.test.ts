import { renderHook, act } from "@testing-library/react";
import { useRunSingleNode } from "../useRunSingleNode";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWebsocketRunner: jest.fn()
}));

// buildRunSubgraph reads each upstream's merged generation history from
// ResultsStore (live buffer) + WorkflowAssetStore (persisted assets).
jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: { getState: jest.fn() }
}));
jest.mock("../../../stores/WorkflowAssetStore", () => ({
  useWorkflowAssetStore: { getState: jest.fn() }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));

const mockGetMetadata = jest.fn();
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: { getState: () => ({ getMetadata: mockGetMetadata }) }
}));

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import type { Generation } from "../../../utils/nodeGenerations";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
const mockUseWebsocketRunner = useWebsocketRunner as jest.Mock;
const mockResultsGetState = (
  useResultsStore as unknown as { getState: jest.Mock }
).getState;
const mockAssetsGetState = (
  useWorkflowAssetStore as unknown as { getState: jest.Mock }
).getState;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;

describe("useRunSingleNode", () => {
  const mockRun = jest.fn();
  const mockFindNode = jest.fn();
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

  // Live generations keyed `${workflowId}:${nodeId}` (the key getNodeGenerations
  // reads from ResultsStore); no persisted assets in these tests.
  const liveGenerations: Record<string, Generation[]> = {};
  const mockGetLiveGenerations = jest.fn(
    (wf: string, id: string): Generation[] =>
      liveGenerations[`${wf}:${id}`] ?? []
  );

  const useGraph = (nodes: unknown[], edges: unknown[]) => {
    mockUseNodeStoreRef.mockReturnValue({
      getState: () => ({
        edges,
        nodes,
        workflow: defaultWorkflow,
        findNode: mockFindNode
      })
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(liveGenerations)) delete liveGenerations[key];

    useGraph([defaultNode], []);

    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ run: mockRun, state: "idle" })
    );

    mockResultsGetState.mockReturnValue({
      getLiveGenerations: mockGetLiveGenerations
    });
    mockAssetsGetState.mockReturnValue({ getWorkflowAssets: () => [] });

    mockUseNotificationStore.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ addNotification: mockAddNotification })
    );

    mockFindNode.mockImplementation((id: string) =>
      id === nodeId ? defaultNode : undefined
    );

    // Non-generative by default; individual tests opt into auto_save_asset.
    mockGetMetadata.mockReturnValue(undefined);
  });

  it("returns early when workflow is already running", () => {
    mockUseWebsocketRunner.mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ run: mockRun, state: "running" })
    );

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns early when node is not found", () => {
    mockFindNode.mockReturnValue(undefined);

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).not.toHaveBeenCalled();
  });

  it("inlines a constant upstream into dynamic_properties when the key exists there", () => {
    const upstream = {
      id: "upstream",
      type: "nodetool.constant.String",
      data: { properties: { value: "upstream-image" }, dynamic_properties: {} }
    };
    const edge = {
      id: "e1",
      source: "upstream",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "image"
    };
    useGraph([defaultNode, upstream], [edge]);

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).toHaveBeenCalledTimes(1);
    const passedNode = mockRun.mock.calls[0][2].find(
      (n: { id: string }) => n.id === nodeId
    );
    expect(passedNode.data.dynamic_properties.image).toBe("upstream-image");
  });

  it("inlines a constant upstream into properties when the key is not in dynamic_properties", () => {
    const upstream = {
      id: "upstream",
      type: "nodetool.constant.Integer",
      data: { properties: { value: 42 }, dynamic_properties: {} }
    };
    const edge = {
      id: "e1",
      source: "upstream",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "left"
    };
    useGraph([defaultNode, upstream], [edge]);

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).toHaveBeenCalledTimes(1);
    const passedNode = mockRun.mock.calls[0][2].find(
      (n: { id: string }) => n.id === nodeId
    );
    expect(passedNode.data.properties.left).toBe(42);
  });

  it("passes subgraphNodeIds as a Set containing only the target node id", () => {
    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).toHaveBeenCalledTimes(1);
    const subgraphNodeIds = mockRun.mock.calls[0][5];
    expect(subgraphNodeIds).toBeInstanceOf(Set);
    expect(subgraphNodeIds.has(nodeId)).toBe(true);
    expect(subgraphNodeIds.size).toBe(1);
  });

  it("blocks the run and warns when an upstream generative node is uncached", () => {
    const generator = {
      id: "gen-1",
      type: "nodetool.fal.FluxImage",
      data: { properties: {}, dynamic_properties: {} }
    };
    const edge = {
      id: "e1",
      source: "gen-1",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "image"
    };
    useGraph([defaultNode, generator], [edge]);
    mockFindNode.mockImplementation((id: string) =>
      id === nodeId ? defaultNode : id === "gen-1" ? generator : undefined
    );
    // The generative upstream has no generation in either store.
    mockGetMetadata.mockImplementation((type: string) =>
      type === "nodetool.fal.FluxImage"
        ? { auto_save_asset: true, title: "Flux Image" }
        : undefined
    );

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).not.toHaveBeenCalled();
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        alert: true,
        content: expect.stringContaining("Flux Image")
      })
    );
  });

  it("reuses a cached generative upstream instead of blocking", () => {
    const generator = {
      id: "gen-1",
      type: "nodetool.fal.FluxImage",
      data: { properties: {}, dynamic_properties: {} }
    };
    const edge = {
      id: "e1",
      source: "gen-1",
      target: nodeId,
      sourceHandle: "output",
      targetHandle: "image"
    };
    useGraph([defaultNode, generator], [edge]);
    mockFindNode.mockImplementation((id: string) =>
      id === nodeId ? defaultNode : id === "gen-1" ? generator : undefined
    );
    mockGetMetadata.mockImplementation((type: string) =>
      type === "nodetool.fal.FluxImage"
        ? { auto_save_asset: true, title: "Flux Image" }
        : undefined
    );
    liveGenerations[`${workflowId}:gen-1`] = [
      {
        id: "gen-1",
        jobId: "job-1",
        createdAt: 1,
        outputs: { output: "cached.png" },
        status: "completed"
      }
    ];

    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).toHaveBeenCalledTimes(1);
    const passedNode = mockRun.mock.calls[0][2].find(
      (n: { id: string }) => n.id === nodeId
    );
    expect(passedNode.data.dynamic_properties.image).toBe("cached.png");
  });

  it("shows notification after triggering run", () => {
    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", alert: false })
    );
  });

  it("passes full-graph input signatures as the 8th run() argument", () => {
    const { result } = renderHook(() => useRunSingleNode(nodeId));
    act(() => result.current.runSingleNode());

    expect(mockRun).toHaveBeenCalledTimes(1);
    const inputSignatures = mockRun.mock.calls[0][7];
    // One entry per submitted node, keyed by node id.
    expect(Object.keys(inputSignatures)).toEqual([nodeId]);
    expect(typeof inputSignatures[nodeId]).toBe("string");
    expect(inputSignatures[nodeId].length).toBeGreaterThan(0);
  });
});
