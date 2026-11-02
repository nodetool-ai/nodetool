import { useCallback } from "react";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  ejectPresetIds,
  type EjectModel
} from "../../lib/presets/ejectPresets";
import type { WorkflowRequest } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

export interface OpenAsWorkflowOptions {
  /** The kind of media the generation made. */
  kind: "image" | "video";
  /** The model the generation used, when known. Without one the graph starts unselected. */
  model?: EjectModel | null;
}

/**
 * "Open as workflow": create a workflow from the presets a card or a
 * generation used, through the same creation path as New workflow, and open it
 * in a tab. A failure is a notification, never a dead click.
 */
export const useOpenPresetAsWorkflow = (): ((
  presetIds: readonly string[],
  options: OpenAsWorkflowOptions
) => Promise<void>) => {
  const createWorkflow = useWorkflowManager((state) => state.create);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  return useCallback(
    async (presetIds, options) => {
      try {
        const ejected = ejectPresetIds(
          presetIds,
          options.kind,
          options.model ?? { provider: "", id: "" }
        );
        if (!ejected) {
          throw new Error("This preset has no workflow for that kind of media.");
        }
        const projectId = creationProjectId();
        const { preset, graph } = ejected;
        const created = await createWorkflow({
          name: preset.name,
          description: preset.description,
          tags: ["preset"],
          access: "private",
          project_id: projectId,
          graph: graph as unknown as NonNullable<WorkflowRequest["graph"]>
        });
        openTab({
          type: "workflow",
          ref: created.id,
          mode: "edit",
          title: created.name || preset.name,
          projectId
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not open as workflow: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        });
      }
    },
    [addNotification, createWorkflow, openTab]
  );
};
