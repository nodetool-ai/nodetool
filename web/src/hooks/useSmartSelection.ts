import { useCallback } from "react";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";

export const useSmartSelection = () => {
  const { nodes, edges, setSelectedNodes, getSelectedNodes } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    setSelectedNodes: state.setSelectedNodes,
    getSelectedNodes: state.getSelectedNodes
  }));

  const selectConnected = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const connectedNodeIds = new Set(selectedNodeIds);

    const findConnectedNodes = (nodeIds: Set<string>): Set<string> => {
      let currentSize = 0;
      let iterations = 0;
      const maxIterations = 1000;

      do {
        currentSize = connectedNodeIds.size;
        for (const nodeId of nodeIds) {
          const inputEdges = edges.filter((e) => e.target === nodeId);
          const outputEdges = edges.filter((e) => e.source === nodeId);

          for (const edge of inputEdges) {
            connectedNodeIds.add(edge.source);
          }
          for (const edge of outputEdges) {
            connectedNodeIds.add(edge.target);
          }
        }
        iterations++;
      } while (
        connectedNodeIds.size > currentSize &&
        iterations < maxIterations
      );

      return connectedNodeIds;
    };

    const allConnectedIds = findConnectedNodes(selectedNodeIds);

    const nodesToSelect = nodes.filter((node) => allConnectedIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [nodes, edges, setSelectedNodes, getSelectedNodes]);

  const selectSameType = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const referenceNode = selectedNodes[0];
    const referenceType = referenceNode.type;
    const originalType = referenceNode.data?.originalType;

    const nodesToSelect = nodes.filter((node) => {
      const nodeType = node.type;
      const nodeOriginalType = node.data?.originalType;
      return (
        nodeType === referenceType ||
        nodeOriginalType === referenceType ||
        (originalType && nodeOriginalType === originalType) ||
        (originalType && nodeType === originalType)
      );
    });
    setSelectedNodes(nodesToSelect);
  }, [nodes, setSelectedNodes, getSelectedNodes]);

  const selectParents = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const parentIds = new Set<string>();
    for (const node of selectedNodes) {
      if (node.parentId) {
        parentIds.add(node.parentId);
      }
    }

    if (parentIds.size === 0) {
      return;
    }

    const nodesToSelect = nodes.filter((node) => parentIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [nodes, setSelectedNodes, getSelectedNodes]);

  const selectChildren = useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const childIds = new Set<string>();

    for (const node of nodes) {
      if (selectedNodeIds.has(node.parentId || "")) {
        childIds.add(node.id);
      }
    }

    if (childIds.size === 0) {
      return;
    }

    const nodesToSelect = nodes.filter((node) => childIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [nodes, setSelectedNodes, getSelectedNodes]);

  const selectInverse = useCallback(() => {
    const selectedNodeIds = new Set(getSelectedNodes().map((n) => n.id));
    const nodesToSelect = nodes.filter((node) => !selectedNodeIds.has(node.id));
    setSelectedNodes(nodesToSelect);
  }, [nodes, setSelectedNodes, getSelectedNodes]);

  return {
    selectConnected,
    selectSameType,
    selectParents,
    selectChildren,
    selectInverse
  };
};

export default useSmartSelection;
