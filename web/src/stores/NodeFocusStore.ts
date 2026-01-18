import { create } from "zustand";
import { Node } from "@xyflow/react";
import { NodeData } from "./NodeData";

/**
 * Store for managing keyboard navigation focus state in the node editor.
 * 
 * Provides functionality for:
 * - Focusing on individual nodes for keyboard-only navigation
 * - Entering/exiting navigation mode for keyboard-only editing
 * - Sequential navigation (next/prev) and directional navigation (up/down/left/right)
 * - Focus history tracking for "go back" functionality
 * 
 * Navigation shortcuts:
 * - Tab/Shift+Tab: Navigate to next/previous node
 * - Alt+Arrows: Navigate in a direction
 * - Enter: Select the focused node
 * - Alt+ArrowLeft: Go back in navigation history
 * 
 * @example
 * ```typescript
 * // Focus on a specific node
 * useNodeFocusStore.getState().setFocusedNode(nodeId);
 * 
 * // Navigate to next node
 * useNodeFocusStore.getState().navigateFocus("next", nodes);
 * 
 * // Enter keyboard navigation mode
 * useNodeFocusStore.getState().enterNavigationMode();
 * ```
 */
interface NodeFocusState {
  focusedNodeId: string | null;
  isNavigationMode: boolean;
  focusHistory: string[];
  setFocusedNode: (nodeId: string | null) => void;
  enterNavigationMode: () => void;
  exitNavigationMode: () => void;
  navigateFocus: (
    direction: "next" | "prev" | "up" | "down" | "left" | "right",
    nodes: Node<NodeData>[]
  ) => void;
  clearFocusHistory: () => void;
}

/**
 * Helper function to find the nearest node in a given direction.
 * 
 * Uses a scoring algorithm that considers both distance and direction alignment.
 * Nodes further in the specified direction but closer overall are preferred.
 * 
 * @param nodes - Array of nodes to search through
 * @param currentNodeId - The currently focused node ID
 * @param direction - The direction to search in (up, down, left, right)
 * @returns The nearest node in the specified direction, or null if none found
 */
const getDirectionalNode = (
  nodes: Node<NodeData>[],
  currentNodeId: string | null,
  direction: "up" | "down" | "left" | "right"
): Node<NodeData> | null => {
  if (!currentNodeId) {
    return nodes.length > 0 ? nodes[0] : null;
  }

  const currentNode = nodes.find((n: Node<NodeData>) => n.id === currentNodeId);
  if (!currentNode) {
    return nodes.length > 0 ? nodes[0] : null;
  }

  const currentX = currentNode.position.x;
  const currentY = currentNode.position.y;

  let bestCandidate: Node<NodeData> | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (node.id === currentNodeId) {
      continue;
    }

    const nodeX = node.position.x;
    const nodeY = node.position.y;
    const dx = nodeX - currentX;
    const dy = nodeY - currentY;

    let isInDirection = false;
    let score = 0;

    switch (direction) {
      case "up":
        if (dy < 0) {
          isInDirection = true;
          score = Math.abs(dy) + Math.abs(dx) * 0.5;
        }
        break;
      case "down":
        if (dy > 0) {
          isInDirection = true;
          score = Math.abs(dy) + Math.abs(dx) * 0.5;
        }
        break;
      case "left":
        if (dx < 0) {
          isInDirection = true;
          score = Math.abs(dx) + Math.abs(dy) * 0.5;
        }
        break;
      case "right":
        if (dx > 0) {
          isInDirection = true;
          score = Math.abs(dx) + Math.abs(dy) * 0.5;
        }
        break;
    }

    if (isInDirection && score < bestScore) {
      bestScore = score;
      bestCandidate = node;
    }
  }

  return bestCandidate;
};

export const useNodeFocusStore = create<NodeFocusState>((set) => ({
  focusedNodeId: null,
  isNavigationMode: false,
  focusHistory: [],

  setFocusedNode: (nodeId: string | null) => {
    set((state) => {
      if (nodeId === state.focusedNodeId) {
        return state;
      }

      const newHistory = nodeId
        ? [...state.focusHistory, nodeId].slice(-20)
        : state.focusHistory;

      return {
        focusedNodeId: nodeId,
        focusHistory: newHistory
      };
    });
  },

  enterNavigationMode: () => {
    set((state) => {
      if (state.isNavigationMode) {
        return state;
      }
      return {
        isNavigationMode: true,
        focusedNodeId: state.focusedNodeId ?? null
      };
    });
  },

  exitNavigationMode: () => {
    set({
      isNavigationMode: false
    });
  },

  navigateFocus: (
    direction: "next" | "prev" | "up" | "down" | "left" | "right",
    nodes: Node<NodeData>[]
  ) => {
    set((state) => {
      if (nodes.length === 0) {
        return state;
      }

      let newFocusedNodeId: string | null = null;

      if (direction === "next" || direction === "prev") {
        const currentIndex = state.focusedNodeId
          ? nodes.findIndex((n: Node<NodeData>) => n.id === state.focusedNodeId)
          : -1;

        let nextIndex: number;
        if (direction === "next") {
          nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : nodes.length - 1;
        }

        newFocusedNodeId = nodes[nextIndex]?.id ?? null;
      } else {
        const directionalNode = getDirectionalNode(
          nodes,
          state.focusedNodeId,
          direction
        );
        newFocusedNodeId = directionalNode?.id ?? state.focusedNodeId;
      }

      if (newFocusedNodeId === state.focusedNodeId) {
        return state;
      }

      const newHistory =
        newFocusedNodeId !== null
          ? [...state.focusHistory, newFocusedNodeId].slice(-20)
          : state.focusHistory;

      return {
        focusedNodeId: newFocusedNodeId,
        focusHistory: newHistory
      };
    });
  },

  clearFocusHistory: () => {
    set({
      focusHistory: []
    });
  }
}));
