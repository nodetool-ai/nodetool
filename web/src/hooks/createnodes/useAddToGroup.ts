import { useCallback, useMemo } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { useNodeStore } from "../../stores/NodeStore";
import useMetadataStore from "../../stores/MetadataStore";

const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";

export const useAddToGroup = () => {
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const getMetadata = useMetadataStore.getState().getMetadata;
  const updateNode = useNodeStore((state) => state.updateNode);
  const findNode = useNodeStore((state) => state.findNode);

  const getBounds = useMemo(() => {
    return (selectedNodeIds: string[]) => {
      const nodes = selectedNodeIds.map((id) => findNode(id)).filter(Boolean);
      return nodes.reduce(
        (bounds, node) => {
          if (!node) return bounds;
          return {
            x: Math.min(bounds.x, node.position.x),
            y: Math.min(bounds.y, node.position.y),
            width: Math.max(bounds.width, node.position.x + (node.width || 0)),
            height: Math.max(
              bounds.height,
              node.position.y + (node.height || 0)
            )
          };
        },
        { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity }
      );
    };
  }, [findNode]);

  const addToGroup = useCallback(
    ({ selectedNodeIds }: { selectedNodeIds: string[] }) => {
      const groupMetadata = getMetadata(GROUP_NODE_TYPE) as NodeMetadata;
      const bounds = getBounds(selectedNodeIds);

      const groupNode = createNode(groupMetadata, {
        x: bounds.x - 20,
        y: bounds.y - 20
      });
      groupNode.width = Math.max(bounds.width - bounds.x + 40, 400);
      groupNode.height = Math.max(bounds.height - bounds.y + 40, 250);
      groupNode.style = {
        width: Math.max(bounds.width - bounds.x + 40, 400),
        height: Math.max(bounds.height - bounds.y + 40, 250)
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
              y: node.position.y - bounds.y + 20
            }
          });
        }
      });
    },
    [getMetadata, createNode, addNode, findNode, updateNode, getBounds]
  );

  return addToGroup;
};
