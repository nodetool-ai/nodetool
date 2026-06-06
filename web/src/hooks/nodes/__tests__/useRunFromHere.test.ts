import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({ useNodes: jest.fn() }));
jest.mock("../../../stores/ResultsStore", () => ({
  __esModule: true,
  default: { getState: jest.fn() }
}));
// The hook seeds inputs from the workflow's focused run; provide a stable one
// so the result getter is consulted (otherwise the read short-circuits).
jest.mock("../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({ getFocusedJob: () => "job-1", getRuns: () => [] })
  }
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
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";

const mockUseNodes = useNodes as jest.Mock;
const mockResultsGetState = (useResultsStore as unknown as { getState: jest.Mock })
  .getState;
const mockUseNotificationStore = useNotificationStore as unknown as jest.Mock;
const mockUseMetadataStore = useMetadataStore as unknown as jest.Mock;
const mockMetadataGetState = (
  useMetadataStore as unknown as { getState: jest.Mock }
).getState;
const mockRunInline = runInlineGraphJob as unknown as jest.Mock;

const graphArg = (call = 0) => mockRunInline.mock.calls[call][0].graph;

describe("useRunFromHere (Run Node)", () => {
  const mockGetResult = jest.fn();
  const mockGetOutputResult = jest.fn();
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
    mockGetResult.mockReturnValue(undefined);
    mockGetOutputResult.mockReturnValue(undefined);
    mockGetMetadata.mockReturnValue({ title: "Chat" });

    mockRunInline.mockImplementation(() =>
      Promise.resolve({ success: true, outputs: {} })
    );
    mockUseNodes.mockImplementation((selector) =>
      selector({ edges, nodes: [nodeA, nodeB], workflow })
    );
    mockResultsGetState.mockReturnValue({
      getOutputResult: mockGetOutputResult,
      getResult: mockGetResult
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

  it("inlines a cached upstream result and sends only the clicked node", () => {
    mockGetResult.mockReturnValue({ output: "cached" });
    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(graphArg().nodes.map((n: { id: string }) => n.id)).toEqual([
      "node-b"
    ]);
    expect(graphArg().edges).toEqual([]);
    // The cached upstream result is injected into the node's properties so it
    // runs with realistic inputs: resolveExternalEdgeValue extracts the
    // "output" handle from { output: "cached" } and writes it to the inbound
    // edge's "value" target handle.
    expect(graphArg().nodes[0].data).toEqual({ value: "cached" });
  });

  it("reads the hydrated output bucket before the node_complete envelope", () => {
    // Reopened-workflow case: the upstream result lives only in outputResults.
    mockGetOutputResult.mockReturnValue({ output: "hydrated" });
    mockGetResult.mockReturnValue(undefined);
    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(mockRunInline).toHaveBeenCalledTimes(1);
    expect(graphArg().nodes[0].data).toEqual({ value: "hydrated" });
  });

  it("blocks and warns when an uncached generative upstream feeds the node", () => {
    // node-a has no cached result and is flagged as a generative node.
    mockGetResult.mockReturnValue(undefined);
    mockGetOutputResult.mockReturnValue(undefined);
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
