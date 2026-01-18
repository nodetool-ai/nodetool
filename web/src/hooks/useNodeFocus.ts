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
 * Hook for keyboard navigation in the node editor.
 * 
 * Manages focus state for nodes, enabling keyboard-only navigation
 * between nodes using Tab, arrow keys, and other shortcuts.
 * Supports navigation history for "go back" functionality.
 * 
 * @returns Object containing focus state and navigation functions
 * 
 * @example
 * ```typescript
 * const { 
 *   focusedNodeId,
 *   isNavigationMode,
 *   focusNext,
 *   focusPrev,
 *   focusUp,
 *   focusDown,
 *   selectFocused,
 *   goBack
 * } = useNodeFocus();
 * 
 * // Navigate to next node
 * focusNext();
 * 
 * // Select the currently focused node
 * selectFocused();
 * 
 * // Go back to previously focused node
 * goBack();
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
    /** The ID of the currently focused node, or null if no node is focused */
    focusedNodeId,
    /** Whether keyboard navigation mode is active */
    isNavigationMode,
    /** Array of node IDs representing the navigation history */
    focusHistory,
    /** Enable keyboard navigation mode */
    enterNavigationMode,
    /** Disable keyboard navigation mode */
    exitNavigationMode,
    /** Set the focused node by ID */
    setFocusedNode: setFocusedNodeStore,
    /** Focus the next node in the node list */
    focusNext,
    /** Focus the previous node in the node list */
    focusPrev,
    /** Focus the node above the current one */
    focusUp,
    /** Focus the node below the current one */
    focusDown,
    /** Focus the node to the left of the current one */
    focusLeft,
    /** Focus the node to the right of the current one */
    focusRight,
    /** Select the focused node (marks it as selected) */
    selectFocused,
    /** Navigate back to the previously focused node */
    goBack,
    /** Clear the focus history */
    clearFocusHistory: clearFocusHistoryStore,
    /** Get the full node object for the currently focused node */
    getFocusedNode
  };
};
