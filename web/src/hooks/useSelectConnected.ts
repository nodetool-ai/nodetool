import { useCallback, useMemo } from "react";
import type { Edge } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";

type Direction = "upstream" | "downstream" | "both";

interface UseSelectConnectedOptions {
  direction?: Direction;
}

interface SelectConnectedResult {
  selectConnected: () => void;
  getConnectedNodeIds: () => string[];
  connectedNodeCount: number;
}

/**
 * Traverses the workflow graph from selected nodes to find connected upstream
 * and/or downstream nodes, for selecting entire connected subgraphs.
 */
export const useSelectConnected = (
  options: UseSelectConnectedOptions = {}
): SelectConnectedResult => {
  const { direction = "both" } = options;
  // `edges` stays subscribed because the traversal derives from it. `nodes` is
  // only needed inside `selectConnected`, so it is read lazily instead.
  const edges = useNodes((state) => state.edges);
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  const nodeStore = useNodeStoreRef();

  // Index the edges once per edge-list identity. Walking with `edges.filter`
  // per visited node made each traversal O(V*E), and `connectedNodeCount`
  // re-runs it on every edge change.
  const { incomingByTarget, outgoingBySource } = useMemo(() => {
    const incoming = new Map<string, Edge[]>();
    const outgoing = new Map<string, Edge[]>();
    for (const edge of edges) {
      const into = incoming.get(edge.target);
      if (into) {
        into.push(edge);
      } else {
        incoming.set(edge.target, [edge]);
      }
      const out = outgoing.get(edge.source);
      if (out) {
        out.push(edge);
      } else {
        outgoing.set(edge.source, [edge]);
      }
    }
    return { incomingByTarget: incoming, outgoingBySource: outgoing };
  }, [edges]);

  const getConnectedNodeIds = useCallback((): string[] => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return [];
    }

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedNodeIds = new Set<string>();
    const startIds = selectedNodes.map((n) => n.id);

    // Iterative so a long chain can't blow the stack, and the visited set is
    // shared across the selected nodes: reachability sets merge, so a node
    // already walked from one start contributes nothing new from another.
    const traverse = (
      adjacency: Map<string, Edge[]>,
      nextId: (edge: Edge) => string
    ) => {
      const visited = new Set<string>();
      const stack = [...startIds];
      while (stack.length > 0) {
        const nodeId = stack.pop()!;
        if (visited.has(nodeId)) {
          continue;
        }
        visited.add(nodeId);
        for (const edge of adjacency.get(nodeId) ?? []) {
          const neighbor = nextId(edge);
          if (!selectedNodeIds.has(neighbor)) {
            connectedNodeIds.add(neighbor);
          }
          stack.push(neighbor);
        }
      }
    };

    if (direction === "upstream" || direction === "both") {
      traverse(incomingByTarget, (edge) => edge.source);
    }
    if (direction === "downstream" || direction === "both") {
      traverse(outgoingBySource, (edge) => edge.target);
    }

    return Array.from(connectedNodeIds);
  }, [incomingByTarget, outgoingBySource, getSelectedNodes, direction]);

  const connectedNodeCount = useMemo(() => {
    return getConnectedNodeIds().length;
  }, [getConnectedNodeIds]);

  const selectConnected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const connectedIds = getConnectedNodeIds();
    const allNodeIds = new Set([
      ...selectedNodes.map((n) => n.id),
      ...connectedIds
    ]);

    const nodesToSelect = nodeStore
      .getState()
      .nodes.filter((node) => allNodeIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [getSelectedNodes, getConnectedNodeIds, nodeStore, setSelectedNodes]);

  return {
    selectConnected,
    getConnectedNodeIds,
    connectedNodeCount
  };
};

export default useSelectConnected;
