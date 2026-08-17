interface RefreshableWorkflowStore {
  getState(): {
    workflowIsDirty: boolean;
    getWorkflow(): { updated_at?: string | null };
  };
}

/** Whether a fetched workflow may replace the store that initiated the read. */
export function shouldApplyWorkflowRefresh(
  initialStore: RefreshableWorkflowStore,
  currentStore: RefreshableWorkflowStore,
  freshUpdatedAt?: string | null
): boolean {
  return (
    currentStore === initialStore &&
    !currentStore.getState().workflowIsDirty &&
    currentStore.getState().getWorkflow().updated_at !== freshUpdatedAt
  );
}
