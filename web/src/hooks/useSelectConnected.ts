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
 * Custom hook for selecting connected nodes in the workflow graph.
 * 
 * Traverses the workflow graph from selected nodes to find connected
 * upstream (inputs) and/or downstream (outputs) nodes. Useful for
 * selecting entire subgraphs connected to a starting point.
 * 
 * @param options - Configuration options including traversal direction
 * @returns Object containing selection functions and connected node count
 * 
 * @example
 * ```typescript
 * const { selectConnected, getConnectedNodeIds, connectedNodeCount } = useSelectConnected({
 *   direction: "downstream"
 * });
 * 
 * // Select all nodes downstream from currently selected nodes
 * selectConnected();
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
    selectConnected,
    getConnectedNodeIds,
    connectedNodeCount
  };
};

export default useSelectConnected;
