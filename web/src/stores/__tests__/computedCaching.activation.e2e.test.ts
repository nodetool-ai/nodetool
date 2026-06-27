/**
 * END-TO-END activation test for Computed run-subgraph caching (spec §3.4 / §5).
 *
 * Proves the full live loop with REAL production code on every hop — no fakes
 * for the cache machinery:
 *
 *   1. Dispatch records signatures:
 *        computeRunSignatures(graph)  →  recordRunSignatures(jobId, sigs)
 *      (exactly what WorkflowRunner.run does before awaiting anything).
 *   2. A completed node_update stamps the produced generation:
 *        handleUpdate(node_update{completed})  reads getRunSignature(jobId,id)
 *        and writes a live Generation carrying that inputSignature into
 *        ResultsStore (the non-generator fallback path — the realistic path for
 *        a Computed node, which emits no generation_complete).
 *   3. A subsequent buildRunSubgraph REUSES that computed generation:
 *        getGenerations = the real getNodeGenerations accessor (WorkflowAssetStore
 *        ⊕ ResultsStore live buffer) the run path actually uses. resolve → "reuse",
 *        the Computed source is pruned, its cached output inlined onto the target.
 *
 * Negatives prove safe behavior:
 *   - Edit the node → its signature changes → the stamp no longer matches →
 *     buildRunSubgraph INCLUDES and re-runs it.
 *   - A Computed node with NO cache_ttl is never reused even with a perfectly
 *     matching stamped generation (cache is opt-in per node type).
 *
 * Also asserts the contract seam directly: the signature stamped at dispatch
 * equals the signature the reuse hasher looks up — so a stamp made at dispatch
 * is guaranteed to match at reuse time.
 *
 * Run from the web dir: `cd web && npx jest src/stores/__tests__/computedCaching.activation.e2e.test.ts`
 */
import { Edge, Node } from "@xyflow/react";
import type { NodeMetadata, NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import { NodeData } from "../NodeData";
import useResultsStore from "../ResultsStore";
import useMetadataStore from "../MetadataStore";
import { handleUpdate } from "../workflowUpdates";
import {
  recordRunSignatures,
  getRunSignature,
  clearRunSignatures
} from "../runSignatures";
import { computeRunSignatures } from "../../utils/computeRunSignatures";
import { createNodeHasher } from "../../utils/nodeHash";
import { getNodeGenerations } from "../nodeGenerationAccessor";
import { buildRunSubgraph } from "../../utils/runSubgraph";

const WF = "wf-e2e";
const NOW = 1_700_000_000_000;

// -------------------------------------------------------------------------
// Graph + metadata fixtures (same prefix convention as runSubgraph.test.ts):
//   pure.*  → Computed, cache_ttl "forever"
//   proc.*  → Computed, no cache_ttl (re-run)
//   gen.*   → Generative (auto_save_asset)
// -------------------------------------------------------------------------
const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {},
  data: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties,
    dynamic_properties: {},
    selectable: true,
    workflow_id: WF,
    ...data
  }
});

const edge = (
  id: string,
  source: string,
  target: string,
  targetHandle = "input",
  sourceHandle = "output"
): Edge => ({ id, source, target, sourceHandle, targetHandle, type: "default" });

const getMetadata = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    cache_ttl: type.startsWith("pure.") ? "forever" : undefined,
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

// -------------------------------------------------------------------------
// handleUpdate plumbing (mirrors workflowUpdates.signatures.test.ts).
// -------------------------------------------------------------------------
const mockAddNotification = jest.fn();
const mockRunnerStore = {
  getState: () => ({
    job_id: null,
    state: "running",
    queuePosition: null,
    statusMessage: null,
    addNotification: mockAddNotification
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};
const mockWorkflow = { id: WF, name: "E2E" } as WorkflowAttributes;

const dispatch = (data: unknown) =>
  handleUpdate(
    mockWorkflow,
    data as never,
    mockRunnerStore as never,
    () => undefined
  );

const nodeUpdate = (
  status: string,
  jobId: string,
  nodeId: string,
  extra: Record<string, unknown> = {}
): NodeUpdate =>
  ({
    type: "node_update",
    node_id: nodeId,
    node_name: nodeId,
    node_type: "pure.Format",
    status,
    job_id: jobId,
    ...extra
  }) as unknown as NodeUpdate;

// The real merged-timeline accessor the run path uses (WorkflowAssetStore is
// empty in this test → it returns exactly the live generations handleUpdate
// stamped into ResultsStore).
const liveGetGenerations = (wf: string, id: string) =>
  getNodeGenerations(wf, id);

const build = (targetId: string, nodes: Node<NodeData>[], edges: Edge[]) =>
  buildRunSubgraph({
    targetId,
    nodes,
    edges,
    workflowId: WF,
    getMetadata,
    getGenerations: liveGetGenerations,
    now: NOW
  });

const propsOf = (sub: ReturnType<typeof build>, id: string) =>
  sub.nodes.find((n) => n.id === id)!.data.properties;

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  // The completion re-stamp (workflowUpdates) classifies nodes via the global
  // MetadataStore. Seed it with the fixture types so `gen.*` classifies as
  // generative there exactly as in dispatch — production loads metadata at
  // startup before any run completes.
  useMetadataStore.getState().setMetadata({
    "gen.Image": getMetadata("gen.Image"),
    "pure.Format": getMetadata("pure.Format"),
    "pure.Leaf": getMetadata("pure.Leaf"),
    "proc.Plain": getMetadata("proc.Plain"),
    "proc.Step": getMetadata("proc.Step"),
    "nodetool.constant.String": getMetadata("nodetool.constant.String")
  });
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
});

