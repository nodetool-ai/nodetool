import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { resolveExternalEdgeValue } from "./edgeValue";
import { EdgeOverrideCollector, applyNodeOverrides } from "./edgeOverrides";

type GetResult = (_workflowId: string, _nodeId: string) => unknown;
type GetMetadata = (_nodeType: string) => NodeMetadata | undefined;

interface BlockedUpstream {
  nodeId: string;
  title: string;
}

interface RunSubgraph {
  /** Target node plus every non-generative upstream pulled into the run. */
  nodes: Node<NodeData>[];
  /** Edges whose endpoints are both in the subgraph. */
  edges: Edge[];
  nodeIds: Set<string>;
  /** Uncached generative upstreams that must be executed before this run. */
  blocked: BlockedUpstream[];
}

const nodeTitle = (node: Node<NodeData>, getMetadata: GetMetadata): string => {
  const dataTitle = (node.data as { title?: unknown } | undefined)?.title;
  if (typeof dataTitle === "string" && dataTitle.trim()) {
    return dataTitle;
  }
  const meta = node.type ? getMetadata(node.type) : undefined;
  return meta?.title || node.type || node.id;
};

/**
 * Build the minimal subgraph needed to execute `targetId` on its own.
 *
 * Walking upstream from the target, each inbound edge resolves to one of:
 *  - a cached result or literal (constant/input) value → injected as a property
 *    override and the source is pruned from the run;
 *  - an uncached *generative* node (`auto_save_asset`) → recorded in `blocked`
 *    so the caller can tell the user to run it first;
 *  - any other uncached upstream (deterministic / non-generative) → included in
 *    the submitted subgraph and recursed into, so it runs and feeds the target.
 */
export const buildRunSubgraph = ({
  targetId,
  nodes,
  edges,
  workflowId,
  getResult,
  getMetadata
}: {
  targetId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  getResult: GetResult;
  getMetadata: GetMetadata;
}): RunSubgraph => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findNode = (id: string): Node<NodeData> | undefined => nodeById.get(id);

  const edgesByTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e);
    else edgesByTarget.set(e.target, [e]);
  }

  const included = new Set<string>([targetId]);
  const collector = new EdgeOverrideCollector();
  const blocked: BlockedUpstream[] = [];
  const blockedSeen = new Set<string>();

  const stack: string[] = [targetId];
  while (stack.length) {
    const currentId = stack.pop()!;
    const inbound = edgesByTarget.get(currentId) ?? [];
    for (const edge of inbound) {
      if (!edge.targetHandle) {
        continue;
      }

      const { value, hasValue } = resolveExternalEdgeValue(
        edge,
        workflowId,
        getResult,
        findNode
      );
      if (hasValue) {
        collector.add(currentId, edge.targetHandle, value);
        continue;
      }

      const sourceNode = findNode(edge.source);
      if (!sourceNode) {
        continue;
      }

      const meta = sourceNode.type ? getMetadata(sourceNode.type) : undefined;
      if (meta?.auto_save_asset) {
        if (!blockedSeen.has(edge.source)) {
          blockedSeen.add(edge.source);
          blocked.push({
            nodeId: edge.source,
            title: nodeTitle(sourceNode, getMetadata)
          });
        }
        continue;
      }

      if (!included.has(edge.source)) {
        included.add(edge.source);
        stack.push(edge.source);
      }
    }
  }

  const overrides = collector.resolve(findNode, getMetadata);

  const subgraphNodes = [...included]
    .map((id) => findNode(id))
    .filter((n): n is Node<NodeData> => Boolean(n))
    .map((n) => applyNodeOverrides(n, overrides.get(n.id)));

  const subgraphEdges = edges.filter(
    (e) => included.has(e.source) && included.has(e.target)
  );

  return {
    nodes: subgraphNodes,
    edges: subgraphEdges,
    nodeIds: included,
    blocked
  };
};
