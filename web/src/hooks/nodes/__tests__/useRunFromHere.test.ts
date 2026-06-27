import { renderHook, act } from "@testing-library/react";
import { useRunFromHere } from "../useRunFromHere";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn()
}));
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

import { useNodeStoreRef } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";
import type { Generation } from "../../../utils/nodeGenerations";

const mockUseNodeStoreRef = useNodeStoreRef as jest.Mock;
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
  type TestNode = {
    id: string;
    type: string;
    data: {
      properties: Record<string, unknown>;
      title?: string;
      selected_generation?: string;
      selected_generations?: string[];
    };
  };

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

  const nodeA: TestNode = {
    id: "node-a",
    type: "nodetool.llm.Chat",
    data: { properties: {} }
  };
  const nodeB: TestNode = {
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
  let nodeStoreState: {
    edges: typeof edges;
    nodes: TestNode[];
    workflow: typeof workflow | null;
    findNode: (id: string) => TestNode | undefined;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(liveGenerations)) {
      delete liveGenerations[key];
    }
    mockGetMetadata.mockReturnValue({ title: "Chat" });

    mockRunInline.mockImplementation(() =>
      Promise.resolve({ success: true, outputs: {} })
    );
    nodeStoreState = {
      edges,
      nodes: [nodeA, nodeB],
      workflow,
      findNode: (id: string) => nodeStoreState.nodes.find((n) => n.id === id)
    };
    mockUseNodeStoreRef.mockReturnValue({
      getState: () => nodeStoreState
    });
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

  it("inlines a cached GENERATIVE upstream's output and sends only the clicked node", () => {
    // Only generative (auto-save) upstreams are reused from cache; mark node-a
    // generative so its cached generation is inlined rather than re-run.
    mockGetMetadata.mockReturnValue({ auto_save_asset: true, title: "Chat" });
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

  it("serializes the latest upstream prompt from the store when React has not re-rendered yet", () => {
    const stalePromptNode: TestNode = {
      id: "prompt",
      type: "nodetool.text.Prompt",
      data: { properties: { prompt: "previous prompt" } }
    };
    const freshPromptNode: TestNode = {
      ...stalePromptNode,
      data: { properties: { prompt: "fresh prompt" } }
    };
    const consumerNode: TestNode = {
      id: "consumer",
      type: "nodetool.output.TextOutput",
      data: { properties: {} }
    };
    nodeStoreState = {
      edges: [
        {
          id: "prompt-to-consumer",
          source: "prompt",
          target: "consumer",
          sourceHandle: "output",
          targetHandle: "value"
        }
      ],
      nodes: [freshPromptNode, consumerNode],
      workflow,
      findNode: (id: string) => nodeStoreState.nodes.find((n) => n.id === id)
    };

    const { result } = renderHook(() => useRunFromHere(consumerNode as never));

    act(() => {
      result.current.runFromHere();
    });

    expect(graphArg().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "prompt",
          data: { prompt: "fresh prompt" }
        })
      ])
    );
    expect(graphArg().nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "prompt",
          data: { prompt: "previous prompt" }
        })
      ])
    );
  });

  it("re-runs an edited Prompt upstream even when it has a stale cached generation", () => {
    // The reported bug: Prompt -> Agent, run the Agent once (Prompt now cached),
    // edit the Prompt, Run Node again. The Prompt is non-generative, so its
    // stale cache must NOT be inlined — it is included and re-run with the
    // edited text.
    const promptNode: TestNode = {
      id: "prompt",
      type: "nodetool.text.Prompt",
      data: { properties: { prompt: "Say C" } }
    };
    const agentNode: TestNode = {
      id: "agent",
      type: "nodetool.agents.Agent",
      data: { properties: {} }
    };
    nodeStoreState = {
      edges: [
        {
          id: "prompt-to-agent",
          source: "prompt",
          target: "agent",
          sourceHandle: "output",
          targetHandle: "prompt"
        }
      ],
      nodes: [promptNode, agentNode],
      workflow,
      findNode: (id: string) => nodeStoreState.nodes.find((n) => n.id === id)
    };
    // Stale generation left over from a prior run with the old prompt text.
    seedGeneration("prompt", { output: "Say B" });

    const { result } = renderHook(() => useRunFromHere(agentNode as never));

    act(() => {
      result.current.runFromHere();
    });

    // Prompt is submitted (re-run) carrying its edited text; the stale "Say B"
    // is never inlined onto the agent.
    expect(graphArg().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "prompt", data: { prompt: "Say C" } })
      ])
    );
    const agent = graphArg().nodes.find((n: { id: string }) => n.id === "agent");
    expect(agent.data.prompt).toBeUndefined();
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

  it("records a full-graph input signature for the single submitted node", () => {
    const { result } = renderHook(() => useRunFromHere(nodeA as never));

    act(() => {
      result.current.runFromHere();
    });

    const opts = mockRunInline.mock.calls[0][0];
    // One entry per submitted node, keyed by node id.
    expect(Object.keys(opts.inputSignatures)).toEqual(["node-a"]);
    expect(typeof opts.inputSignatures["node-a"]).toBe("string");
    expect(opts.inputSignatures["node-a"].length).toBeGreaterThan(0);
  });

  it("records signatures for every submitted node, including re-run upstreams", () => {
    // Run from node-b; node-a is a non-generative upstream, so it is submitted
    // (re-run) alongside the target — each node gets a signature keyed by id.
    const { result } = renderHook(() => useRunFromHere(nodeB as never));

    act(() => {
      result.current.runFromHere();
    });

    const opts = mockRunInline.mock.calls[0][0];
    const submittedIds = opts.graph.nodes.map((n: { id: string }) => n.id);
    expect(submittedIds).toEqual(expect.arrayContaining(["node-a", "node-b"]));
    // The signature map covers exactly the submitted nodes.
    expect(Object.keys(opts.inputSignatures).sort()).toEqual(
      [...submittedIds].sort()
    );
    for (const id of submittedIds) {
      expect(typeof opts.inputSignatures[id]).toBe("string");
      expect(opts.inputSignatures[id].length).toBeGreaterThan(0);
    }
  });
});
