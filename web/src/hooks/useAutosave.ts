/**
 * useAutosave Hook
 *
 * Provides automatic saving functionality for workflows using backend-based autosave.
 * The backend controls all save timing, rate limiting, and version management.
 *
 * Note: Manual saves (Ctrl+S) should use saveWorkflow() which handles both
 * saving metadata and creating version entries.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsStore } from "../stores/SettingsStore";
import { useVersionHistoryStore } from "../stores/VersionHistoryStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { Workflow } from "../stores/ApiTypes";
import { workflowVersionsQueryKey } from "../serverState/useWorkflowVersions";
import { v4 as uuidv4 } from "uuid";

export interface UseAutosaveOptions {
  workflowId: string | null;
  getWorkflow: () => Workflow | undefined;
  isDirty: () => boolean;
}

export interface UseAutosaveReturn {
  triggerAutosave: () => Promise<void>;
  saveBeforeRun: () => Promise<void>;
  lastAutosaveTime: number;
}

interface AutosaveResponse {
  version: {
    id: string;
    version: number;
    created_at: string;
  } | null;
  message: string;
  skipped: boolean;
}

/**
 * Standalone utility to trigger an autosave for a specific workflow.
 * Can be called from anywhere without needing the hook.
 */
export async function triggerAutosaveForWorkflow(
  workflowId: string,
  graph: { nodes: unknown[]; edges: unknown[] },
  saveType: "autosave" | "checkpoint" = "autosave",
  options?: { description?: string; force?: boolean; maxVersions?: number }
): Promise<void> {
  try {
    await fetch(`/api/workflows/${workflowId}/autosave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        save_type: saveType,
        description: options?.description,
        force: options?.force ?? false,
        client_id: "system",
        graph,
        max_versions: options?.maxVersions ?? 50
      })
    });
  } catch (error) {
    console.error(`Autosave (${saveType}) failed:`, error);
  }
}

export const useAutosave = (options: UseAutosaveOptions): UseAutosaveReturn => {
  const { workflowId, getWorkflow, isDirty } = options;
  const queryClient = useQueryClient();

  const autosaveSettings = useSettingsStore((state) => state.settings.autosave);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { getLastAutosaveTime, updateLastAutosaveTime } =
    useVersionHistoryStore((state) => ({
      getLastAutosaveTime: state.getLastAutosaveTime,
      updateLastAutosaveTime: state.updateLastAutosaveTime
    }));

  const isSavingRef = useRef(false);
  const [lastAutosaveTime, setLastAutosaveTime] = useState(0);
  const clientIdRef = useRef<string>(uuidv4());

  // Ref to store latest triggerAutosave function to avoid resetting interval on callback changes
  const triggerAutosaveRef = useRef<() => Promise<void>>(() =>
    Promise.resolve()
  );

  useEffect(() => {
    if (workflowId) {
      setLastAutosaveTime(getLastAutosaveTime(workflowId));
    }
  }, [workflowId, getLastAutosaveTime]);

  const callAutosaveEndpoint = useCallback(
    async (
      saveType: "autosave" | "checkpoint",
      options?: {
        force?: boolean;
        description?: string;
        graph?: { nodes: unknown[]; edges: unknown[] };
      }
    ): Promise<AutosaveResponse> => {
      if (!workflowId) {
        return { version: null, message: "no workflow", skipped: true };
      }

      const response = await fetch(`/api/workflows/${workflowId}/autosave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          save_type: saveType,
          description: options?.description,
          force: options?.force ?? false,
          client_id: clientIdRef.current,
          graph: options?.graph,
          max_versions: autosaveSettings?.maxVersionsPerWorkflow ?? 50
        })
      });

      if (!response.ok) {
        throw new Error(`Autosave failed: ${response.statusText}`);
      }

      return response.json();
    },
    [workflowId, autosaveSettings?.maxVersionsPerWorkflow]
  );

  /**
   * Check if a workflow is empty (has no nodes)
   */
  const isWorkflowEmpty = useCallback((workflow: Workflow): boolean => {
    return !workflow.graph?.nodes || workflow.graph.nodes.length === 0;
  }, []);

  /**
   * Perform autosave by calling the backend autosave endpoint
   */
  const triggerAutosave = useCallback(async () => {
    if (!autosaveSettings?.enabled || isSavingRef.current) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    // Never autosave empty workflows
    if (isWorkflowEmpty(workflow)) {
      return;
    }

    isSavingRef.current = true;

    try {
      const result = await callAutosaveEndpoint("autosave", {
        graph: workflow.graph
      });

      if (result.skipped) {
        return;
      }

      if (result.version) {
        updateLastAutosaveTime(workflowId!);
        setLastAutosaveTime(Date.now());

        // Invalidate versions query so the version list refreshes
        queryClient.invalidateQueries({
          queryKey: workflowVersionsQueryKey(workflowId!)
        });

        addNotification({
          content: "Workflow autosaved",
          type: "info",
          alert: false
        });
      }
    } catch (error) {
      console.error("Autosave failed:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [
    autosaveSettings?.enabled,
    workflowId,
    getWorkflow,
    isDirty,
    isWorkflowEmpty,
    callAutosaveEndpoint,
    updateLastAutosaveTime,
    addNotification,
    queryClient
  ]);

  // Keep ref updated with latest triggerAutosave function
  useEffect(() => {
    triggerAutosaveRef.current = triggerAutosave;
  }, [triggerAutosave]);

  /**
   * Save before running workflow (checkpoint)
   */
  const saveBeforeRun = useCallback(async () => {
    if (!autosaveSettings?.saveBeforeRun || !workflowId) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    // Never save empty workflows
    if (isWorkflowEmpty(workflow)) {
      return;
    }

    try {
      await callAutosaveEndpoint("checkpoint", {
        description: "Before execution",
        force: true,
        graph: workflow.graph
      });
    } catch (error) {
      console.error("Save before run failed:", error);
    }
  }, [
    autosaveSettings?.saveBeforeRun,
    workflowId,
    getWorkflow,
    isDirty,
    isWorkflowEmpty,
    callAutosaveEndpoint
  ]);

  /**
   * Set up interval-based autosave triggering
   * Backend handles rate limiting, we just trigger at configured interval
   *
   * Note: We use triggerAutosaveRef instead of triggerAutosave directly
   * to prevent the timer from resetting on every callback change.
   */
  const intervalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autosaveSettings?.enabled || !workflowId) {
      if (intervalTimeoutRef.current) {
        clearTimeout(intervalTimeoutRef.current);
        intervalTimeoutRef.current = null;
      }
      return;
    }

    const intervalMs = (autosaveSettings?.intervalMinutes ?? 10) * 60 * 1000;

    const scheduleNextAutosave = () => {
      intervalTimeoutRef.current = setTimeout(async () => {
        // Use ref to always call the latest version of triggerAutosave
        await triggerAutosaveRef.current();
        // Schedule next autosave if still enabled
        if (autosaveSettings?.enabled && workflowId) {
          scheduleNextAutosave();
        }
      }, intervalMs);
    };

    scheduleNextAutosave();

    return () => {
      if (intervalTimeoutRef.current) {
        clearTimeout(intervalTimeoutRef.current);
        intervalTimeoutRef.current = null;
      }
    };
  }, [
    autosaveSettings?.enabled,
    autosaveSettings?.intervalMinutes,
    workflowId
    // Note: triggerAutosave is NOT in dependencies - we use the ref instead
  ]);

  /**
   * Set up save on window/tab close using sendBeacon for reliability.
   * Unlike async fetch, sendBeacon survives page unload and is fire-and-forget.
   */
  useEffect(() => {
    if (!autosaveSettings?.enabled || !autosaveSettings?.saveOnClose) {
      return;
    }

    const handleBeforeUnload = () => {
      if (workflowId && isDirty()) {
        const workflow = getWorkflow();
        // Never save empty workflows
        if (workflow && !isWorkflowEmpty(workflow)) {
          const blob = new Blob(
            [
              JSON.stringify({
                save_type: "autosave",
                description: "Before close",
                force: true,
                client_id: clientIdRef.current,
                graph: workflow.graph,
                max_versions: autosaveSettings?.maxVersionsPerWorkflow ?? 50
              })
            ],
            { type: "application/json" }
          );
          navigator.sendBeacon(`/api/workflows/${workflowId}/autosave`, blob);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    autosaveSettings?.enabled,
    autosaveSettings?.saveOnClose,
    autosaveSettings?.maxVersionsPerWorkflow,
    workflowId,
    isDirty,
    getWorkflow,
    isWorkflowEmpty
  ]);

  return {
    triggerAutosave,
    saveBeforeRun,
    lastAutosaveTime
  };
};
