/**
 * Hook for subgraph operations (convert, unpack)
 */

import { useCallback } from "react";
import { useNodes } from "../../contexts/NodeContext";
import { useSubgraphStore } from "../../stores/SubgraphStore";
import { convertToSubgraph } from "../../core/workflow/subgraph/convert";
import { unpackSubgraph } from "../../core/workflow/subgraph/unpack";
import { useNotificationStore } from "../../stores/NotificationStore";
import { SUBGRAPH_NODE_TYPE } from "../../types/subgraph";

export function useSubgraphOperations() {
  const {
    nodes,
    edges,
    getSelectedNodes,
    setNodes,
    setEdges,
    workflow,
    findNode
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    getSelectedNodes: state.getSelectedNodes,
    setNodes: state.setNodes,
    setEdges: state.setEdges,
    workflow: state.workflow,
    findNode: state.findNode
  }));

  const addDefinition = useSubgraphStore((state) => state.addDefinition);
  const getDefinition = useSubgraphStore((state) => state.getDefinition);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const handleConvertToSubgraph = useCallback(() => {
    const selectedNodes = getSelectedNodes();

    if (selectedNodes.length < 2) {
      addNotification({
        type: "warning",
        alert: true,
        content: "Select at least 2 nodes to create a subgraph"
      });
      return;
    }

    try {
      const result = convertToSubgraph(
        selectedNodes,
        nodes,
        edges,
        workflow.id
      );

      // Add the definition to the store
      addDefinition(result.definition);

      // Update the graph: remove old nodes/edges, add new ones
      const newNodes = nodes
        .filter((n) => !result.removedNodeIds.includes(n.id))
        .concat([result.instanceNode]);

      const newEdges = edges
        .filter((e) => !result.removedEdgeIds.includes(e.id))
        .concat(result.newEdges);

      setNodes(newNodes);
      setEdges(newEdges);

      addNotification({
        type: "success",
        alert: true,
        content: `Created subgraph "${result.definition.name}" with ${result.definition.nodes.length} nodes`
      });
    } catch (error) {
      console.error("Failed to convert to subgraph:", error);
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to create subgraph: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }, [
    getSelectedNodes,
    nodes,
    edges,
    workflow.id,
    addDefinition,
    setNodes,
    setEdges,
    addNotification
  ]);

  const handleUnpackSubgraph = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);

      if (!node || node.type !== SUBGRAPH_NODE_TYPE) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Selected node is not a subgraph"
        });
        return;
      }

      const subgraphId = (node.data as any).subgraphId;
      const definition = getDefinition(subgraphId);

      if (!definition) {
        addNotification({
          type: "error",
          alert: true,
          content: "Subgraph definition not found"
        });
        return;
      }

      try {
        const result = unpackSubgraph(node, definition, edges, workflow.id);

        // Update the graph: remove subgraph node, add unpacked nodes
        const newNodes = nodes
          .filter((n) => n.id !== result.removedNodeId)
          .concat(result.newNodes);

        const newEdges = edges
          .filter((e) => !result.removedEdgeIds.includes(e.id))
          .concat(result.newEdges);

        setNodes(newNodes);
        setEdges(newEdges);

        addNotification({
          type: "success",
          alert: true,
          content: `Unpacked subgraph: ${result.newNodes.length} nodes restored`
        });
      } catch (error) {
        console.error("Failed to unpack subgraph:", error);
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to unpack subgraph: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    },
    [
      findNode,
      getDefinition,
      edges,
      workflow.id,
      nodes,
      setNodes,
      setEdges,
      addNotification
    ]
  );

  return {
    handleConvertToSubgraph,
    handleUnpackSubgraph
  };
}
