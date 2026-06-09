/**
 * buildDownstreamRunGraph
 *
 * Shared construction of the "run from here" downstream subgraph used by both
 * the instant-update auto-run (`useNodeAutoRun`) and the live in-browser slider
 * preview (`useLiveSliderWriter`).
 *
 * Starting from a node, it collects the downstream subgraph, then injects each
 * external upstream dependency's cached result as a property override so every
 * node in the subgraph can run without re-executing its (unchanged) upstream.
 */
import { Node, Edge } from "@xyflow/react";
import { subgraph } from "../../core/graph";
import { getNodeGenerations } from "../../stores/nodeGenerationAccessor";
import { getCurrentGeneration } from "../../utils/nodeGenerations";
import { NodeData } from "../../stores/NodeData";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";

/**
 * Finds all edges that cross the boundary into a subgraph (from outside to
 * inside). These represent dependencies that need cached values injected.
 */
export const findExternalInputEdges = (
  allEdges: Edge[],
  subgraphNodeIds: Set<string>
): Edge[] =>
  allEdges.filter(
    (edge) =>
      subgraphNodeIds.has(edge.target) && !subgraphNodeIds.has(edge.source)
  );

/**
 * Collects cached results from upstream nodes and builds property overrides
 * for all nodes in the subgraph that have external dependencies.
 */
export const collectCachedValuesForSubgraph = (
  externalEdges: Edge[],
  workflowId: string,
  getResult: (workflowId: string, nodeId: string) => unknown,
  findNode: (nodeId: string) => Node<NodeData> | undefined
): Map<string, Record<string, unknown>> => {
  const nodePropertyOverrides = new Map<string, Record<string, unknown>>();

  for (const edge of externalEdges) {
    const targetNodeId = edge.target;
    const targetHandle = edge.targetHandle;

    if (!targetHandle) {
      continue;
    }

    const { value, hasValue } = resolveExternalEdgeValue(
      edge,
      workflowId,
      getResult,
      findNode
    );

    if (!hasValue) {
      continue;
    }

    const existing = nodePropertyOverrides.get(targetNodeId) || {};
    existing[targetHandle] = value;
    nodePropertyOverrides.set(targetNodeId, existing);
  }

  return nodePropertyOverrides;
};

/** Applies property overrides to nodes in the subgraph. */
export const applyPropertyOverrides = (
  subgraphNodes: Node<NodeData>[],
  propertyOverrides: Map<string, Record<string, unknown>>
): Node<NodeData>[] =>
  subgraphNodes.map((node) => {
    const overrides = propertyOverrides.get(node.id);
    if (overrides && Object.keys(overrides).length > 0) {
      const dynamicProps = node.data?.dynamic_properties || {};
      const staticProps = node.data?.properties || {};
      const updatedDynamicProps = { ...dynamicProps };
      const updatedStaticProps = { ...staticProps };

      for (const [key, value] of Object.entries(overrides)) {
        if (Object.prototype.hasOwnProperty.call(dynamicProps, key)) {
          updatedDynamicProps[key] = value;
        } else {
          updatedStaticProps[key] = value;
        }
      }

      return {
        ...node,
        data: {
          ...node.data,
          properties: { ...updatedStaticProps },
          dynamic_properties: { ...updatedDynamicProps }
        }
      };
    }
    return node;
  });

/**
 * Restrict a downstream run-graph to the maximal *browser-runnable prefix*:
 * the browser-capable nodes reachable from the root without passing through a
 * node that can't run in the browser. So `[browser] → [browser] → [server]`
 * yields the first two — the browser previews still update live while the
 * server tail is left to the authoritative run.
 *
 * A node is included iff it is browser-capable AND every one of its
 * predecessors *within this graph* is also included; predecessors outside the
 * graph are cached inputs (already injected as overrides), so they don't block
 * inclusion. Computed as a fixpoint — cheap for the small graphs involved.
 */
export const browserRunnablePrefix = (
  graph: { nodes: Node<NodeData>[]; edges: Edge[] },
  isBrowserNode: (type: string | undefined) => boolean
): { nodes: Node<NodeData>[]; edges: Edge[] } => {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const predecessors = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    predecessors.set(n.id, new Set());
  }
  for (const e of graph.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      predecessors.get(e.target)!.add(e.source);
    }
  }

  const included = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of graph.nodes) {
      if (included.has(n.id) || !isBrowserNode(n.type)) {
        continue;
      }
      const preds = predecessors.get(n.id)!;
      let allIncluded = true;
      for (const pid of preds) {
        if (!included.has(pid)) {
          allIncluded = false;
          break;
        }
      }
      if (allIncluded) {
        included.add(n.id);
        changed = true;
      }
    }
  }

  return {
    nodes: graph.nodes.filter((n) => included.has(n.id)),
    edges: graph.edges.filter(
      (e) => included.has(e.source) && included.has(e.target)
    )
  };
};

export interface DownstreamRunGraph {
  /** Downstream nodes with external upstream results injected as overrides. */
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** Number of subgraph nodes that received at least one injected value. */
  nodesWithOverrides: number;
  /** Total injected property values across all nodes. */
  totalPropertiesInjected: number;
}

export interface BuildDownstreamRunGraphParams {
  nodeId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  findNode: (id: string) => Node<NodeData> | undefined;
}

/**
 * Build the downstream subgraph starting at `nodeId`, with each external
 * upstream dependency's currently-selected generation injected as a cached
 * property override. Returns `null` when the start node can't be found.
 */
export const buildDownstreamRunGraph = ({
  nodeId,
  nodes,
  edges,
  workflowId,
  findNode
}: BuildDownstreamRunGraphParams): DownstreamRunGraph | null => {
  const node = findNode(nodeId);
  if (!node) {
    return null;
  }

  const downstream = subgraph(edges, nodes, node as Node<NodeData>);
  const subgraphNodeIds = new Set(downstream.nodes.map((n) => n.id));

  const externalInputEdges = findExternalInputEdges(edges, subgraphNodeIds);

  // Seed inputs from each upstream's selected generation (durable assets
  // merged with the live buffer); resolveExternalEdgeValue unwraps the
  // returned outputs record by source handle.
  const getResultFromGeneration = (wf: string, src: string): unknown => {
    const current = getCurrentGeneration(
      getNodeGenerations(wf, src),
      findNode(src)?.data?.selected_generation
    );
    return current?.outputs;
  };

  const propertyOverrides = collectCachedValuesForSubgraph(
    externalInputEdges,
    workflowId,
    getResultFromGeneration,
    findNode
  );

  const nodesWithCachedValues = applyPropertyOverrides(
    downstream.nodes,
    propertyOverrides
  );

  const totalPropertiesInjected = Array.from(
    propertyOverrides.values()
  ).reduce((sum, props) => sum + Object.keys(props).length, 0);

  return {
    nodes: nodesWithCachedValues,
    edges: downstream.edges,
    nodesWithOverrides: propertyOverrides.size,
    totalPropertiesInjected
  };
};
