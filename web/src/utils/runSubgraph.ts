import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { EdgeOverrideCollector, applyNodeOverrides } from "./edgeOverrides";
import { buildReplayForEach } from "./replayStream";
import { createRunResolver } from "./runResolver";
import { getCurrentGeneration, outputOf, type Generation } from "./nodeGenerations";

type GetMetadata = (_nodeType: string) => NodeMetadata | undefined;
type GetGenerations = (_workflowId: string, _nodeId: string) => Generation[];

interface BlockedUpstream {
  nodeId: string;
  title: string;
}

interface RunSubgraph {
  /** Target node plus every upstream pulled into the run (cache-missed / dirty). */
  nodes: Node<NodeData>[];
  /** Edges whose endpoints are both in the subgraph, plus replay edges. */
  edges: Edge[];
  nodeIds: Set<string>;
  /** Uncached generative upstreams that must be executed before this run. */
  blocked: BlockedUpstream[];
}

/**
 * Build the minimal subgraph needed to execute `targetId` on its own (the "Run
 * Node" / "Run from here" single-node entry point — spec §6).
 *
 * The run region is seeded with the target and grown by every external inbound
 * edge whose source resolves to "run". For each external inbound edge the
 * reuse resolver (`resolve`, spec §5) classifies the source and the subgraph
 * applies the outcome:
 *
 *  - **reuse** — inline a value and prune the source:
 *      • Constant   → its live property value (never the cache);
 *      • Generative → the current generation's output (history, no hash gate);
 *      • Computed   → the output of the completed generation whose stamped
 *        `inputSignature` matches the source's current signature AND is within
 *        its `cache_ttl`. (Computed generations are stamped at dispatch — the
 *        runSignatures registry → handleUpdate — so reuse is live for node types
 *        that declare `cache_ttl`; a node with no recorded signature simply
 *        misses and re-runs.)
 *    A Constant whose live value is undefined falls through to "run".
 *  - **replay** — a Generative with ≥2 selected generations: inject a synthetic
 *    ForEach that streams the selected (pick-ordered) values into the target
 *    handle; prune the source; dedup one replay per (source,handle,target).
 *  - **run** — include the source in the submitted subgraph and recurse into its
 *    inbound edges so it re-executes and feeds the target.
 *  - **block** — a Generative with no usable generation: record it so the caller
 *    can tell the user to run it first. A Computed that resolves to "block"
 *    (because a deeper generative blocks) is still included and recursed so the
 *    blocking generative is reached and reported.
 *
 * Bypass: the coarse `bypassed` flag is folded into each node's `inputSignature`
 * (see nodeHash.ts). The kernel's per-handle `rewriteBypassedNodes` is not
 * applied here — it lives in @nodetool-ai/kernel, which the web bundle does not
 * depend on, and operates on protocol GraphData rather than ReactFlow nodes.
 */
export const buildRunSubgraph = ({
  targetId,
  nodes,
  edges,
  workflowId,
  getMetadata,
  getGenerations,
  now
}: {
  targetId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  getMetadata: GetMetadata;
  /** Merged generation history (durable assets + live buffer) for a node. */
  getGenerations: GetGenerations;
  /** Injected clock (ms) for TTL freshness. App passes `Date.now()`. */
  now: number;
}): RunSubgraph => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findNode = (id: string): Node<NodeData> | undefined => nodeById.get(id);

  const edgesByTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e);
    else edgesByTarget.set(e.target, [e]);
  }
  const inboundEdges = (id: string): Edge[] => edgesByTarget.get(id) ?? [];

  // One shared resolver carries the hasher, generation cache, and all reuse
  // resolution so every partial-run entry point classifies/decides identically.
  const resolver = createRunResolver({
    nodes,
    edges,
    workflowId,
    getMetadata,
    getGenerations,
    now
  });

  const included = new Set<string>([targetId]);
  const collector = new EdgeOverrideCollector();
  const blocked: BlockedUpstream[] = [];
  const blockedSeen = new Set<string>();
  // Synthetic ForEach replay nodes/edges (multi-select), keyed by id to dedup a
  // source feeding the same target handle twice.
  const replayNodesById = new Map<string, Node<NodeData>>();
  const replayEdges: Edge[] = [];

  const stack: string[] = [targetId];
  while (stack.length) {
    const currentId = stack.pop()!;
    for (const edge of inboundEdges(currentId)) {
      if (!edge.targetHandle) {
        continue;
      }
      const source = edge.source;
      const sourceNode = findNode(source);

      // Dangling edge (source not in the graph): it can't run, so inline its
      // current generation's output if one exists, otherwise drop the edge.
      if (!sourceNode) {
        const current = getCurrentGeneration(resolver.generations(source));
        if (current) {
          const value = outputOf(current, edge.sourceHandle ?? undefined);
          if (value !== undefined) {
            collector.add(currentId, edge.targetHandle, value);
          }
        }
        continue;
      }

      const decision = resolver.decide(source);

      if (decision === "replay") {
        const { node: replayNode, edge: replayEdge } = buildReplayForEach({
          sourceId: source,
          sourceHandle: edge.sourceHandle,
          targetId: currentId,
          targetHandle: edge.targetHandle,
          values: resolver.replayValues(source, edge.sourceHandle),
          workflowId
        });
        if (!replayNodesById.has(replayNode.id)) {
          replayNodesById.set(replayNode.id, replayNode);
          replayEdges.push(replayEdge);
        }
        continue;
      }

      if (decision === "reuse") {
        const { value, hasValue } = resolver.reuseValue(source, edge);
        if (hasValue) {
          collector.add(currentId, edge.targetHandle, value);
          continue;
        }
        // Constant with an undefined live value → fall through to run.
      }

      if (decision === "block" && resolver.classify(source) === "generative") {
        if (!blockedSeen.has(source)) {
          blockedSeen.add(source);
          blocked.push({
            nodeId: source,
            title: resolver.nodeTitle(source)
          });
        }
        continue;
      }

      // "run", a Computed that resolves to "block" (recurse to find the blocking
      // generative), or a Constant with no value → include and recurse.
      if (!included.has(source)) {
        included.add(source);
        stack.push(source);
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
    nodes: [...subgraphNodes, ...replayNodesById.values()],
    edges: [...subgraphEdges, ...replayEdges],
    nodeIds: included,
    blocked
  };
};
