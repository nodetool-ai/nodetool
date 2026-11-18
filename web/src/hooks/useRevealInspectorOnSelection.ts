import { useEffect } from "react";
import { useCanvasChatDockStore } from "../stores/CanvasChatDockStore";
import { useRightPanelStore } from "../stores/RightPanelStore";

/**
 * Reveals the Inspector when a node becomes selected. The reveal is skipped
 * while the canvas chat window is open, so the two panels do not compete for
 * the canvas. A manual open still works.
 */
export function useRevealInspectorOnSelection(
  active: boolean,
  selectedNodeCount: number
): void {
  const revealForSelection = useRightPanelStore(
    (state) => state.revealForSelection
  );
  useEffect(() => {
    // Read, not subscribed: closing the chat must not reveal the Inspector.
    const chatVisible = !useCanvasChatDockStore.getState().conversationCollapsed;
    if (active && selectedNodeCount > 0 && !chatVisible) {
      revealForSelection();
    }
  }, [active, selectedNodeCount, revealForSelection]);
}
