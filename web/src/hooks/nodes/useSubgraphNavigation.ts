/**
 * Hook for synchronizing subgraph navigation with displayed nodes/edges.
 *
 * This hook bridges SubgraphStore (navigation state) with NodeStore (displayed graph).
 * When navigating into/out of subgraphs, it:
 * - Caches current graph before navigating
 * - Loads target graph's nodes/edges into NodeStore
 * - Restores parent graph when exiting
 */

import { useEffect, useRef, useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useSubgraphStore, ROOT_GRAPH_ID } from "../../stores/SubgraphStore";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { Workflow } from "../../stores/ApiTypes";

/**
 * Hook that subscribes to SubgraphStore navigation changes and updates NodeStore accordingly.
 * Must be used within a component that has access to NodeContext.
 */
export function useSubgraphNavigation() {
  const { nodes, edges, workflow, setNodes, setEdges } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow,
    setNodes: state.setNodes,
    setEdges: state.setEdges
  }));

  const currentGraphId = useSubgraphStore((state) => state.currentGraphId);
  const getDefinition = useSubgraphStore((state) => state.getDefinition);
  const saveGraph = useSubgraphStore((state) => state.saveGraph);
  const getGraph = useSubgraphStore((state) => state.getGraph);

  // Track the previous graphId to detect navigation
  const prevGraphIdRef = useRef<string>(currentGraphId);

  // Track if we're in the middle of a navigation to prevent loops
  const isNavigatingRef = useRef(false);

  // Convert subgraph definition nodes/edges to ReactFlow format
  const loadSubgraphNodes = useCallback(
    (
      subgraphId: string,
      workflowData: Workflow
    ): { nodes: Node<NodeData>[]; edges: Edge[] } | null => {
      const definition = getDefinition(subgraphId);

      if (!definition) {
        console.error(
          `[useSubgraphNavigation] Definition not found: ${subgraphId}`
        );
        return null;
      }

      console.log(
        `[useSubgraphNavigation] Loading subgraph: ${definition.name}, nodes: ${definition.nodes.length}`
      );

      // Convert GraphNode[] to Node<NodeData>[]
      const reactFlowNodes = definition.nodes.map((graphNode) =>
        graphNodeToReactFlowNode(workflowData, graphNode)
      );

      // Convert GraphEdge[] to Edge[]
      const reactFlowEdges = definition.edges.map((graphEdge) =>
        graphEdgeToReactFlowEdge(graphEdge)
      );

      return { nodes: reactFlowNodes, edges: reactFlowEdges };
    },
    [getDefinition]
  );

  // Handle navigation changes
  useEffect(() => {
    const prevGraphId = prevGraphIdRef.current;

    console.log(
      `[useSubgraphNavigation] Effect triggered: prev=${prevGraphId}, current=${currentGraphId}, isNavigating=${isNavigatingRef.current}`
    );

    // Skip if no change or if we're already navigating
    if (currentGraphId === prevGraphId) {
      console.log(
        `[useSubgraphNavigation] Skipping: currentGraphId === prevGraphId`
      );
      return;
    }

    if (isNavigatingRef.current) {
      console.log(`[useSubgraphNavigation] Skipping: already navigating`);
      return;
    }

    isNavigatingRef.current = true;
    console.log(
      `[useSubgraphNavigation] Navigation: ${prevGraphId} -> ${currentGraphId}, nodes in current graph: ${nodes.length}`
    );

    try {
      // Save current graph before switching
      // We need to get the subgraphId for the current graph (if not root)
      let currentSubgraphId: string | undefined;
      if (prevGraphId !== ROOT_GRAPH_ID) {
        // Find the node data for the instance to get its subgraphId
        const instanceNode = nodes.find((n) => n.id === prevGraphId);
        currentSubgraphId = instanceNode?.data?.subgraphId;
      }

      // Save current nodes/edges to cache
      saveGraph(prevGraphId, nodes, edges, currentSubgraphId);

      if (currentGraphId === ROOT_GRAPH_ID) {
        // Navigating back to root
        const cached = getGraph(ROOT_GRAPH_ID);
        if (cached) {
          console.log(
            `[useSubgraphNavigation] Restoring root graph: ${cached.nodes.length} nodes`
          );
          setNodes(cached.nodes);
          setEdges(cached.edges);
        } else {
          console.warn("[useSubgraphNavigation] No cached root graph found");
        }
      } else {
        // Navigating into a subgraph
        // The currentGraphId is the instance node ID
        // We need to find the subgraphId from the node data

        // First, try to get from the current nodes (the parent's nodes)
        const instanceNode = nodes.find((n) => n.id === currentGraphId);
        console.log(
          `[useSubgraphNavigation] Looking for instance node: ${currentGraphId}, found: ${!!instanceNode}`
        );

        const subgraphId = instanceNode?.data?.subgraphId;
        console.log(
          `[useSubgraphNavigation] subgraphId from instance: ${subgraphId}`
        );

        if (!subgraphId) {
          // Check the graph cache for the parent to find the node
          const parentGraphId = prevGraphId;
          const parentGraph = getGraph(parentGraphId);
          console.log(
            `[useSubgraphNavigation] Checking graph cache for parent: ${parentGraphId}, found: ${!!parentGraph}`
          );

          const parentInstanceNode = parentGraph?.nodes.find(
            (n) => n.id === currentGraphId
          );
          console.log(
            `[useSubgraphNavigation] Instance in parent cache: ${!!parentInstanceNode}, subgraphId: ${
              parentInstanceNode?.data?.subgraphId
            }`
          );

          if (parentInstanceNode?.data?.subgraphId) {
            const loadedGraph = loadSubgraphNodes(
              parentInstanceNode.data.subgraphId,
              workflow as Workflow
            );
            if (loadedGraph) {
              console.log(
                `[useSubgraphNavigation] Loaded ${loadedGraph.nodes.length} nodes, ${loadedGraph.edges.length} edges`
              );
              setNodes(loadedGraph.nodes);
              setEdges(loadedGraph.edges);
            }
          } else {
            console.error(
              `[useSubgraphNavigation] Cannot find subgraphId for instance: ${currentGraphId}`
            );
          }
        } else {
          const loadedGraph = loadSubgraphNodes(
            subgraphId,
            workflow as Workflow
          );
          if (loadedGraph) {
            console.log(
              `[useSubgraphNavigation] Loaded ${loadedGraph.nodes.length} nodes, ${loadedGraph.edges.length} edges`
            );
            setNodes(loadedGraph.nodes);
            setEdges(loadedGraph.edges);
          }
        }
      }
    } finally {
      prevGraphIdRef.current = currentGraphId;
      isNavigatingRef.current = false;
    }
  }, [
    currentGraphId,
    nodes,
    edges,
    workflow,
    setNodes,
    setEdges,
    saveGraph,
    getGraph,
    loadSubgraphNodes
  ]);

  return {
    currentGraphId,
    isAtRoot: currentGraphId === ROOT_GRAPH_ID
  };
}
