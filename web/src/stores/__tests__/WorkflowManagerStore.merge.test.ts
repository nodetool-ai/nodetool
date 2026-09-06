/**
 * @jest-environment jsdom
 *
 * refreshWorkflow's dirty-editor path: when the external write carried ops,
 * a dirty canvas merges the change per merge unit instead of bailing
 * (ADR 0001). Covers the plan's S7 case — user deletes node B while an agent
 * adds C and connects C→B: C lands, the edge to deleted B is dropped and
 * listed as dangling.
 */
import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { act } from "@testing-library/react";
import type { Workflow } from "../ApiTypes";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    workflows: {
      update: { mutate: jest.fn() },
      versions: { create: { mutate: jest.fn() } }
    }
  }
}));

jest.mock("../NodeStore", () => ({
  createNodeStore: (workflow: Workflow) =>
    create(
      (
        set: (fn: (state: { workflow: Workflow }) => object) => void,
        get: () => { workflow: Workflow }
      ) => ({
        workflow,
        nodes: [],
        edges: [],
        workflowIsDirty: false,
        getWorkflow: () => get().workflow,
        setWorkflowDirty: jest.fn(),
        setWorkflowUpdatedAt: (updatedAt: string) =>
          set((state) => ({
            workflow: { ...state.workflow, updated_at: updatedAt }
          })),
        cleanup: jest.fn()
      })
    )
}));

jest.mock("../workflowUpdates", () => ({
  subscribeToWorkflowUpdates: jest.fn(),
  unsubscribeFromWorkflowUpdates: jest.fn()
}));

jest.mock("../WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn(() => ({ getState: () => ({}) })),
  disposeWorkflowRunnerStore: jest.fn()
}));

jest.mock("../runReconciliation", () => ({
  startRunReconciliation: jest.fn(),
  stopRunReconciliation: jest.fn()
}));

jest.mock("../../components/appbuilder/runtime/appRuntimeStore", () => ({
  disposeAppRuntimeStore: jest.fn(),
  workflowInstanceId: (id: string) => id
}));

const fetchWorkflowById = jest.fn();
jest.mock("../../serverState/useWorkflow", () => ({
  fetchWorkflowById: (...args: unknown[]) => fetchWorkflowById(...args),
  workflowQueryKey: (id: string): [string, string] => ["workflow", id]
}));

import { trpcClient } from "../../trpc/client";
import { createWorkflowManagerStore } from "../../stores/WorkflowManagerStore";
import type { NodeStore as NodeStoreApi } from "../../stores/NodeStore";
import { useConflictStore } from "../ConflictStore";
import { graphNodeToReactFlowNode } from "../graphNodeToReactFlowNode";
import type { DocumentOp } from "@nodetool-ai/protocol";

void trpcClient;

const graphNode = (id: string, title: string, properties = {}) => ({
  id,
  type: "nodetool.text.Input",
  data: { title, properties },
  ui_properties: {},
  dynamic_inputs: {},
  static_inputs: [],
  edges: []
});

const baseGraph = {
  nodes: [graphNode("A", "Input"), graphNode("B", "Output")],
  edges: [{ id: "e1", source: "A", target: "B" }]
};

const baseWorkflow: Workflow = {
  id: "wf-1",
  name: "Base",
  description: "",
  access: "private",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
  etag: "base-etag",
  graph: JSON.parse(JSON.stringify(baseGraph))
} as unknown as Workflow;

/** A hand-built store standing in for the per-workflow NodeStore. */
function makeFakeNodeStore(nodes: unknown[], edges: unknown[]) {
  const applyExternalGraph = jest.fn();
  const store = {
    setState: jest.fn(),
    getState: () => ({
      workflowIsDirty: true,
      nodes,
      edges,
      getWorkflow: () =>
        ({ ...baseWorkflow, updated_at: "2026-08-11T00:00:00Z" }) as Workflow,
      setWorkflowDirty: jest.fn(),
      applyExternalGraph,
      findNode: (id: string) => nodes.find((n) => (n as { id: string }).id === id),
      updateNodeData: jest.fn(),
      updateNode: jest.fn(),
      addNode: jest.fn(),
      deleteNode: jest.fn(),
      deleteEdge: jest.fn(),
      cleanup: jest.fn()
    })
  };
  return { store: store as unknown as NodeStoreApi, applyExternalGraph };
}

