import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useNodeStore } from "../stores/NodeStore";
import { useReactFlow } from "reactflow";
import useMetadataStore from "../stores/MetadataStore";

export const useCreateNode = () => {
  const { menuPosition } = useNodeMenuStore();
  const reactFlowInstance = useReactFlow();
  const addNode = useNodeStore((state) => state.addNode);
  const createNode = useNodeStore((state) => state.createNode);
  const getMetadata = useMetadataStore.getState().getMetadata;

  const LOOP_NODE_TYPE = "nodetool.group.Loop";
  const GROUP_INPUT_NODE_TYPE = "nodetool.input.GroupInput";
  const GROUP_OUTPUT_NODE_TYPE = "nodetool.output.GroupOutput";

  const createLoopNode = useCallback(
    (metadata: NodeMetadata, position: { x: number; y: number }) => {
      const flowPosition = reactFlowInstance.screenToFlowPosition(position);
      const loopNode = createNode(metadata, flowPosition);
      addNode(loopNode);
      // Create group input node
      const groupInputMetadata = getMetadata(
        GROUP_INPUT_NODE_TYPE
      ) as NodeMetadata;

      const groupInputPosition = {
        x: flowPosition.x - loopNode.position.x,
        y: flowPosition.y - loopNode.position.y + 60
      };
      const groupInputNode = createNode(groupInputMetadata, groupInputPosition);
      groupInputNode.parentId = loopNode.id;
      groupInputNode.expandParent = true;
      addNode(groupInputNode);
      // Create group output node
      const groupOutputMetadata = getMetadata(
        GROUP_OUTPUT_NODE_TYPE
      ) as NodeMetadata;

      const groupOutputPosition = {
        x:
          flowPosition.x -
          loopNode.position.x +
          (loopNode.data.properties.width || 445) -
          50,
        y: flowPosition.y - loopNode.position.y + 60
      };
      const groupOutputNode = createNode(
        groupOutputMetadata,
        groupOutputPosition
      );
      groupOutputNode.parentId = loopNode.id;
      groupOutputNode.expandParent = true;
      addNode(groupOutputNode);
    },
    [addNode, createNode, getMetadata, reactFlowInstance]
  );

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!menuPosition || !reactFlowInstance) return;

      const position = {
        x: menuPosition.x,
        y: menuPosition.y
      };

      // Loop node
      if (metadata.node_type === LOOP_NODE_TYPE) {
        createLoopNode(metadata, position);
      } else {
        const newNode = createNode(
          metadata,
          reactFlowInstance.screenToFlowPosition(position)
        );
        addNode(newNode);
      }
    },
    [menuPosition, reactFlowInstance, createLoopNode, createNode, addNode]
  );

  return handleCreateNode;
};
