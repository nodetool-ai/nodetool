import { useCallback, useMemo } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import ThemeNodes from "../../components/themes/ThemeNodes";
import { useNodes, useTemporalNodes } from "../../contexts/NodeContext";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";
const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

export const useSurroundWithGroup = () => {
  const { addNode, createNode, updateNode, findNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode,
    updateNode: state.updateNode,
    findNode: state.findNode
  }));
  const getMetadata = useMetadataStore.getState().getMetadata;
  const { pause, resume } = useTemporalNodes((state) => ({
    pause: state.pause,
    resume: state.resume
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const getBounds = useMemo(() => {
    return (nodes: Node<NodeData>[]) => {
      return nodes.reduce(
        (bounds, node) => {
          if (!node) return bounds;
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
      pause();
      const groupMetadata = getMetadata(GROUP_NODE_TYPE) as NodeMetadata;
      const bounds = getBounds(selectedNodes);

      const groupNode = createNode(groupMetadata, {
        x: bounds.x - 20,
        y: bounds.y - 50
      });
      groupNode.data.properties.group_color = ThemeNodes.palette.c_bg_group;
      groupNode.width = Math.max(bounds.width - bounds.x + 40, 200);
      groupNode.height = Math.max(bounds.height - bounds.y + 40, 200);
      groupNode.style = {
        width: Math.max(bounds.width - bounds.x + 40, 200),
        height: Math.max(bounds.height - bounds.y + 40, 200)
      };

      addNode(groupNode);

      selectedNodes.forEach((node) => {
        if (node) {
          updateNode(node.id, {
            parentId: groupNode.id,
            expandParent: true,
            position: {
              x: node.position.x - bounds.x + 20,
              y: node.position.y - bounds.y + 50
            }
          });
        }
      });
      resume();
    },
    [getMetadata, getBounds, createNode, addNode, updateNode, pause, resume]
  );

  return surroundWithGroup;
};
