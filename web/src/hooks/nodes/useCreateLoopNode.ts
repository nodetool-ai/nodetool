import { useCallback } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";

const GROUP_INPUT_NODE_TYPE = "nodetool.input.GroupInput";
const GROUP_OUTPUT_NODE_TYPE = "nodetool.output.GroupOutput";

export const useCreateLoopNode = () => {
  const { addNode, createNode } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode
  }));
  const getMetadata = useMetadataStore.getState().getMetadata;

  const createLoopNode = useCallback(
    (metadata: NodeMetadata, position: { x: number; y: number }) => {
      const loopNode = createNode(metadata, position);
      addNode(loopNode);

      const createChildNode = (
        childType: string,
        offsetX: number,
        offsetY: number
      ) => {
        const childMetadata = getMetadata(childType) as NodeMetadata;
        const childPosition = {
          x: position.x - loopNode.position.x + offsetX,
          y: position.y - loopNode.position.y + offsetY
        };
        const childNode = createNode(childMetadata, childPosition);
        childNode.parentId = loopNode.id;
        childNode.expandParent = true;
        addNode(childNode);
      };
      createChildNode(GROUP_INPUT_NODE_TYPE, 0, 37);
      createChildNode(
        GROUP_OUTPUT_NODE_TYPE,
        (loopNode.data.properties.width || 445) - 50,
        37
      );
    },
    [addNode, createNode, getMetadata]
  );

  return createLoopNode;
};
