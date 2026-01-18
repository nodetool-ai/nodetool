import { useCallback, useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";

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
 * Hook for selecting nodes connected to the currently selected nodes.
 * 
 * Traverses the graph upstream, downstream, or both directions to find
 * all nodes connected to the currently selected nodes. Useful for
 * batch operations on connected subgraphs.
 * 
 * @param options - Configuration for traversal direction
 * @returns Object containing selection and traversal functions
 * 
 * @example
 * ```typescript
 * const { 
 *   selectConnected,
 *   getConnectedNodeIds,
 *   connectedNodeCount
 * } = useSelectConnected({ direction: "downstream" });
 * 
 * // Select all downstream nodes
 * selectConnected();
 * 
 * // Get count of connected nodes
 * console.log(`Connected: ${connectedNodeCount}`);
 * ```
 */
export const useSelectConnected = (
  options: UseSelectConnectedOptions = {}
): SelectConnectedResult => {
  const { direction = "both" } = options;
  const { nodes, edges, getSelectedNodes, setSelectedNodes } = useNodes(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      getSelectedNodes: state.getSelectedNodes,
      setSelectedNodes: state.setSelectedNodes
    })
  );

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

    const nodesToSelect = nodes.filter((node) => allNodeIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [getSelectedNodes, getConnectedNodeIds, nodes, setSelectedNodes]);

  return {
    /** Select all connected nodes in addition to currently selected nodes */
    selectConnected,
    /** Get an array of node IDs that are connected to selected nodes */
    getConnectedNodeIds,
    /** The count of nodes connected to the selected nodes */
    connectedNodeCount
  };
};

export default useSelectConnected;
