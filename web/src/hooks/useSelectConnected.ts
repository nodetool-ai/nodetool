import { useCallback, useMemo } from "react";
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

  const getConnectedNodeIds = useCallback((): string[] => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return [];
    }

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedNodeIds = new Set<string>();

    const traverseUpstream = (nodeId: string, visited: Set<string>) => {
      if (visited.has(nodeId)) {return;}
      visited.add(nodeId);

      const incomingEdges = edges.filter((e) => e.target === nodeId);
      for (const edge of incomingEdges) {
        if (!selectedNodeIds.has(edge.source)) {
          connectedNodeIds.add(edge.source);
        }
        traverseUpstream(edge.source, visited);
      }
    };

    const traverseDownstream = (nodeId: string, visited: Set<string>) => {
      if (visited.has(nodeId)) {return;}
      visited.add(nodeId);

      const outgoingEdges = edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (!selectedNodeIds.has(edge.target)) {
          connectedNodeIds.add(edge.target);
        }
        traverseDownstream(edge.target, visited);
      }
    };

    for (const node of selectedNodes) {
      const visitedUpstream = new Set<string>();
      const visitedDownstream = new Set<string>();

      if (direction === "upstream" || direction === "both") {
        traverseUpstream(node.id, visitedUpstream);
      }
      if (direction === "downstream" || direction === "both") {
        traverseDownstream(node.id, visitedDownstream);
      }
    }

    return Array.from(connectedNodeIds);
  }, [edges, getSelectedNodes, direction]);

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
