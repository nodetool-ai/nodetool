import { useCallback } from "react";
import { useNodeStore } from "../stores/NodeStore";
import { v4 as uuidv4 } from "uuid";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { DUPLICATE_SPACING_X } from "../config/constants";

export const useDuplicateNodes = (vertical: boolean = false) => {
  const nodes = useNodeStore((state) => state.nodes);
  const edges = useNodeStore((state) => state.edges);
  const setNodes = useNodeStore((state) => state.setNodes);
  const setEdges = useNodeStore((state) => state.setEdges);
  const getSelectedNodes = useNodeStore((state) => state.getSelectedNodes);
  const reactFlow = useReactFlow();
  const getNodesBounds = reactFlow.getNodesBounds;
  return useCallback(() => {
    const selectedNodes = getSelectedNodes();

    if (selectedNodes.length === 0) {
      return;
    }

    const nodeBounds = getNodesBounds(selectedNodes);
    const offsetX = vertical ? 0 : nodeBounds.width + DUPLICATE_SPACING_X;
    const offsetY = vertical ? nodeBounds.height + DUPLICATE_SPACING_X : 0;
    const oldToNewIds = new Map<string, string>();
    selectedNodes.forEach((node) => {
      oldToNewIds.set(node.id, uuidv4());
    });

    const newNodes: Node<NodeData>[] = [];
    for (const node of selectedNodes) {
      const newId = oldToNewIds.get(node.id)!;
      let newParentId: string | undefined;

      // Check if parent exists in selected nodes
      if (node.parentId && oldToNewIds.has(node.parentId)) {
        newParentId = oldToNewIds.get(node.parentId);
      } else {
        newParentId = undefined;
      }
      const newNode: Node<NodeData> = {
        ...node,
        id: newId,
        parentId: newParentId,
        position: {
          x: node.position.x + (newParentId ? 0 : offsetX),
          y: node.position.y + (newParentId ? 0 : offsetY)
        },
        data: {
          ...node.data,
          positionAbsolute: node.data.positionAbsolute
            ? {
                x: node.data.positionAbsolute.x + (newParentId ? 0 : offsetX),
                y: node.data.positionAbsolute.y + (newParentId ? 0 : offsetY)
              }
            : undefined
        },
        selected: true
      };

      newNodes.push(newNode);
    }

    // Find edges connected to selected nodes
    const selectedNodeIds = selectedNodes.map((node) => node.id);
    const connectedEdges = edges.filter(
      (edge) =>
        selectedNodeIds.includes(edge.source) ||
        selectedNodeIds.includes(edge.target)
    );

    // Update edges to connect duplicated nodes
    const newEdges: Edge[] = [];
    for (const edge of connectedEdges) {
      const newSource = oldToNewIds.get(edge.source) || edge.source;
      const newTarget = oldToNewIds.get(edge.target) || edge.target;

      // Only duplicate edges where both nodes are in selected nodes
      if (
        selectedNodeIds.includes(edge.source) &&
        selectedNodeIds.includes(edge.target)
      ) {
        newEdges.push({
          ...edge,
          id: uuidv4(),
          source: newSource,
          target: newTarget
        });
      }
    }

    // Deselect old nodes and select new duplicated nodes
    const updatedNodes = nodes.map((node) => ({
      ...node,
      selected: false
    }));

    // Update state with new nodes and edges
    setNodes([...updatedNodes, ...newNodes]);
    setEdges([...edges, ...newEdges]);
  }, [
    getSelectedNodes,
    getNodesBounds,
    vertical,
    edges,
    nodes,
    setNodes,
    setEdges
  ]);
};
