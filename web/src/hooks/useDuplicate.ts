import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { DUPLICATE_SPACING } from "../config/constants";
import { useNodes } from "../contexts/NodeContext";

/**
 * Custom hook for duplicating selected nodes and their connected edges in the workflow editor.
 *
 * Generates new unique IDs for duplicated nodes and adjusts their positions.
 * Handles parent-child relationships and preserves edge connections between duplicated nodes.
 * By default, preserves upstream connections (edges from non-selected nodes into selected nodes).
 *
 * @param vertical - If true, duplicates nodes vertically (below original).
 *                   If false, duplicates horizontally (to the right of original).
 * @param keepUpstreamConnections - If true (default), preserves incoming edges from non-selected nodes.
 *                                   If false, only duplicates edges between selected nodes.
 * @returns Callback function to duplicate selected nodes
 *
 * @example
 * ```typescript
 * // Duplicate horizontally with upstream connections preserved (default)
 * const duplicateNodes = useDuplicateNodes();
 * duplicateNodes();
 *
 * // Duplicate vertically with upstream connections preserved
 * const duplicateNodesVertical = useDuplicateNodes(true);
 * duplicateNodesVertical();
 *
 * // Duplicate without upstream connections
 * const duplicateNodesIsolated = useDuplicateNodes(false, false);
 * duplicateNodesIsolated();
 * ```
 */
export const useDuplicateNodes = (
  vertical: boolean = false,
  keepUpstreamConnections: boolean = true
) => {
  const reactFlow = useReactFlow();
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    generateNodeIds,
    getSelectedNodes
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    setNodes: state.setNodes,
    setEdges: state.setEdges,
    getSelectedNodes: state.getSelectedNodes,
    generateNodeIds: state.generateNodeIds
  }));
  return useCallback(() => {
    const getNodesBounds = reactFlow.getNodesBounds;
    const selectedNodes = getSelectedNodes();

    if (selectedNodes.length === 0) {
      return;
    }

    const nodeBounds = getNodesBounds(selectedNodes);
    const offsetX = vertical ? 0 : nodeBounds.width + DUPLICATE_SPACING;
    const offsetY = vertical ? nodeBounds.height + DUPLICATE_SPACING : 0;

    // Generate new sequential IDs for all selected nodes
    const newIds = generateNodeIds(selectedNodes.length);
    const oldToNewIds = new Map<string, string>();
    selectedNodes.forEach((node, index) => {
      oldToNewIds.set(node.id, newIds[index]);
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
      const sourceInSelection = selectedNodeIds.includes(edge.source);
      const targetInSelection = selectedNodeIds.includes(edge.target);

      // Duplicate edges where both nodes are in selected nodes (internal edges)
      if (sourceInSelection && targetInSelection) {
        const newSource = oldToNewIds.get(edge.source)!;
        const newTarget = oldToNewIds.get(edge.target)!;
        newEdges.push({
          ...edge,
          id: uuidv4(),
          source: newSource,
          target: newTarget,
          selected: false
        });
      }
      // Preserve upstream connections: edges from non-selected sources to selected targets
      else if (
        keepUpstreamConnections &&
        !sourceInSelection &&
        targetInSelection
      ) {
        const newTarget = oldToNewIds.get(edge.target)!;
        newEdges.push({
          ...edge,
          id: uuidv4(),
          source: edge.source, // Keep original source (upstream node)
          target: newTarget, // Connect to duplicated target
          selected: false
        });
      }
    }

    // Deselect old nodes and select new duplicated nodes
    const updatedNodes = nodes.map((node) => ({
      ...node,
      selected: false
    }));

    // Deselect old edges
    const updatedEdges = edges.map((edge) => ({
      ...edge,
      selected: false
    }));

    setNodes([...updatedNodes, ...newNodes]);
    setEdges([...updatedEdges, ...newEdges]);
  }, [
    vertical,
    keepUpstreamConnections,
    generateNodeIds,
    getSelectedNodes,
    reactFlow.getNodesBounds,
    setNodes,
    setEdges,
    edges,
    nodes
  ]);
};
