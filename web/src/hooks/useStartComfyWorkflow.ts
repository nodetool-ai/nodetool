/**
 * Create a Comfy workflow and open it. On the user's own ComfyUI the starter
 * graph uses one of that server's checkpoints, so the first run does not fail
 * on a model the server lacks.
 */
import { useCallback, useState } from "react";
import { COMFY_RUN_MODE } from "@nodetool-ai/protocol";

import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";
import type { Workflow } from "../stores/ApiTypes";
import { queryClient } from "../queryClient";
import {
  comfyStarterGraph,
  pickStarterCheckpoint
} from "../lib/comfy/comfyStarterGraph";
import {
  COMFY_SERVER_STATUS_KEY,
  fetchComfyServerStatus
} from "../lib/comfy/comfyServerStatus";

/**
 * The checkpoint a new Comfy workflow starts on when the Comfy target is the
 * user's own server, or undefined for Comfy Cloud, a worker, or a server that
 * does not answer.
 */
export const starterCheckpointForTarget = async (): Promise<string | undefined> => {
  const { getSettingValue } = useRemoteSettingsStore.getState();
  const serverUrl = getSettingValue("COMFY_SERVER_URL")?.trim() ?? "";
  const target = getSettingValue("COMFY_TARGET")?.trim() ?? "";
  if (!serverUrl || (target !== "" && target !== "server")) {
    return undefined;
  }
  try {
    const status = await queryClient.fetchQuery({
      queryKey: [COMFY_SERVER_STATUS_KEY, serverUrl],
      queryFn: ({ signal }) => fetchComfyServerStatus(signal),
      staleTime: 30_000,
      retry: false
    });
    return pickStarterCheckpoint(status.models.checkpoints ?? []);
  } catch {
    return undefined;
  }
};

export interface StartComfyWorkflow {
  /** Create and open a Comfy workflow, on `checkpoint` when given. */
  start: (checkpoint?: string) => Promise<void>;
  starting: boolean;
}

export const useStartComfyWorkflow = (onStarted?: () => void): StartComfyWorkflow => {
  const createNew = useWorkflowManager((state) => state.createNew);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [starting, setStarting] = useState(false);

  const start = useCallback(
    async (checkpoint?: string) => {
      setStarting(true);
      try {
        const projectId = creationProjectId();
        const workflow = await createNew(projectId, {
          name: "New Comfy Workflow",
          run_mode: COMFY_RUN_MODE,
          graph: comfyStarterGraph({
            checkpoint: checkpoint ?? (await starterCheckpointForTarget())
          }) as Workflow["graph"]
        });
        openTab({
          type: "workflow",
          ref: workflow.id,
          mode: "edit",
          title: workflow.name,
          projectId
        });
        onStarted?.();
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Could not create Comfy workflow: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        });
      } finally {
        setStarting(false);
      }
    },
    [addNotification, createNew, onStarted, openTab]
  );

  return { start, starting };
};
