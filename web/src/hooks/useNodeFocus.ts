import { useCallback, useMemo } from "react";
import { useNodeFocusStore } from "../stores/NodeFocusStore";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
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

/** Keyboard-based node navigation (Tab/Arrow keys) for the node editor. */
export const useNodeFocus = (): UseNodeFocusReturn => {
  const nodeStore = useNodeStoreRef();
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);

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
    navigateFocusStore("next", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const focusPrev = useCallback(() => {
    navigateFocusStore("prev", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const focusUp = useCallback(() => {
    navigateFocusStore("up", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const focusDown = useCallback(() => {
    navigateFocusStore("down", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const focusLeft = useCallback(() => {
    navigateFocusStore("left", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const focusRight = useCallback(() => {
    navigateFocusStore("right", nodeStore.getState().nodes);
  }, [navigateFocusStore, nodeStore]);

  const selectFocused = useCallback(() => {
    if (focusedNodeId) {
      const nodes = nodeStore.getState().nodes;
      const focusedNode = nodes.find(
        (node: Node<NodeData>) => node.id === focusedNodeId
      );
      setSelectedNodes(focusedNode ? [focusedNode] : []);
    }
  }, [focusedNodeId, nodeStore, setSelectedNodes]);

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
    const nodes = nodeStore.getState().nodes;
    return nodes.find((node: Node<NodeData>) => node.id === focusedNodeId);
  }, [nodeStore, focusedNodeId]);

  return useMemo(() => ({
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
  }), [
    focusedNodeId,
    isNavigationMode,
    focusHistory,
    enterNavigationMode,
    exitNavigationMode,
    setFocusedNodeStore,
    focusNext,
    focusPrev,
    focusUp,
    focusDown,
    focusLeft,
    focusRight,
    selectFocused,
    goBack,
    clearFocusHistoryStore,
    getFocusedNode
  ]);
};