describe("refreshWorkflow — external change merges into a dirty canvas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ byKey: {} });
    localStorage.clear();
  });

  it("keeps the draft node edit and takes the new node; drops the edge to the deleted node", async () => {
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);
    // Opening the workflow is what records the merge base.
    store.getState().addWorkflow(baseWorkflow);

    // The invalidation this notice triggers refetched first, so the query
    // cache already holds the server copy. The base must not come from there.
    queryClient.setQueryData(["workflow", "wf-1"], {
      ...baseWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "fresh-etag",
      graph: {
        nodes: [
          graphNode("A", "Input"),
          graphNode("B", "Output"),
          graphNode("C", "Agent node")
        ],
        edges: [
          { id: "e1", source: "A", target: "B" },
          { id: "e-cb", source: "C", target: "B" }
        ]
      }
    });

    // The open editor: the user edited A's data and deleted B.
    const draftNodes = [
      {
        id: "A",
        type: "nodetool.text.Input",
        position: { x: 0, y: 0 },
        data: { title: "Input", properties: { value: "draft-edit" } }
      }
    ];
    const draftEdges: unknown[] = [];
    const { store: fakeStore, applyExternalGraph } = makeFakeNodeStore(
      draftNodes,
      draftEdges
    );
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore },
      currentWorkflowId: "wf-1"
    }));

    // The server copy: B still there, agent added C plus the edge C→B.
    fetchWorkflowById.mockResolvedValue({
      ...baseWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "fresh-etag",
      graph: {
        nodes: [
          graphNode("A", "Input"),
          graphNode("B", "Output"),
          graphNode("C", "Agent node")
        ],
        edges: [
          { id: "e1", source: "A", target: "B" },
          { id: "e-cb", source: "C", target: "B" }
        ]
      }
    });

    const ops: DocumentOp[] = [
      { tool: "ui_add_node", input: { id: "C", type: "nodetool.text.Output" } },
      { tool: "ui_connect_nodes", input: {} }
    ];

    await store.getState().refreshWorkflow("wf-1", undefined, ops);

    // The merged graph replaced the canvas without replacing the store.
    expect(applyExternalGraph).toHaveBeenCalledTimes(1);
    const [nodes, edges, token] = applyExternalGraph.mock.calls[0];
    expect((nodes as { id: string }[]).map((n) => n.id)).toEqual(["A", "C"]);
    // The draft's data edit survived.
    const mergedNodes = nodes as {
      id: string;
      data: { properties?: { value?: string } };
    }[];
    expect(
      mergedNodes.find((n) => n.id === "A")?.data.properties?.value
    ).toBe("draft-edit");
    // The edge into the draft-deleted B is dangling: dropped and listed.
    expect(edges).toEqual([]);

    expect(token).toMatchObject({ etag: "fresh-etag", updatedAt: "2026-08-12T00:00:00Z" });
    const conflicts =
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? [];
    expect(conflicts.map((c) => `${c.unit.kind}:${c.reason}`)).toContain(
      "edge:dangling"
    );
  });

  it("offers a replaced conflict for a dirty editor when the write carried no ops", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["workflow", "wf-1"], baseWorkflow);
    const store = createWorkflowManagerStore(queryClient);

    const { store: fakeStore, applyExternalGraph } = makeFakeNodeStore([], []);
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    fetchWorkflowById.mockClear();
    fetchWorkflowById.mockResolvedValue({
      ...baseWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "fresh-etag"
    });

    await store.getState().refreshWorkflow("wf-1");

    // The draft stands; the server copy is offered as one conflict.
    expect(applyExternalGraph).not.toHaveBeenCalled();
    const conflicts =
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      unit: { kind: "document" },
      reason: "replaced"
    });
    expect(conflicts[0].external).toMatchObject({ id: "wf-1" });

    // Accepting swaps the store for the server copy (the clean-reload path).
    act(() => {
      useConflictStore.getState().accept("workflow:wf-1", conflicts[0].unit.id);
    });
    const replacement = store.getState().nodeStores["wf-1"];
    expect(replacement).toBeDefined();
    expect(replacement).not.toBe(fakeStore);
    expect(replacement.getState().getWorkflow()).toMatchObject({
      etag: "fresh-etag"
    });
    expect(
      queryClient.getQueryData(["workflow", "wf-1"])
    ).toMatchObject({ updated_at: "2026-08-12T00:00:00Z" });

    // Discarding keeps the draft registration-free.
    useConflictStore.setState({ byKey: {} });
  });

  it("offers replaced when a dirty editor has no cached merge base", async () => {
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);

    const { store: fakeStore, applyExternalGraph } = makeFakeNodeStore([], []);
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    fetchWorkflowById.mockResolvedValue({
      ...baseWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "fresh-etag"
    });

    await store.getState().refreshWorkflow("wf-1", "fresh-etag", [
      { tool: "ui_add_node", input: { id: "C" } }
    ]);

    expect(applyExternalGraph).not.toHaveBeenCalled();
    const conflicts =
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("replaced");
  });
});

