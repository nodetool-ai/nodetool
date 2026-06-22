import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { resolveExternalEdgeValue } from "./edgeValue";
import { EdgeOverrideCollector, applyNodeOverrides } from "./edgeOverrides";
import { buildReplayForEach } from "./replayStream";

type GetResult = (_workflowId: string, _nodeId: string) => unknown;
type GetMetadata = (_nodeType: string) => NodeMetadata | undefined;
type GetSelectedOutputs = (
  _workflowId: string,
  _sourceId: string,
  _sourceHandle: string | null | undefined
) => unknown[] | undefined;

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
  getMetadata,
  getSelectedOutputs
}: {
  targetId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  getResult: GetResult;
  getMetadata: GetMetadata;
  /**
   * Optional per-edge multi-select stream: the value list a source node would
   * emit to one edge handle when 2+ generations are selected. Consulted BEFORE
   * the normal single-value resolution. When it yields a non-empty list, the
   * source is pruned and a synthetic ForEach replay node is injected whose
   * `input_list` is that list, streaming the N values into the target handle as
   * N iteration-correlated emissions (identical to a live generation). No
   * list-type gate — streaming N items to ANY consumer is valid live behavior.
   */
  getSelectedOutputs?: GetSelectedOutputs;
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
  // Synthetic ForEach replay nodes (and their edges) injected for multi-select
  // sources. They are not part of the original graph, so append them explicitly
  // to the returned subgraph — keyed by id to dedup a source feeding the same
  // target handle twice.
  const replayNodesById = new Map<string, Node<NodeData>>();
  const replayEdges: Edge[] = [];

  const stack: string[] = [targetId];
  while (stack.length) {
    const currentId = stack.pop()!;
    const inbound = edgesByTarget.get(currentId) ?? [];
    for (const edge of inbound) {
      if (!edge.targetHandle) {
        continue;
      }

      // Multi-select STREAM: when the source has 2+ generations selected, prune
      // it and inject a ForEach replay node that streams the selected values
      // into this target handle as N iteration-correlated emissions — identical
      // to a live generation of those N items. No list-type gate.
      if (getSelectedOutputs) {
        const selected = getSelectedOutputs(
          workflowId,
          edge.source,
          edge.sourceHandle
        );
        if (selected && selected.length > 0) {
          const { node, edge: replayEdge } = buildReplayForEach({
            sourceId: edge.source,
            sourceHandle: edge.sourceHandle,
            targetId: currentId,
            targetHandle: edge.targetHandle,
            values: selected,
            workflowId
          });
          if (!replayNodesById.has(node.id)) {
            replayNodesById.set(node.id, node);
            replayEdges.push(replayEdge);
          }
          continue;
        }
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

  // Append synthetic ForEach replay nodes/edges: they aren't in the original
  // graph (their target is already included), so the edge filter above skips
  // them. Their ids are namespaced ("replay:…") so they never collide with a
  // real node id.
  return {
    nodes: [...subgraphNodes, ...replayNodesById.values()],
    edges: [...subgraphEdges, ...replayEdges],
    nodeIds: included,
    blocked
  };
};
