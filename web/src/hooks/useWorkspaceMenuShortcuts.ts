import { useCallback } from "react";

import { useMenuHandler } from "./useIpcRenderer";
import type { MenuEventData } from "../window";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import { useWorkspaceDocumentClose } from "./useWorkspaceDocumentClose";

/**
 * Workspace-level handling of Electron menu tab actions. "Close Tab" (Cmd+W)
 * dispatches a `close` menu event to every registered handler; the node editor
 * used to own it, so it only worked while a workflow tab was focused. Handling
 * it here — where the shell is always mounted — closes the active tab for every
 * surface (image, video/timeline, 3D, …), mirroring the tab bar's × button.
 */
export function useWorkspaceMenuShortcuts(): void {
  const { closeDocument } = useWorkspaceDocumentClose();

  const handleMenuEvent = useCallback(
    (data: MenuEventData) => {
      if (data.type !== "close" && data.type !== "closeTab") {
        return;
      }
      const { activeTabId, tabs } = useWorkspaceTabsStore.getState();
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) {
        return;
      }
      closeDocument(tab);
    },
    [closeDocument]
  );

  useMenuHandler(handleMenuEvent);
}
