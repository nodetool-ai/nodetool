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
 * and workflows with a manual save in flight. Clears the dirty flag only when
 * the graph did not change while the request ran.
 */
export async function autosaveIfDirty(
  nodeStore: NodeStore,
  manager: WorkflowManagerStore,
  maxVersions: number
): Promise<void> {
  const before = nodeStore.getState();
  if (!before.workflowIsDirty) {
    return;
  }
  const { nodes, edges } = before;
  const workflowId = before.workflow.id;
  const managerState = manager.getState();
  if (
    managerState.unsavedWorkflowIds[workflowId] ||
    managerState.isSavingWorkflow(workflowId)
  ) {
    return;
  }

  const workflow = before.getWorkflow();
  const updatedAt = await triggerAutosaveForWorkflow(
    workflowId,
    workflow.graph ?? { nodes: [], edges: [] },
    "autosave",
    { maxVersions, expectedUpdatedAt: workflow.updated_at ?? undefined }
  );
  if (!updatedAt) {
    return;
  }

  const after = nodeStore.getState();
  after.setWorkflowUpdatedAt(updatedAt);
  if (after.nodes === nodes && after.edges === edges) {
    after.setWorkflowDirty(false);
  }
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
