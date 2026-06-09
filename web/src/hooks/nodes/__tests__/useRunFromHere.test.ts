import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({ useNodes: jest.fn() }));
// The run getter now resolves each upstream's selected generation from the
// live-generation buffer (ResultsStore) merged with persisted workflow assets
// (WorkflowAssetStore); seed those instead of a focused-job result getter.
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
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { getState: jest.fn() })
}));
jest.mock("../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn(() => Promise.resolve({ success: true, outputs: {} }))
}));

import { useNodes } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";
import type { Generation } from "../../../utils/nodeGenerations";

const mockUseNodes = useNodes as jest.Mock;
const mockResultsGetState = (useResultsStore as unknown as { getState: jest.Mock })
  .getState;
const mockAssetsGetState = (
  useWorkflowAssetStore as unknown as { getState: jest.Mock }
).getState;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockUseMetadataStore = useMetadataStore as unknown as jest.Mock;
const mockMetadataGetState = (
  useMetadataStore as unknown as { getState: jest.Mock }
).getState;
const mockRunInline = runInlineGraphJob as unknown as jest.Mock;

const graphArg = (call = 0) => mockRunInline.mock.calls[call][0].graph;

describe("useRunFromHere (Run Node)", () => {
  // Live generations keyed by `${workflowId}:${nodeId}`, the same key
  // getNodeGenerations reads from ResultsStore.
  const liveGenerations: Record<string, Generation[]> = {};
  const mockGetLiveGenerations = jest.fn(
    (workflowId: string, nodeId: string): Generation[] =>
      liveGenerations[`${workflowId}:${nodeId}`] ?? []
  );
  const seedGeneration = (
    nodeId: string,
    outputs: Record<string, unknown>
  ): void => {
    liveGenerations[`workflow-1:${nodeId}`] = [
      {
        id: nodeId,
        jobId: "job-1",
        createdAt: 1,
        outputs,
        status: "completed"
      }
    ];
  };
  const mockAddNotification = jest.fn();
  // Source-node classification; default non-generative.
  const mockGetMetadata = jest.fn(() => ({ title: "Chat" }) as unknown);

  const nodeA = {
    id: "node-a",
    type: "nodetool.llm.Chat",
    data: { properties: {} }
  };
  const nodeB = {
    id: "node-b",
    type: "nodetool.output.TextOutput",
    data: { properties: {} }
  };
  const edges = [
    {
      id: "e1",
      source: "node-a",
      target: "node-b",
      sourceHandle: "output",
      targetHandle: "value"
    }
  ];
  const workflow = { id: "workflow-1", name: "WF" };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(liveGenerations)) {
      delete liveGenerations[key];
    }
    mockGetMetadata.mockReturnValue({ title: "Chat" });

    mockRunInline.mockImplementation(() =>
      Promise.resolve({ success: true, outputs: {} })
    );
    mockUseNodes.mockImplementation((selector) =>
      selector({ edges, nodes: [nodeA, nodeB], workflow })
    );
    mockResultsGetState.mockReturnValue({
      getLiveGenerations: mockGetLiveGenerations
    });
    // No persisted workflow assets in these tests; the run getter merges this
    // empty list with the seeded live generations.
    mockAssetsGetState.mockReturnValue({
      getWorkflowAssets: () => []
    });
    mockUseNotificationStore.mockImplementation((selector) =>
      selector({ addNotification: mockAddNotification })
    );
    // Hook-selector form (used for the job title).
    mockUseMetadataStore.mockImplementation((selector) =>
      selector({ getMetadata: () => ({ title: "Chat" }) })
    );
    // getState form (used by buildRunSubgraph to classify upstream nodes).
    mockMetadataGetState.mockReturnValue({ getMetadata: mockGetMetadata });
  });

  it("dispatches just the clicked node as an inline job", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(mockRunInline.mock.calls[0][0].workflowId).toBe("workflow-1");
    // The job is titled with the node's metadata title (shown in the queue).
    expect(mockRunInline.mock.calls[0][0].jobName).toBe("Chat");
    expect(graphArg().nodes.map((n: { id: string }) => n.id)).toEqual([
      "node-a"
    ]);
    expect(graphArg().edges).toEqual([]);
  });

  it("does not run when node is null", () => {
    const { result } = renderHook(() => useRunFromHere(null));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).not.toHaveBeenCalled();
  });

  it("inlines the upstream's current generation output and sends only the clicked node", () => {
    seedGeneration("node-a", { output: "cached" });
    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(graphArg().nodes.map((n: { id: string }) => n.id)).toEqual([
      "node-b"
    ]);
    expect(graphArg().edges).toEqual([]);
    // The upstream's current generation output is injected into the node's
    // properties so it runs with realistic inputs: the run getter returns the
    // generation's outputs record and resolveExternalEdgeValue extracts the
    // "output" handle, writing it to the inbound edge's "value" target handle.
    expect(graphArg().nodes[0].data).toEqual({ value: "cached" });
  });

  it("blocks and warns when an uncached generative upstream feeds the node", () => {
    // node-a has no generation yet and is flagged as a generative node.
    mockGetMetadata.mockReturnValue({
      auto_save_asset: true,
      title: "Image Gen"
    });

    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).not.toHaveBeenCalled();
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        alert: true,
        content: expect.stringContaining("Image Gen")
      })
    );
  });

  it("shows a notification", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info", alert: false })
    );
  });

  it("reports isWorkflowRunning as false (independent jobs are never gated)", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));
    expect(result.current.isWorkflowRunning).toBe(false);
  });
});
