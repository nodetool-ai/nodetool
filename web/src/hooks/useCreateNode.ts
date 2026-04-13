import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { useShallow } from "zustand/react/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import useMetadataStore from "../stores/MetadataStore";
import { findSnippetByNodeType } from "../config/snippetMetadata";
import { inferOutputKeysFromCode, inferInputKeysFromCode } from "../utils/codeOutputInference";
import { CODE_NODE_TYPE } from "../components/node/codeNodeUi";

/**
 * Hook for creating new nodes in the workflow editor.
 *
 * @example
 * const handleCreateNode = useCreateNode();
 * handleCreateNode(metadata); // at menu position
 * handleCreateNode(metadata, { x: 100, y: 200 }); // at specific position
 */
export const useCreateNode = (
  centerPosition: { x: number; y: number } | undefined = undefined
) => {
  const { clickPosition, closeNodeMenu } = useNodeMenuStore(
    useShallow((state) => ({
      clickPosition: state.clickPosition,
      closeNodeMenu: state.closeNodeMenu
    }))
  );
  const reactFlowInstance = useReactFlow();
  const { addNode, createNode, updateNodeData } = useNodes((state) => ({
    addNode: state.addNode,
    createNode: state.createNode,
    updateNodeData: state.updateNodeData
  }));
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) {return;}

      const position = centerPosition ?? clickPosition;
      const rfPos = reactFlowInstance.screenToFlowPosition(position);

      // Snippet virtual nodes → create a real Code node with pre-filled code
      const snippet = findSnippetByNodeType(metadata.node_type);
      if (snippet) {
        const codeMetadata = useMetadataStore.getState().getMetadata(CODE_NODE_TYPE);
        if (codeMetadata) {
          const newNode = createNode(codeMetadata, rfPos, { code: snippet.code });
          newNode.data.title = snippet.title;
          newNode.data.codeNodeMode = "snippet";
          addNode(newNode);

          // Set dynamic inputs/outputs with proper types from snippet metadata
          const outputKeys = inferOutputKeysFromCode(snippet.code);
          const inputKeys = inferInputKeysFromCode(snippet.code);
          const updates: Record<string, unknown> = {};
          if (outputKeys) {
            const dynOutputs: Record<string, { type: string; type_args: never[]; optional: boolean }> = {};
            for (const key of outputKeys) {
              dynOutputs[key] = { type: "any", type_args: [], optional: false };
            }
            updates.dynamic_outputs = dynOutputs;
          }
          if (inputKeys) {
            const dynProps: Record<string, unknown> = {};
            for (const key of inputKeys) {
              dynProps[key] = "";
            }
            updates.dynamic_properties = dynProps;
          }
          if (Object.keys(updates).length > 0) {
            updateNodeData(newNode.id, updates);
          }

          addRecentNode(metadata.node_type);
          closeNodeMenu();
          return;
        }
      }

      const newNode = createNode(metadata, rfPos);
      addNode(newNode);

      // Track this node as recently used
      addRecentNode(metadata.node_type);

      // Close the node menu after creating a node
      closeNodeMenu();
    },
    [
      reactFlowInstance,
      centerPosition,
      clickPosition,
      createNode,
      addNode,
      updateNodeData,
      addRecentNode,
      closeNodeMenu
    ]
  );

  return handleCreateNode;
};
