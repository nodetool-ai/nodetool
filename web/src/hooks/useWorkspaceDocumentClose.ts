import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import {
  useWorkspaceTabsStore,
  tabsToCloseOthers,
  type WorkspaceTab
} from "../stores/WorkspaceTabsStore";
import { useDocumentDraftStore } from "../stores/DocumentDraftStore";
import { closeWorkspaceDocuments } from "../components/workspace/closeWorkspaceDocuments";

interface WorkspaceDocumentClose {
  closeDocument: (tab: WorkspaceTab) => void;
  closeOtherDocuments: (tab: WorkspaceTab) => void;
  closeAllDocuments: () => void;
}

export function useWorkspaceDocumentClose(): WorkspaceDocumentClose {
  const manager = useWorkflowManagerStore();
  const close = (tabs: readonly WorkspaceTab[]): boolean => {
    return closeWorkspaceDocuments(tabs, {
      isDirty: (tab) =>
        Boolean(
          useDocumentDraftStore.getState().dirtyTabs[tab.id] ||
          (tab.type === "workflow" &&
            (manager.getState().unsavedWorkflowIds[tab.ref] ||
              manager.getState().getNodeStore(tab.ref)?.getState()
                .workflowIsDirty))
        ),
      confirmDiscard: (dirty) =>
        window.confirm(
          `Discard unsaved changes and close ${dirty.map((tab) => `“${tab.title}”`).join(", ")}?`
        ),
      cleanup: (tab) => {
        useDocumentDraftStore.getState().discardDraft(tab.id);
        if (tab.type === "workflow") {
          manager.getState().removeWorkflow(tab.ref);
        }
      }
    });
  };
  return {
    closeDocument: (tab) => { close([tab]); },
    closeOtherDocuments: (tab) => {
      if (close(tabsToCloseOthers(useWorkspaceTabsStore.getState().tabs, tab.id))) {
        useWorkspaceTabsStore.getState().setActiveTab(tab.id);
      }
    },
    closeAllDocuments: () => { close(useWorkspaceTabsStore.getState().tabs); }
  };
}
