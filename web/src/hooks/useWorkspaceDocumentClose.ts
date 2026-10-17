import { useEffect, useMemo } from "react";
import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import {
  useWorkspaceTabsStore,
  tabsToCloseOthers,
  type WorkspaceTab
} from "../stores/WorkspaceTabsStore";
import { useDocumentDraftStore } from "../stores/DocumentDraftStore";
import { requestConfirm } from "../stores/ConfirmStore";
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
    const cleanup = (tab: WorkspaceTab): void => {
      useDocumentDraftStore.getState().discardDraft(tab.id);
      if (tab.type === "workflow") {
        manager.getState().removeWorkflow(tab.ref);
      }
    };
    /** Close `tabs`, discarding only the dirty ones the user approved. */
    const closeApproved = (
      tabs: readonly WorkspaceTab[],
      approved: ReadonlySet<string>
    ): boolean =>
      closeWorkspaceDocuments(tabs, {
        isDirty: hasUnsavedChanges,
        // A tab that turned dirty while the dialog was open was never
        // approved, so the close is abandoned rather than losing it.
        confirmDiscard: (dirty) => dirty.every((tab) => approved.has(tab.id)),
        cleanup
      });
    const close = (
      tabs: readonly WorkspaceTab[],
      onClosed?: () => void
    ): void => {
      const dirty = tabs.filter(hasUnsavedChanges);
      if (dirty.length === 0) {
        if (closeApproved(tabs, new Set())) {
          onClosed?.();
        }
        return;
      }
      void requestConfirm({
        title:
          dirty.length === 1
            ? "Close document with unsaved changes?"
            : "Close documents with unsaved changes?",
        content: `Unsaved changes or saves in progress may be lost. Close ${dirty.map((tab) => `“${tab.title}”`).join(", ")}?`,
        confirmText: "Close anyway",
        cancelText: "Keep open",
        destructive: true
      }).then((confirmed) => {
        if (
          confirmed &&
          closeApproved(tabs, new Set(dirty.map((tab) => tab.id)))
        ) {
          onClosed?.();
        }
      });
    };
    return {
      closeDocument: (tab) => {
        close([tab]);
      },
      closeOtherDocuments: (tab) => {
        close(
          tabsToCloseOthers(useWorkspaceTabsStore.getState().tabs, tab.id),
          () => useWorkspaceTabsStore.getState().setActiveTab(tab.id)
        );
      },
      closeAllDocuments: () => {
        close(useWorkspaceTabsStore.getState().tabs);
      }
    };
  }, [hasUnsavedChanges, manager]);
}
