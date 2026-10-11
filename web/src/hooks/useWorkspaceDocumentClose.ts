import { useEffect, useMemo } from "react";
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
  const hasUnsavedChanges = useMemo(
    () =>
      (tab: WorkspaceTab): boolean =>
        Boolean(
          useDocumentDraftStore.getState().dirtyTabs[tab.id] ||
          useDocumentDraftStore.getState().savingTabs[tab.id] ||
          (tab.type === "workflow" &&
            (manager.getState().isSavingWorkflow?.(tab.ref) ||
              manager.getState().unsavedWorkflowIds[tab.ref] ||
              manager.getState().getNodeStore(tab.ref)?.getState()
                .workflowIsDirty))
        ),
    [manager]
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (useWorkspaceTabsStore.getState().tabs.some(hasUnsavedChanges)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasUnsavedChanges]);
  return useMemo(() => {
    const close = (tabs: readonly WorkspaceTab[]): boolean => {
      return closeWorkspaceDocuments(tabs, {
        isDirty: hasUnsavedChanges,
        confirmDiscard: (dirty) =>
          window.confirm(
            `Unsaved changes or saves in progress may be lost. Close ${dirty.map((tab) => `“${tab.title}”`).join(", ")}?`
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
      closeDocument: (tab) => {
        close([tab]);
      },
      closeOtherDocuments: (tab) => {
        if (
          close(
            tabsToCloseOthers(useWorkspaceTabsStore.getState().tabs, tab.id)
          )
        ) {
          useWorkspaceTabsStore.getState().setActiveTab(tab.id);
        }
      },
      closeAllDocuments: () => {
        close(useWorkspaceTabsStore.getState().tabs);
      }
    };
  }, [hasUnsavedChanges, manager]);
}
