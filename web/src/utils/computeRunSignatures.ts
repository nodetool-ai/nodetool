import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { computeInputSignatures } from "./nodeHash";
import { getCurrentGeneration, type Generation } from "./nodeGenerations";

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
  args: {
    nodes: Node<NodeData>[];
    edges: Edge[];
    workflowId: string;
    getMetadata: (_type: string) => NodeMetadata | undefined;
    getGenerations: (_workflowId: string, _nodeId: string) => Generation[];
  }
): Record<string, string> => {
  const { nodes, edges, workflowId, getMetadata, getGenerations } = args;

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

  return computeInputSignatures(nodeIds, {
    findNode,
    inboundEdges: (id) => edgesByTarget.get(id) ?? [],
    getMetadata,
    currentGenerationId: (id) =>
      getCurrentGeneration(
        generationsOf(id),
        findNode(id)?.data?.selected_generation
      )?.id
  });
};
