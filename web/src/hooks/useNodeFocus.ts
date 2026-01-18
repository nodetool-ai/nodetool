import { useCallback } from "react";
import { useNodeFocusStore } from "../stores/NodeFocusStore";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";

interface UseNodeFocusReturn {
  focusedNodeId: string | null;
  isNavigationMode: boolean;
  focusHistory: string[];
  enterNavigationMode: () => void;
  exitNavigationMode: () => void;
  setFocusedNode: (nodeId: string | null) => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusUp: () => void;
  focusDown: () => void;
  focusLeft: () => void;
  focusRight: () => void;
  selectFocused: () => void;
  goBack: () => void;
  clearFocusHistory: () => void;
  getFocusedNode: () => Node<NodeData> | undefined;
}

/**
 * Custom hook for managing keyboard-based node navigation in the workflow editor.
 * 
 * Provides comprehensive keyboard navigation including:
 * - Sequential navigation (Tab/Shift+Tab for next/previous)
 * - Directional navigation (Up/Down/Left/Right arrows)
 * - Focus history tracking for "go back" functionality
 * - Focus mode toggle to switch between mouse and keyboard interaction
 * 
 * When navigation mode is active, users can navigate between nodes using keyboard
 * without using the mouse. The focused node is highlighted with a visual indicator.
 * 
 * @returns UseNodeFocusReturn object containing focus state and navigation functions
 * 
 * @example
 * ```typescript
 * const {
 *   focusedNodeId,
 *   isNavigationMode,
 *   focusHistory,
 *   enterNavigationMode,
 *   exitNavigationMode,
 *   setFocusedNode,
 *   focusNext,
 *   focusPrev,
 *   focusUp,
 *   focusDown,
 *   focusLeft,
 *   focusRight,
 *   selectFocused,
 *   goBack,
 *   getFocusedNode
 * } = useNodeFocus();
 * 
 * // Enter keyboard navigation mode
 * enterNavigationMode();
 * 
 * // Navigate to next node
 * focusNext();
 * 
 * // Navigate left
 * focusLeft();
 * 
 * // Select the focused node
 * selectFocused();
 * 
 * // Go back to previously focused node
 * goBack();
 * 
 * // Exit navigation mode
 * exitNavigationMode();
 * ```
 */
export const useNodeFocus = (): UseNodeFocusReturn => {
  const nodes = useNodes((state) => state.nodes);
  const setNodes = useNodes((state) => state.setNodes);

  const focusedNodeId = useNodeFocusStore((state) => state.focusedNodeId);
  const isNavigationMode = useNodeFocusStore((state) => state.isNavigationMode);
  const focusHistory = useNodeFocusStore((state) => state.focusHistory);

  const enterNavigationMode = useNodeFocusStore(
    (state) => state.enterNavigationMode
  );
  const exitNavigationMode = useNodeFocusStore(
    (state) => state.exitNavigationMode
  );
  const setFocusedNodeStore = useNodeFocusStore(
    (state) => state.setFocusedNode
  );
  const navigateFocusStore = useNodeFocusStore((state) => state.navigateFocus);
  const clearFocusHistoryStore = useNodeFocusStore(
    (state) => state.clearFocusHistory
  );

  const focusNext = useCallback(() => {
    navigateFocusStore("next", nodes);
  }, [navigateFocusStore, nodes]);

  const focusPrev = useCallback(() => {
    navigateFocusStore("prev", nodes);
  }, [navigateFocusStore, nodes]);

  const focusUp = useCallback(() => {
    navigateFocusStore("up", nodes);
  }, [navigateFocusStore, nodes]);

  const focusDown = useCallback(() => {
    navigateFocusStore("down", nodes);
  }, [navigateFocusStore, nodes]);

  const focusLeft = useCallback(() => {
    navigateFocusStore("left", nodes);
  }, [navigateFocusStore, nodes]);

  const focusRight = useCallback(() => {
    navigateFocusStore("right", nodes);
  }, [navigateFocusStore, nodes]);

  const selectFocused = useCallback(() => {
    if (focusedNodeId) {
      setNodes(
        nodes.map((node: Node<NodeData>) => ({
          ...node,
          selected: node.id === focusedNodeId
        }))
      );
    }
  }, [focusedNodeId, nodes, setNodes]);

  const goBack = useCallback(() => {
    if (focusHistory.length > 1) {
      const newHistory = [...focusHistory];
      newHistory.pop();
      const previousNodeId = newHistory[newHistory.length - 1];
      setFocusedNodeStore(previousNodeId);
      useNodeFocusStore.setState({ focusHistory: newHistory });
    }
  }, [focusHistory, setFocusedNodeStore]);

  const getFocusedNode = useCallback((): Node<NodeData> | undefined => {
    if (!focusedNodeId) {
      return undefined;
    }
    return nodes.find((node: Node<NodeData>) => node.id === focusedNodeId);
  }, [nodes, focusedNodeId]);

  return {
    focusedNodeId,
    isNavigationMode,
    focusHistory,
    enterNavigationMode,
    exitNavigationMode,
    setFocusedNode: setFocusedNodeStore,
    focusNext,
    focusPrev,
    focusUp,
    focusDown,
    focusLeft,
    focusRight,
    selectFocused,
    goBack,
    clearFocusHistory: clearFocusHistoryStore,
    getFocusedNode
  };
};