const updateMutate = trpcClient.workflows.update.mutate as jest.Mock;

/** One turn of the microtask/timer queue, for work a `void` call started. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("refreshWorkflow — the merge base follows the editor's own saves", () => {
  const noEdgeWorkflow: Workflow = {
    ...baseWorkflow,
    graph: { nodes: [graphNode("A", "Input", { value: "v0" })], edges: [] }
  } as unknown as Workflow;

  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ byKey: {} });
    localStorage.clear();
  });

  it("takes the server value for a unit the user just saved, with no conflict", async () => {
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);
    store.getState().addWorkflow(noEdgeWorkflow);

    // The user saves A with "v1": the server row — and the merge base — now
    // holds that value.
    const savedWorkflow: Workflow = {
      ...noEdgeWorkflow,
      graph: { nodes: [graphNode("A", "Input", { value: "v1" })], edges: [] }
    } as unknown as Workflow;
    updateMutate.mockResolvedValue({
      ...savedWorkflow,
      updated_at: "2026-08-11T00:00:00Z",
      etag: "saved-etag"
    });
    await store.getState().saveWorkflow(savedWorkflow);

    // The canvas is dirty again elsewhere, but A still holds what was saved.
    const draftNodes = (savedWorkflow.graph?.nodes ?? []).map((node) =>
      graphNodeToReactFlowNode(savedWorkflow, node)
    );
    const { store: fakeStore, applyExternalGraph } = makeFakeNodeStore(
      draftNodes,
      []
    );
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    // An agent rewrites A to "v2".
    fetchWorkflowById.mockResolvedValue({
      ...noEdgeWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "fresh-etag",
      graph: { nodes: [graphNode("A", "Input", { value: "v2" })], edges: [] }
    });

    await store
      .getState()
      .refreshWorkflow("wf-1", "fresh-etag", [
        { tool: "ui_update_node_data", input: { node_id: "A" } }
      ]);

    expect(applyExternalGraph).toHaveBeenCalledTimes(1);
    const [nodes] = applyExternalGraph.mock.calls[0];
    const merged = nodes as {
      id: string;
      data: { properties?: Record<string, unknown> };
    }[];
    // The base rolled with the save, so only the server changed A.
    expect(merged.find((n) => n.id === "A")?.data.properties).toMatchObject({
      properties: { value: "v2" }
    });
    expect(
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? []
    ).toEqual([]);
  });

  it("takes a second agent write to a node the draft never touched", async () => {
    // The base a merge leaves behind is round-tripped through the graph
    // converters. If that round trip were lossy, the second write would read
    // the node as changed on both sides and contest what the draft never
    // touched.
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);
    store.getState().addWorkflow(noEdgeWorkflow);

    // A canvas that folds a merge back in, the way the real store does.
    let nodes: unknown[] = (noEdgeWorkflow.graph?.nodes ?? []).map((node) =>
      graphNodeToReactFlowNode(noEdgeWorkflow, node)
    );
    const applyExternalGraph = jest.fn((merged: unknown[]) => {
      nodes = merged;
    });
    const fakeStore = {
      setState: jest.fn(),
      getState: () => ({
        workflowIsDirty: true,
        nodes,
        edges: [],
        getWorkflow: () =>
          ({ ...noEdgeWorkflow, updated_at: "2026-08-11T00:00:00Z" }) as Workflow,
        setWorkflowDirty: jest.fn(),
        applyExternalGraph,
        findNode: (id: string) =>
          nodes.find((n) => (n as { id: string }).id === id),
        updateNodeData: jest.fn(),
        updateNode: jest.fn(),
        addNode: jest.fn(),
        deleteNode: jest.fn(),
        deleteEdge: jest.fn(),
        cleanup: jest.fn()
      })
    } as unknown as NodeStoreApi;
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    const agentWrite = async (value: string, etag: string, at: string) => {
      fetchWorkflowById.mockResolvedValue({
        ...noEdgeWorkflow,
        updated_at: at,
        etag,
        graph: { nodes: [graphNode("A", "Input", { value })], edges: [] }
      });
      await store
        .getState()
        .refreshWorkflow("wf-1", etag, [
          { tool: "ui_update_node_data", input: { node_id: "A" } }
        ]);
    };

    await agentWrite("v1", "etag-1", "2026-08-12T00:00:00Z");
    await agentWrite("v2", "etag-2", "2026-08-13T00:00:00Z");

    expect(applyExternalGraph).toHaveBeenCalledTimes(2);
    expect(
      (nodes as { id: string; data: { properties?: Record<string, unknown> } }[])
        .find((n) => n.id === "A")?.data.properties
    ).toMatchObject({ properties: { value: "v2" } });
    expect(
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? []
    ).toEqual([]);
  });

  it("holds a foreign write during a save and reports it once the save settles", async () => {
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);
    store.getState().addWorkflow(noEdgeWorkflow);

    const { store: fakeStore } = makeFakeNodeStore([], []);
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    let releaseSave: (value: Workflow) => void = () => {};
    updateMutate.mockImplementation(
      () =>
        new Promise<Workflow>((resolve) => {
          releaseSave = resolve;
        })
    );
    fetchWorkflowById.mockResolvedValue({
      ...noEdgeWorkflow,
      updated_at: "2026-08-12T00:00:00Z",
      etag: "foreign-etag"
    });

    const savePromise = store.getState().saveWorkflow(noEdgeWorkflow);
    // Another tab writes the row while our save is in flight, no ops.
    await store.getState().refreshWorkflow("wf-1", "foreign-etag");
    // Nothing is decided until the save response names our own etag.
    expect(fetchWorkflowById).not.toHaveBeenCalled();
    expect(useConflictStore.getState().byKey["workflow:wf-1"]).toBeUndefined();

    releaseSave({
      ...noEdgeWorkflow,
      updated_at: "2026-08-11T00:00:00Z",
      etag: "saved-etag"
    });
    await savePromise;
    await settle();

    const conflicts =
      useConflictStore.getState().byKey["workflow:wf-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("replaced");
  });

  it("drops the editor's own save echo that arrived before the response", async () => {
    const queryClient = new QueryClient();
    const store = createWorkflowManagerStore(queryClient);
    store.getState().addWorkflow(noEdgeWorkflow);

    const { store: fakeStore } = makeFakeNodeStore([], []);
    store.setState((state: { nodeStores: Record<string, NodeStoreApi> }) => ({
      nodeStores: { ...state.nodeStores, "wf-1": fakeStore }
    }));

    let releaseSave: (value: Workflow) => void = () => {};
    updateMutate.mockImplementation(
      () =>
        new Promise<Workflow>((resolve) => {
          releaseSave = resolve;
        })
    );

    const savePromise = store.getState().saveWorkflow(noEdgeWorkflow);
    // The broadcast of our own write beat the mutation's response.
    await store.getState().refreshWorkflow("wf-1", "saved-etag");

    releaseSave({
      ...noEdgeWorkflow,
      updated_at: "2026-08-11T00:00:00Z",
      etag: "saved-etag"
    });
    await savePromise;
    await settle();

    expect(fetchWorkflowById).not.toHaveBeenCalled();
    expect(useConflictStore.getState().byKey["workflow:wf-1"]).toBeUndefined();
  });
});
