import { useEffect } from "react";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";

/** The browser tab title for a workspace tab title, or the app name alone. */
export const workspaceDocumentTitle = (
  tabTitle: string | null | undefined
): string => {
  const title = tabTitle?.trim();
  return title ? `${title} · NodeTool` : "NodeTool";
};

/**
 * Keep the browser tab title on the active workspace tab. Every open tab
 * stays mounted, so a surface that set the title itself would leave it behind
 * when the user moves to another tab.
 */
export const useWorkspaceDocumentTitle = (): void => {
  const activeTitle = useWorkspaceTabsStore(
    (state) =>
      state.tabs.find((tab) => tab.id === state.activeTabId)?.title ?? null
  );
  useEffect(() => {
    document.title = workspaceDocumentTitle(activeTitle);
  }, [activeTitle]);
};
