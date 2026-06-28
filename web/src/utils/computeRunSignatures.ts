import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { computeInputSignatures, createNodeHasher } from "./nodeHash";
import {
  getCurrentGeneration,
  newestCompletedGeneration,
  type Generation
} from "./nodeGenerations";

type GetMetadata = (_type: string) => NodeMetadata | undefined;
type GetGenerations = (_workflowId: string, _nodeId: string) => Generation[];

interface GraphArgs {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  getMetadata: GetMetadata;
  getGenerations: GetGenerations;
}

/**
 * The generation a generative emits to consumers: its current generation when
 * completed, else the latest completed one. Mirrors runResolver.reuseValue
 * EXACTLY — never a running placeholder, so a stamp keyed here always names a
 * generation that reuse/replay actually emits.
 */
const emittedGenerationId = (
  gens: Generation[],
  selectedId: string | undefined
): string | undefined => {
  const current = getCurrentGeneration(gens, selectedId);
  return (current && current.status === "completed"
    ? current
    : newestCompletedGeneration(gens)
  )?.id;
};

/** Shared full-graph accessors over a node/edge list with a memoized generation read. */
const buildAccessors = (args: GraphArgs) => {
  const { nodes, edges, workflowId, getGenerations } = args;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findNode = (id: string): Node<NodeData> | undefined => nodeById.get(id);

  const edgesByTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e);
    else edgesByTarget.set(e.target, [e]);
  }

  const genCache = new Map<string, Generation[]>();
  const generationsOf = (id: string): Generation[] => {
    let g = genCache.get(id);
    if (!g) {
      g = getGenerations(workflowId, id);
      genCache.set(id, g);
    }
    return g;
  };

  return {
    findNode,
    inboundEdges: (id: string): Edge[] => edgesByTarget.get(id) ?? [],
    generationsOf
  };
};

/**
 * Compute each node's `inputSignature` against the FULL live graph for stamping
 * at dispatch (spec §3.4). Builds the SAME {@link HasherContext} that
 * `buildRunSubgraph` builds — `findNode`/`inboundEdges` over the full node/edge
 * lists, and `currentGenerationId` from the merged generation timeline honoring
 * each node's `selected_generation` — so a signature stamped here matches a
 * later `resolve` / `buildRunSubgraph` lookup. Pass the live FULL graph, never a
 * pruned subgraph: the resolver hashes against the full graph too.
 */
export const computeRunSignatures = (
  nodeIds: Iterable<string>,
  args: GraphArgs
): Record<string, string> => {
  const { findNode, inboundEdges, generationsOf } = buildAccessors(args);
  return computeInputSignatures(nodeIds, {
    findNode,
    inboundEdges,
    getMetadata: args.getMetadata,
    currentGenerationId: (id) =>
      emittedGenerationId(
        generationsOf(id),
        findNode(id)?.data?.selected_generation
      )
  });
};

/**
 * Recompute one node's `inputSignature` at COMPLETION time, preferring — for
 * each upstream generative — the generation it produced in THIS job over its
 * pinned `selected_generation`.
 *
 * The dispatch-time stamp folds a generative upstream's PRE-run generation (the
 * one it produces this run does not exist yet), so a computed descendant gets
 * keyed to the wrong generation and a later partial run that re-selects the old
 * generation would reuse output computed from the new one. By completion the
 * upstream's new generation is in the live timeline (it completes before its
 * descendants — same emit order the `sawGenerationComplete` gate relies on), so
 * re-stamping here keys the descendant to the generation it actually consumed.
 * Upstreams that did not run this job fall back to the emitted-generation rule.
 */
export const computeStampSignature = (
  jobId: string,
  nodeId: string,
  args: GraphArgs
): string => {
  const { findNode, inboundEdges, generationsOf } = buildAccessors(args);
  const hasher = createNodeHasher({
    findNode,
    inboundEdges,
    getMetadata: args.getMetadata,
    currentGenerationId: (id) => {
      const gens = generationsOf(id);
      // The generation this job produced for an upstream generative — what the
      // descendant actually consumed — wins over a stale pin. Newest first.
      for (let i = gens.length - 1; i >= 0; i--) {
        const g = gens[i];
        if (g.jobId === jobId && g.status === "completed") return g.id;
      }
      return emittedGenerationId(
        gens,
        findNode(id)?.data?.selected_generation
      );
    }
  });
  return hasher.inputSignature(nodeId);
};
