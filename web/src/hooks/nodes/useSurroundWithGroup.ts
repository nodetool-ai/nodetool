import { useCallback, useMemo } from "react";
import { GROUP_NODE_METADATA } from "../../utils/nodeUtils";
import { useNodes, useTemporalNodes } from "../../contexts/NodeContext";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";

/**
 * Custom hook for grouping selected nodes within a parent group node.
 * 
 * Creates a new group node that encloses all specified nodes, converting them
 * to child nodes of the group. The group node is automatically sized to fit
 * all contained nodes with appropriate padding.
 * 
 * The hook handles:
 * - Calculating the bounding box of selected nodes
 * - Creating a new group node with proper metadata
 * - Updating parent-child relationships for all nodes
 * - Pausing and resuming temporal state for undo/redo support
 * 
 * @returns Callback function to group selected nodes
 * 
 * @example
 * ```typescript
 * const surroundWithGroup = useSurroundWithGroup();
 * 
 * // Group selected nodes
 * surroundWithGroup({ selectedNodes });
 * ```
 */
export const useSurroundWithGroup = () => {
  const theme = useTheme();
  const { createNode, setNodes } = useNodes((state) => ({
    createNode: state.createNode,
    setNodes: state.setNodes
  }));
  const { pause, resume } = useTemporalNodes((state) => ({
    pause: state.pause,
    resume: state.resume
  }));

  const getBounds = useMemo(() => {
    return (nodes: Node<NodeData>[]) => {
      const validNodes = nodes.filter((n): n is Node<NodeData> => !!n);
      if (validNodes.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      return validNodes.reduce(
        (bounds, node) => {
          return {
            x: Math.min(bounds.x, node.position.x),
            y: Math.min(bounds.y, node.position.y),
            width: Math.max(
              bounds.width,
              node.position.x + (node.measured?.width || 0) + 40
            ),
            height: Math.max(
              bounds.height,
              node.position.y + (node.measured?.height || 0) + 50
            )
          };
        },
        { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity }
      );
    };
  }, []);

  const surroundWithGroup = useCallback(
    ({ selectedNodes }: { selectedNodes: Node<NodeData>[] }) => {
      if (!selectedNodes) { return; }
      
      const validSelectedNodes = selectedNodes.filter(
        (n): n is Node<NodeData> => !!n
      );
      if (validSelectedNodes.length === 0) { return; }

      pause();

      try {
        const groupMetadata = GROUP_NODE_METADATA;
        const bounds = getBounds(validSelectedNodes);
        const selectedNodeIds = new Set(validSelectedNodes.map((n) => n.id));

        const groupNode = createNode(groupMetadata, {
          x: bounds.x - 20,
          y: bounds.y - 50
        });

        if (!groupNode.data.properties) {
          groupNode.data.properties = {};
        }

        if (!groupNode.data.title) {
          groupNode.data.title = "Group";
        }

        groupNode.data.properties.group_color = theme.vars.palette.c_bg_group;
        if (!groupNode.data.properties.headline) {
          groupNode.data.properties.headline = "Group";
        }
        groupNode.width = Math.max(bounds.width - bounds.x + 40, 200);
        groupNode.height = Math.max(bounds.height - bounds.y + 40, 200);
        groupNode.style = {
          width: groupNode.width,
          height: groupNode.height
        };

        setNodes((prevNodes) => {
          const updatedChildNodes = prevNodes.map((node) => {
            if (selectedNodeIds.has(node.id)) {
              return {
                ...node,
                parentId: groupNode.id,
                expandParent: true,
                position: {
                  x: node.position.x - bounds.x + 20,
                  y: node.position.y - bounds.y + 50
                }
              };
            }
            return node;
          });

          return [groupNode, ...updatedChildNodes];
        });
      } finally {
        resume();
      }
    },
    [getBounds, createNode, setNodes, pause, resume, theme.vars.palette]
  );

  return surroundWithGroup;
};
