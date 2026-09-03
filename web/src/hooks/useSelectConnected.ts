import { useCallback } from "react";
import type { Edge } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";

type Direction = "upstream" | "downstream" | "both";

interface UseSelectConnectedOptions {
  direction?: Direction;
}

interface SelectConnectedResult {
  selectConnected: () => void;
  getConnectedNodeIds: () => string[];
}

/**
 * Traverses the workflow graph from selected nodes to find connected upstream
 * and/or downstream nodes, for selecting entire connected subgraphs.
 */
export const useSelectConnected = (
  options: UseSelectConnectedOptions = {}
): SelectConnectedResult => {
  const { direction = "both" } = options;
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  const nodeStore = useNodeStoreRef();

  const getConnectedNodeIds = useCallback((): string[] => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return [];
    }

    // Indexed here rather than in a `useMemo` on the edge list: the editor
    // shortcuts hold three of these hooks, and the traversal only runs on a
    // shortcut or a menu click. Walking with `edges.filter` per visited node
    // would make it O(V*E).
    const incomingByTarget = new Map<string, Edge[]>();
    const outgoingBySource = new Map<string, Edge[]>();
    for (const edge of nodeStore.getState().edges) {
      const into = incomingByTarget.get(edge.target);
      if (into) {
        into.push(edge);
      } else {
        incomingByTarget.set(edge.target, [edge]);
      }
      const out = outgoingBySource.get(edge.source);
      if (out) {
        out.push(edge);
      } else {
        outgoingBySource.set(edge.source, [edge]);
      }
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
  }, [nodeStore, getSelectedNodes, direction]);

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
    getConnectedNodeIds
  };
};

export default useSelectConnected;
