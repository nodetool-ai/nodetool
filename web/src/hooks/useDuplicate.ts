import { useCallback } from "react";
import { useNodeStore } from "../stores/NodeStore";
import { v4 as uuidv4 } from "uuid";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { DUPLICATE_SPACING } from "../config/constants";

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
    const offsetX = vertical ? 0 : nodeBounds.width + DUPLICATE_SPACING;
    const offsetY = vertical ? nodeBounds.height + DUPLICATE_SPACING : 0;
    const oldToNewIds = new Map<string, string>();
    selectedNodes.forEach((node) => {
      oldToNewIds.set(node.id, uuidv4());
    });

    const newNodes: Node<NodeData>[] = [];
    for (const node of selectedNodes) {
      const newId = oldToNewIds.get(node.id)!;

      // Determine if the parent node is also being duplicated
      const parentId = node.parentId;
      const isParentDuplicated = parentId ? oldToNewIds.has(parentId) : false;

      const newParentId = parentId
        ? isParentDuplicated
          ? oldToNewIds.get(parentId)!
          : parentId
        : undefined;

      // Apply offset only if the parent is not duplicated
      const positionOffsetX = isParentDuplicated ? 0 : offsetX;
      const positionOffsetY = isParentDuplicated ? 0 : offsetY;

      const newNode: Node<NodeData> = {
        ...node,
        id: newId,
        parentId: newParentId,
        position: {
          x: node.position.x + positionOffsetX,
          y: node.position.y + positionOffsetY
        },
        data: {
          ...node.data,
          positionAbsolute: node.data.positionAbsolute
            ? {
                x: node.data.positionAbsolute.x + positionOffsetX,
                y: node.data.positionAbsolute.y + positionOffsetY
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
