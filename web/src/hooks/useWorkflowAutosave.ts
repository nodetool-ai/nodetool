import { useEffect } from "react";

import { useNodeStoreRef } from "../contexts/NodeContext";
import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../stores/SettingsStore";
import type { NodeStore } from "../stores/NodeStore";
import type { WorkflowManagerStore } from "../stores/WorkflowManagerStore";
import { triggerAutosaveForWorkflow } from "./useAutosave";

/**
 * Persist the workflow's graph as an autosave version when it has unsaved
 * changes. Skips workflows that were never saved (the first save creates them)
 * and runs after any save already in flight. Clears the dirty flag only when
 * the server wrote the graph and it did not change while the request ran.
 */
export async function autosaveIfDirty(
  nodeStore: NodeStore,
  manager: WorkflowManagerStore,
  maxVersions: number
): Promise<void> {
  const initial = nodeStore.getState();
  if (!initial.workflowIsDirty) {
    return;
  }
  const workflowId = initial.workflow.id;
  const managerState = manager.getState();
  if (
    managerState.unsavedWorkflowIds[workflowId] ||
    managerState.isSavingWorkflow(workflowId)
  ) {
    return;
  }

  await managerState.queueWorkflowSave(workflowId, async () => {
    const before = nodeStore.getState();
    if (!before.workflowIsDirty) {
      return undefined;
    }
    const { nodes, edges } = before;
    const workflow = before.getWorkflow();
    const result = await triggerAutosaveForWorkflow(
      workflowId,
      workflow.graph ?? { nodes: [], edges: [] },
      "autosave",
      { maxVersions, expectedUpdatedAt: workflow.updated_at ?? undefined }
    );
    if (!result || result.skipped) {
      return undefined;
    }

    const after = nodeStore.getState();
    after.setWorkflowUpdatedAt(result.updatedAt, result.etag);
    if (after.nodes === nodes && after.edges === edges) {
      after.setWorkflowDirty(false);
    }
    return result.etag;
  });
}

/**
 * Autosave the editor's workflow every `autosave.intervalMinutes` while
 * autosave is enabled in settings.
 */
export const useWorkflowAutosave = (): void => {
  const nodeStore = useNodeStoreRef();
  const manager = useWorkflowManagerStore();
  const enabled = useSettingsStore(
    (state) => state.settings.autosave?.enabled ?? true
  );
  const intervalMinutes = useSettingsStore(
    (state) => state.settings.autosave?.intervalMinutes ?? 10
  );
  const maxVersions = useSettingsStore(
    (state) => state.settings.autosave?.maxVersionsPerWorkflow ?? 50
  );

  useEffect(() => {
    if (!enabled || !(intervalMinutes > 0)) {
      return;
    }
    let running = false;
    const timer = setInterval(() => {
      if (running) {
        return;
      }
      running = true;
      void autosaveIfDirty(nodeStore, manager, maxVersions).finally(() => {
        running = false;
      });
    }, intervalMinutes * 60_000);
    return () => clearInterval(timer);
  }, [enabled, intervalMinutes, maxVersions, nodeStore, manager]);
};
