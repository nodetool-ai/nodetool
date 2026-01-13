import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { shallow } from "zustand/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import useEdgeInsertionStore from "../stores/EdgeInsertionStore";
import useMetadataStore from "../stores/MetadataStore";

export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore(
    (state) => ({
      clickPosition: state.clickPosition,
      closeNodeMenu: state.closeNodeMenu
    }),
    shallow
  );
  const reactFlowInstance = useReactFlow();
  const {
    addNode,
    createNode,
    deleteEdge,
    addEdge,
    generateEdgeId,
    findNode
  } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode,
    deleteEdge: state.deleteEdge,
    addEdge: state.addEdge,
    generateEdgeId: state.generateEdgeId,
    findNode: state.findNode
  }));
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const targetEdge = useEdgeInsertionStore((state) => state.targetEdge);
  const insertPosition = useEdgeInsertionStore((state) => state.insertPosition);
  const cancelInsertion = useEdgeInsertionStore(
    (state) => state.cancelInsertion
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) {
        return;
      }

      if (targetEdge && insertPosition) {
        const sourceNode = findNode(targetEdge.source);
        const targetNode = findNode(targetEdge.target);

        if (!sourceNode || !targetNode) {
          cancelInsertion();
          return;
        }

        const sourceMetadata = getMetadata(sourceNode.type || "");
        const targetMetadata = getMetadata(targetNode.type || "");

        if (!sourceMetadata || !targetMetadata) {
          cancelInsertion();
          return;
        }

        const rfPos = reactFlowInstance.screenToFlowPosition(insertPosition);

        const newNode = createNode(metadata, rfPos);
        newNode.selected = true;
        addNode(newNode);
        addRecentNode(metadata.node_type);

        deleteEdge(targetEdge.id);

        const sourceOutputHandle = targetEdge.sourceHandle;
        const targetInputHandle = targetEdge.targetHandle;

        const newNodeFirstInput = metadata.properties?.[0]?.name || "value";
        const newNodeFirstOutput = metadata.outputs?.[0]?.name || "output";

        const edgeToNewNode = {
          id: generateEdgeId(),
          source: targetEdge.source,
          target: newNode.id,
          sourceHandle: sourceOutputHandle,
          targetHandle: newNodeFirstInput
        };

        const edgeFromNewNode = {
          id: generateEdgeId(),
          source: newNode.id,
          target: targetEdge.target,
          sourceHandle: newNodeFirstOutput,
          targetHandle: targetInputHandle
        };

        addEdge(edgeToNewNode);
        addEdge(edgeFromNewNode);

        cancelInsertion();
        closeNodeMenu();
        return;
      }

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      const newNode = createNode(metadata, rfPos);
      addNode(newNode);

      addRecentNode(metadata.node_type);

      closeNodeMenu();
    },
    [
      reactFlowInstance,
      centerPosition,
      clickPosition,
      createNode,
      addNode,
      addRecentNode,
      closeNodeMenu,
      targetEdge,
      insertPosition,
      findNode,
      getMetadata,
      deleteEdge,
      generateEdgeId,
      addEdge,
      cancelInsertion
    ]
  );

  return handleCreateNode;
};
