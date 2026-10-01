import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";

export interface DocumentClosePolicy {
  readonly isDirty: (tab: WorkspaceTab) => boolean;
  readonly confirmDiscard: (tabs: readonly WorkspaceTab[]) => boolean;
  readonly cleanup: (tab: WorkspaceTab) => void;
}

/** Close and clean up exactly the approved documents, preserving other projects. */
export function closeWorkspaceDocuments(
  tabs: readonly WorkspaceTab[],
  policy: DocumentClosePolicy
): boolean {
  const dirty = tabs.filter(policy.isDirty);
  if (dirty.length > 0 && !policy.confirmDiscard(dirty)) {
    return false;
  }
  for (const tab of tabs) {
    useWorkspaceTabsStore.getState().closeTab(tab.id);
    policy.cleanup(tab);
  }
  return true;
}
