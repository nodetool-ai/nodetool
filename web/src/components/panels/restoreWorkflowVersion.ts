import { flushSync } from "react-dom";
import { migrateGraphNodeTypes, pruneGraphLinks } from "@nodetool-ai/protocol";
import type { Graph } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeStore } from "../../stores/NodeStore";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { sanitizeGraph } from "../../core/workflow/graphMapping";

/**
 * Replaces an open workflow's canvas (nodes, edges and lineage links) with
 * `graph`, through the same steps a load takes: node type migration,
 * sanitizing, and recording node types the registry lacks.
 */
export function replaceCanvasGraph(store: NodeStore, graph: Graph): void {
  const state = store.getState();
  const workflow = state.getWorkflow();
  const migrated = migrateGraphNodeTypes(graph);
  const { metadata, nodeTypes, addUnknownNodeTypes } =
    useMetadataStore.getState();
  const { nodes, edges } = sanitizeGraph(
    migrated.nodes.map((node) => graphNodeToReactFlowNode(workflow, node)),
    migrated.edges.map((edge) => graphEdgeToReactFlowEdge(edge)),
    metadata
  );
  // An empty registry means metadata has not loaded, not that every type is gone.
  if (Object.keys(nodeTypes).length > 0) {
    const missing = nodes
      .map((node) => node.type)
      .filter((type): type is string => !!type && !nodeTypes[type]);
    if (missing.length > 0) {
      addUnknownNodeTypes(missing);
    }
  }

  state.setNodes(nodes);
  state.setEdges(edges);
  state.setLinks(
    pruneGraphLinks(new Set(nodes.map((node) => node.id)), migrated.links ?? [])
  );
}

/**
 * Replaces an open workflow's canvas with a restored version's graph, through
 * the same steps a load takes: node type migration, sanitizing, and recording
 * node types the registry lacks.
 *
 * The workflow's subgraph tabs close first. Each holds a copy of a node's
 * pre-restore graph and writes it back on its next edit. `flushSync` unmounts
 * them now, so their final write-back lands before the restored graph replaces
 * it, not after. Returns the closed tab keys, whose stores the caller drops.
 */
export function restoreWorkflowVersion(
  store: NodeStore,
  workflowId: string,
  graph: Graph
): string[] {
  const subgraphTabs = useSubgraphTabsStore.getState();
  const openKeys = new Set(subgraphTabs.tabs.map((tab) => tab.key));
  flushSync(() => subgraphTabs.closeForWorkflow(workflowId));
  const remaining = new Set(
    useSubgraphTabsStore.getState().tabs.map((tab) => tab.key)
  );
  const closedKeys = [...openKeys].filter((key) => !remaining.has(key));

  replaceCanvasGraph(store, graph);
  return closedKeys;
}
