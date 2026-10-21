import { useCallback } from "react";
import { NodeMetadata } from "../stores/ApiTypes";
import { useShallow } from "zustand/react/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useReactFlow } from "@xyflow/react";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { instantiatePaletteNode } from "../utils/instantiatePaletteNode";
import {
  resolveVerticalOverlap,
  type PlacementRect
} from "../utils/nodePlacement";
import type { NodeStoreState } from "../stores/NodeStore";
import { shallow } from "zustand/shallow";

/** Pre-mount size guess for a new node, used only to keep it clear of others. */
const NEW_NODE_SIZE = { width: 280, height: 140 };

/** Frames to wait for ReactFlow to measure a new node before giving up. */
const MAX_MEASURE_FRAMES = 10;

const topLevelRects = (
  nodes: NodeStoreState["nodes"],
  excludeId?: string
): PlacementRect[] =>
  nodes
    .filter((node) => !node.parentId && node.id !== excludeId)
    .map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? node.width ?? 0,
      height: node.measured?.height ?? node.height ?? 0
    }));

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
): ((metadata: NodeMetadata) => void) => {
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
  }), shallow);
  const nodeStore = useNodeStoreRef();
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  const handleCreateNode = useCallback(
    (metadata: NodeMetadata) => {
      if (!reactFlowInstance) {return;}

      const position = centerPosition ?? clickPosition;
      const desired = reactFlowInstance.screenToFlowPosition(position);
      // Several nodes added from the menu without moving the pointer would
      // otherwise land on exactly the same spot, each hiding the one before.
      const rfPos = {
        x: desired.x,
        y: resolveVerticalOverlap(
          { ...desired, ...NEW_NODE_SIZE },
          topLevelRects(nodeStore.getState().nodes)
        )
      };

      // Snippet virtual nodes → create a real Code node with pre-filled code
      const {
        node: newNode,
        afterAdd,
        onAdded
      } = instantiatePaletteNode(metadata, rfPos, createNode);
      addNode(newNode);
      if (afterAdd) {
        updateNodeData(newNode.id, afterAdd);
      }
      onAdded?.(newNode.id);
      // The size guess is wrong for tall nodes, so clear the others again
      // once ReactFlow has measured the real one.
      const settle = (frames: number): void => {
        const state = nodeStore.getState();
        const node = state.findNode(newNode.id);
        if (!node || node.parentId) {
          return;
        }
        const width = node.measured?.width;
        const height = node.measured?.height;
        if (!width || !height) {
          if (frames < MAX_MEASURE_FRAMES) {
            requestAnimationFrame(() => settle(frames + 1));
          }
          return;
        }
        const y = resolveVerticalOverlap(
          { x: node.position.x, y: node.position.y, width, height },
          topLevelRects(state.nodes, node.id)
        );
        if (y !== node.position.y) {
          state.updateNode(node.id, { position: { x: node.position.x, y } });
        }
      };
      requestAnimationFrame(() => settle(0));

      addRecentNode(metadata.node_type);
      closeNodeMenu();
    },
    [
      reactFlowInstance,
      centerPosition,
      clickPosition,
      nodeStore,
      createNode,
      addNode,
      updateNodeData,
      addRecentNode,
      closeNodeMenu
    ]
  );

  return handleCreateNode;
};
