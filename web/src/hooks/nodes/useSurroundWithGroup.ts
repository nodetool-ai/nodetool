import { useCallback } from "react";
import { Node, XYPosition } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { GROUP_NODE_METADATA } from "../../utils/nodeUtils";
import { NodeData } from "../../stores/NodeData";
import { GROUP_NODE_TYPE } from "../../constants/nodeTypes";
import { absoluteNodePosition } from "../../utils/absoluteNodePosition";

type SurroundWithGroupOptions = {
  selectedNodes: Node<NodeData>[];
};

type PlacedNode = { node: Node<NodeData>; position: XYPosition };

const getBounds = (placed: PlacedNode[]) =>
  placed.reduce(
    (bounds, { node, position }) => ({
      x: Math.min(bounds.x, position.x),
      y: Math.min(bounds.y, position.y),
      width: Math.max(
        bounds.width,
        position.x + (node.measured?.width || 0) + 40
      ),
      height: Math.max(
        bounds.height,
        position.y + (node.measured?.height || 0) + 50
      )
    }),
    { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity }
  );

/**
 * Wrap the selected nodes in a group node, computing group bounds from their
 * canvas positions and reparenting each child relative to the group. Group
 * nodes are left out, since a group cannot sit inside a group. The change is
 * a single store write, so it records one undo step.
 */
export const useSurroundWithGroup = (): ((options: SurroundWithGroupOptions) => void) => {
  const theme = useTheme();
  const { createNode, setNodes } = useNodes((state) => ({
    createNode: state.createNode,
    setNodes: state.setNodes
  }), shallow);
  const nodeStore = useNodeStoreRef();

  const surroundWithGroup = useCallback(
    ({ selectedNodes }: SurroundWithGroupOptions) => {
      if (!selectedNodes) { return; }
      
      const nodeById = new Map(
        nodeStore.getState().nodes.map((n) => [n.id, n] as const)
      );
      const placed: PlacedNode[] = selectedNodes
        .filter((n): n is Node<NodeData> => !!n && n.type !== GROUP_NODE_TYPE)
        .map((n) => nodeById.get(n.id) ?? n)
        .map((node) => ({ node, position: absoluteNodePosition(node, nodeById) }));
      if (placed.length === 0) { return; }

      const bounds = getBounds(placed);
      const childPositions = new Map(
        placed.map(({ node, position }) => [node.id, position] as const)
      );

      const groupNode = createNode(GROUP_NODE_METADATA, {
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
          const position = childPositions.get(node.id);
          if (!position) {
            return node;
          }
          return {
            ...node,
            parentId: groupNode.id,
            expandParent: true,
            position: {
              x: position.x - bounds.x + 20,
              y: position.y - bounds.y + 50
            }
          };
        });

        return [groupNode, ...updatedChildNodes];
      });
    },
    [createNode, setNodes, nodeStore, theme.vars.palette]
  );

  return surroundWithGroup;
};
