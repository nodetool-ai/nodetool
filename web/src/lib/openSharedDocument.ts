/** Opens a document another user shared with the caller as a workspace tab. */

import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../stores/WorkspaceTabsStore";

export interface SharedDocumentToOpen {
  type: WorkspaceTabType;
  id: string;
  name: string;
  role: "viewer" | "editor";
}

/**
 * A shared document sits in the owner's project, which the caller cannot
 * open, so its tab joins the loose bucket. A viewer gets the read-only mode:
 * the server refuses their saves.
 */
export const openSharedDocument = ({
  type,
  id,
  name,
  role
}: SharedDocumentToOpen): void => {
  const tabs = useWorkspaceTabsStore.getState();
  tabs.setActiveProjectId(null);
  tabs.openTab({
    type,
    ref: id,
    mode: role === "viewer" ? "view" : "edit",
    title: name,
    projectId: LOOSE_PROJECT_ID
  });
};