describe("Computed caching — end-to-end activation (dispatch → stamp → reuse)", () => {
  it("records a signature at dispatch, stamps it on completion, then REUSES the computed generation (cache_ttl forever)", () => {
    const target = node("target", "proc.Plain");
    const u = node("u", "pure.Format", { x: 1 });
    const nodes = [target, u];
    const edges = [edge("e", "u", "target")];
    const jobId = "job-e2e-reuse";

    // 1. DISPATCH — compute signatures over the FULL live graph and stash them,
    //    exactly as WorkflowRunner.run does synchronously before awaiting.
    const signatures = computeRunSignatures(["u", "target"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations // empty now — nothing has run yet
    });
    recordRunSignatures(jobId, signatures);
    expect(getRunSignature(jobId, "u")).toBe(signatures["u"]);

    // 2. STAMP — u is a non-generator Computed: it emits node_update{completed}
    //    (no generation_complete), so handleUpdate's fallback synthesizes ONE
    //    live generation and stamps it with the dispatch-time signature.
    dispatch(
      nodeUpdate("completed", jobId, "u", {
        result: { output: "CACHED-RESULT" }
      })
    );

    const stamped = useResultsStore.getState().getLiveGenerations(WF, "u");
    expect(stamped).toHaveLength(1);
    expect(stamped[0]).toMatchObject({
      status: "completed",
      outputs: { output: "CACHED-RESULT" },
      inputSignature: signatures["u"]
    });

    // The run is over: drop the dispatch registry (handleUpdate does this on the
    // terminal job_update). Reuse must NOT depend on it — it reads the signature
    // off the stamped generation, not the registry.
    clearRunSignatures(jobId);
    expect(getRunSignature(jobId, "u")).toBeUndefined();

    // 3. REUSE — a later partial run of `target`. resolve("u") → "reuse":
    //    the source is pruned (only the target is submitted) and its cached
    //    output is inlined onto the target's input handle.
    const sub = build("target", nodes, edges);
    expect(sub.nodeIds).toEqual(new Set(["target"]));
    expect(sub.edges).toEqual([]);
    expect(sub.blocked).toEqual([]);
    expect(propsOf(sub, "target").input).toBe("CACHED-RESULT");
  });

  it("NEGATIVE: editing the node changes its signature → the stamp no longer matches → included & re-run", () => {
    const target = node("target", "proc.Plain");
    const u = node("u", "pure.Format", { x: 1 });
    const nodes = [target, u];
    const edges = [edge("e", "u", "target")];
    const jobId = "job-e2e-edit";

    // Dispatch + stamp the original run (same loop as above).
    const signatures = computeRunSignatures(["u", "target"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    });
    recordRunSignatures(jobId, signatures);
    dispatch(
      nodeUpdate("completed", jobId, "u", {
        result: { output: "OLD-RESULT" }
      })
    );
    clearRunSignatures(jobId);

    // Sanity: unedited, it reuses.
    const reused = build("target", nodes, edges);
    expect(reused.nodeIds).toEqual(new Set(["target"]));
    expect(propsOf(reused, "target").input).toBe("OLD-RESULT");

    // EDIT u (x: 1 → 2). The stamped generation still carries the OLD signature;
    // buildRunSubgraph recomputes u's NEW signature, which no longer matches.
    const uEdited = node("u", "pure.Format", { x: 2 });
    const editedNodes = [target, uEdited];

    // Seam: the edit really moved the signature off the stamp.
    const editedSig = computeRunSignatures(["u"], {
      nodes: editedNodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    })["u"];
    expect(editedSig).not.toBe(signatures["u"]);

    const sub = build("target", editedNodes, edges);
    expect(sub.nodeIds).toEqual(new Set(["target", "u"]));
    expect(sub.edges.map((e) => e.id)).toEqual(["e"]);
    // No stale value inlined — u re-runs to produce the fresh output.
    expect(propsOf(sub, "target").input).toBeUndefined();
  });

  it("SAFE: a Computed node with NO cache_ttl is never reused, even with a matching stamped generation", () => {
    const target = node("target", "proc.Plain");
    // proc.* has cache_ttl undefined → caching is opt-out by default.
    const u = node("u", "proc.Step", { x: 1 });
    const nodes = [target, u];
    const edges = [edge("e", "u", "target")];
    const jobId = "job-e2e-nocache";

    const signatures = computeRunSignatures(["u", "target"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    });
    recordRunSignatures(jobId, signatures);
    dispatch(
      nodeUpdate("completed", jobId, "u", {
        result: { output: "NOCACHE-RESULT" }
      })
    );
    clearRunSignatures(jobId);

    // Signature matches perfectly, but the node type opts out of caching.
    const stamped = useResultsStore.getState().getLiveGenerations(WF, "u");
    expect(stamped[0].inputSignature).toBe(signatures["u"]);

    const sub = build("target", nodes, edges);
    expect(sub.nodeIds).toEqual(new Set(["target", "u"]));
    expect(propsOf(sub, "target").input).toBeUndefined();
  });

  it("SEAM: the signature stamped at dispatch is exactly the one the reuse hasher looks up", () => {
    // A computed chain leaf→u→target. The dispatch stamp for each node must
    // equal the signature buildRunSubgraph/resolve recomputes at reuse time,
    // otherwise a stamp made at dispatch could never match at reuse.
    const target = node("target", "proc.Plain");
    const u = node("u", "pure.Format", { x: 1 });
    const leaf = node("leaf", "pure.Leaf", { z: 9 });
    const nodes = [target, u, leaf];
    const edges = [edge("e1", "u", "target"), edge("e2", "leaf", "u")];

    // computeRunSignatures wraps computeInputSignatures with the SAME HasherContext
    // buildRunSubgraph builds, so dispatch-time and reuse-time signatures coincide.
    const dispatchSigs = computeRunSignatures(["leaf", "u"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    });

    // Drive the loop for the whole chain, then prove reuse cascades: both
    // leaf and u are pruned, only the target is submitted.
    const jobId = "job-e2e-seam";
    recordRunSignatures(jobId, dispatchSigs);
    dispatch(nodeUpdate("completed", jobId, "leaf", { result: { output: "L" } }));
    dispatch(nodeUpdate("completed", jobId, "u", { result: { output: "U" } }));
    clearRunSignatures(jobId);

    expect(
      useResultsStore.getState().getLiveGenerations(WF, "leaf")[0].inputSignature
    ).toBe(dispatchSigs["leaf"]);
    expect(
      useResultsStore.getState().getLiveGenerations(WF, "u")[0].inputSignature
    ).toBe(dispatchSigs["u"]);

    const sub = build("target", nodes, edges);
    expect(sub.nodeIds).toEqual(new Set(["target"]));
    expect(sub.edges).toEqual([]);
    expect(propsOf(sub, "target").input).toBe("U");
  });

  it("FIX (P2): a computed descendant is stamped with the generation its generative upstream produced THIS job, so re-selecting the OLD generation re-runs it", () => {
    // g (generative, pinned to an OLD generation) → c (cacheable computed) →
    // target. A full run produces g's NEW generation, which c consumes. The
    // dispatch stamp folds g_old (g_new doesn't exist yet); the completion
    // re-stamp must instead fold g_new so c's cache is keyed to what it
    // consumed. Re-selecting g_old later must then MISS (c re-runs), not reuse
    // the g_new-derived output.
    const target = node("target", "proc.Plain");
    const g = node("g", "gen.Image", {}, { selected_generation: "g_old" });
    const c = node("c", "pure.Format");
    const nodes = [target, g, c];
    const edges = [edge("e1", "c", "target"), edge("e2", "g", "c", "x")];
    const jobId = "new-job";

    // A prior generation g_old already sits in the live buffer.
    useResultsStore.setState({
      liveGenerations: {
        [`${WF}:g`]: [
          {
            id: "g_old",
            jobId: "old-job",
            createdAt: NOW - 1000,
            outputs: { output: "OLD" },
            status: "completed"
          }
        ]
      }
    } as never);

    // A real NodeStore exposing nodes/edges so the completion re-stamp runs the
    // recompute path (not the no-store fallback).
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nodeStore = {
      getState: () => ({
        nodes,
        edges,
        findNode: (id: string) => byId.get(id),
        updateNodeData: (id: string, data: Partial<NodeData>) => {
          const n = byId.get(id);
          if (n) n.data = { ...n.data, ...data };
        }
      })
    };
    const dispatchWithStore = (data: unknown) =>
      handleUpdate(
        mockWorkflow,
        data as never,
        mockRunnerStore as never,
        () => nodeStore as never
      );

    // DISPATCH over the pre-run graph (g still resolves to g_old).
    const signatures = computeRunSignatures(["g", "c", "target"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    });
    recordRunSignatures(jobId, signatures);

    // RUN: g produces a NEW generation (live id === jobId for slot 0)…
    dispatchWithStore({
      type: "generation_complete",
      node_id: "g",
      job_id: jobId,
      index: 0,
      outputs: { output: "NEW" }
    });
    // …then c completes, having consumed g's new output.
    dispatchWithStore(
      nodeUpdate("completed", jobId, "c", { result: { output: "C-FROM-NEW" } })
    );
    clearRunSignatures(jobId);

    // c is stamped with the signature folding g_new (id === jobId), NOT g_old.
    const sigFolding = (genId: string): string =>
      createNodeHasher({
        findNode: (id) => byId.get(id),
        inboundEdges: (id) => edges.filter((e) => e.target === id),
        getMetadata,
        currentGenerationId: (id) => (id === "g" ? genId : undefined)
      }).inputSignature("c");
    const cGen = useResultsStore.getState().getLiveGenerations(WF, "c").at(-1)!;
    expect(cGen.inputSignature).toBe(sigFolding(jobId));
    expect(cGen.inputSignature).not.toBe(sigFolding("g_old"));

    // Re-select g_old: a later partial run of target must RE-RUN c (its cache is
    // keyed to g_new, but g now feeds g_old) — no stale reuse.
    byId.get("g")!.data.selected_generation = "g_old";
    const sub = build("target", nodes, edges);
    expect(sub.nodeIds.has("c")).toBe(true);
    expect(propsOf(sub, "target").input).toBeUndefined();
  });

  it("REGRESSION (P1): the post-run properties echo-back of an inlined edge value does NOT self-invalidate the cache", () => {
    // c → u(feeds "x") → target. In production a partial run inlines c's value
    // into u's "x" property; the kernel then echoes node.properties back and
    // handleUpdate writes the inlined value into the LIVE node. Because "x" is
    // edge-fed it is excluded from u's signature (spec §3.3 / H13), so u's own
    // signature does not shift after running and the stamp still matches at reuse.
    // Without that exclusion this is a cache MISS (u re-runs) — this test is the
    // regression guard.
    const target = node("target", "proc.Plain");
    const c = node("c", "nodetool.constant.String", { value: "C" });
    const u = node("u", "pure.Format", {}); // "x" arrives via the edge, not config
    const nodes = [target, c, u];
    const edges = [edge("e1", "u", "target"), edge("e2", "c", "u", "x")];
    const jobId = "job-e2e-echo";

    // A real NodeStore so handleUpdate's property write-back mutates the live `u`.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nodeStore = {
      getState: () => ({
        findNode: (id: string) => byId.get(id),
        updateNodeData: (id: string, data: Partial<NodeData>) => {
          const n = byId.get(id);
          if (n) n.data = { ...n.data, ...data };
        }
      })
    };
    const dispatchWithStore = (data: unknown) =>
      handleUpdate(
        mockWorkflow,
        data as never,
        mockRunnerStore as never,
        () => nodeStore as never
      );

    const signatures = computeRunSignatures(["u", "target"], {
      nodes,
      edges,
      workflowId: WF,
      getMetadata,
      getGenerations: liveGetGenerations
    });
    recordRunSignatures(jobId, signatures);

    // RUN u: the kernel echoes node.properties INCLUDING the inlined edge value.
    dispatchWithStore(
      nodeUpdate("completed", jobId, "u", {
        result: { output: "CACHED" },
        properties: { x: "inlined-from-c" }
      })
    );
    clearRunSignatures(jobId);

    // The echo-back really mutated the live node's edge-fed property.
    expect(byId.get("u")!.data.properties.x).toBe("inlined-from-c");

    // REUSE still hits: u's signature is unchanged (edge-fed "x" excluded).
    const sub = build("target", nodes, edges);
    expect(sub.nodeIds).toEqual(new Set(["target"]));
    expect(propsOf(sub, "target").input).toBe("CACHED");
  });
});
