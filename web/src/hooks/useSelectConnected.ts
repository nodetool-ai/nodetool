import { useCallback, useMemo } from "react";
import { useNodes } from "../contexts/NodeContext";

/**
 * Hook to select all nodes connected to the currently selected nodes.
 * 
 * Traverses the workflow graph to find nodes connected (upstream/downstream)
 * to the currently selected nodes. Supports selecting upstream dependencies,
 * downstream consumers, or both directions.
 * 
 * @param options - Configuration options
 * @param options.direction - Which direction to traverse: "upstream", "downstream", or "both" (default)
 * @returns Object containing:
 *   - selectConnected: Function to select all connected nodes
 *   - getConnectedNodeIds: Function to get IDs of connected nodes
 *   - connectedNodeCount: Number of connected nodes
 * 
 * @example
 * ```typescript
 * const { selectConnected, connectedNodeCount } = useSelectConnected({
 *   direction: "upstream"  // Only select dependencies
 * });
 * 
 * // Select all connected nodes
 * selectConnected();
 * 
 * // Check how many nodes would be selected
 * console.log(`${connectedNodeCount} nodes will be selected`);
 * ```
 */

type Direction = "upstream" | "downstream" | "both";

interface UseSelectConnectedOptions {
  direction?: Direction;
}

interface SelectConnectedResult {
  selectConnected: () => void;
  getConnectedNodeIds: () => string[];
  connectedNodeCount: number;
}

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
