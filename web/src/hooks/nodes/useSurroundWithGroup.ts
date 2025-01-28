import { useCallback, useMemo } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTemporalStore } from "../../stores/NodeStore";
import ThemeNodes from "../../components/themes/ThemeNodes";
const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

export const useSurroundWithGroup = () => {
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const getMetadata = useMetadataStore.getState().getMetadata;
  const updateNode = useNodeStore((state) => state.updateNode);
  const findNode = useNodeStore((state) => state.findNode);
  const history = useTemporalStore((state) => state);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const getBounds = useMemo(() => {
    return (selectedNodeIds: string[]) => {
      const nodes = selectedNodeIds.map((id) => findNode(id)).filter(Boolean);
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
  }, [findNode]);

  const surroundWithGroup = useCallback(
    ({ selectedNodeIds }: { selectedNodeIds: string[] }) => {
      const canAddToGroup = selectedNodeIds.every((id) => {
        const node = findNode(id);
        return node && !node.parentId;
      });
      if (!canAddToGroup) {
        addNotification({
          type: "warning",
          alert: true,
          content: "Nodes already in a group cannot be added."
        });
        return;
      }
      history.pause();
      const groupMetadata = getMetadata(GROUP_NODE_TYPE) as NodeMetadata;
      const bounds = getBounds(selectedNodeIds);

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

      selectedNodeIds.forEach((nodeId) => {
        const node = findNode(nodeId);
        if (node) {
          updateNode(nodeId, {
            parentId: groupNode.id,
            expandParent: true,
            position: {
              x: node.position.x - bounds.x + 20,
              y: node.position.y - bounds.y + 50
            }
          });
        }
      });
      history.resume();
    },
    [
      history,
      getMetadata,
      getBounds,
      createNode,
      addNode,
      findNode,
      addNotification,
      updateNode
    ]
  );

  return surroundWithGroup;
};
