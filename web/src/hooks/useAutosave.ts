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
import { useSettingsStore } from "../stores/SettingsStore";
import { useVersionHistoryStore } from "../stores/VersionHistoryStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { Workflow } from "../stores/ApiTypes";
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

export const useAutosave = (
  options: UseAutosaveOptions
): UseAutosaveReturn => {
  const { workflowId, getWorkflow, isDirty } = options;

  const autosaveSettings = useSettingsStore(
    (state) => state.settings.autosave
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { getLastAutosaveTime, updateLastAutosaveTime } = useVersionHistoryStore(
    (state) => ({
      getLastAutosaveTime: state.getLastAutosaveTime,
      updateLastAutosaveTime: state.updateLastAutosaveTime
    })
  );

  const isSavingRef = useRef(false);
  const [lastAutosaveTime, setLastAutosaveTime] = useState(0);
  const clientIdRef = useRef<string>(uuidv4());

  useEffect(() => {
    if (workflowId) {
      setLastAutosaveTime(getLastAutosaveTime(workflowId));
    }
  }, [workflowId, getLastAutosaveTime]);

  const callAutosaveEndpoint = useCallback(
    async (
      saveType: "autosave" | "checkpoint",
      options?: { force?: boolean; description?: string }
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
          client_id: clientIdRef.current
        })
      });

      if (!response.ok) {
        throw new Error(`Autosave failed: ${response.statusText}`);
      }

      return response.json();
    },
    [workflowId]
  );

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

    isSavingRef.current = true;

    try {
      const result = await callAutosaveEndpoint("autosave");

      if (result.skipped) {
        return;
      }

      if (result.version) {
        updateLastAutosaveTime(workflowId!);
        setLastAutosaveTime(Date.now());

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
    callAutosaveEndpoint,
    updateLastAutosaveTime,
    addNotification
  ]);

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

    try {
      await callAutosaveEndpoint("checkpoint", {
        description: "Before execution",
        force: true
      });
    } catch (error) {
      console.error("Save before run failed:", error);
    }
  }, [
    autosaveSettings?.saveBeforeRun,
    workflowId,
    getWorkflow,
    isDirty,
    callAutosaveEndpoint
  ]);

  /**
   * Set up interval-based autosave triggering
   * Backend handles rate limiting, we just trigger at configured interval
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
      if (!autosaveSettings?.enabled || !workflowId) {
        return;
      }

      intervalTimeoutRef.current = setTimeout(() => {
        triggerAutosave().then(() => {
          scheduleNextAutosave();
        });
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
    workflowId,
    triggerAutosave
  ]);

  /**
   * Set up save on window/tab close
   */
  useEffect(() => {
    if (!autosaveSettings?.enabled || !autosaveSettings?.saveOnClose) {
      return;
    }

    const handleBeforeUnload = async () => {
      if (workflowId && isDirty()) {
        const workflow = getWorkflow();
        if (workflow) {
          await callAutosaveEndpoint("autosave", {
            description: "Before close"
          });
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
    workflowId,
    isDirty,
    getWorkflow,
    callAutosaveEndpoint
  ]);

  return {
    triggerAutosave,
    saveBeforeRun,
    lastAutosaveTime
  };
};
