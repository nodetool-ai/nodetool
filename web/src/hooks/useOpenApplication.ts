import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePanelStore } from "../stores/PanelStore";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";

export const UNTITLED_APP = "Untitled app";

/**
 * Focus the workspace and open an app's tab. Shared by the app list panel and
 * by the recipe cards, which install a shipped example app and then open it.
 */
export const useOpenApplication = (): ((
  id: string,
  name: string,
  projectId?: string
) => void) => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (id: string, name: string, projectId?: string) => {
      openTab({
        type: "application",
        ref: id,
        mode: "edit",
        title: name || UNTITLED_APP,
        projectId
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );
};
