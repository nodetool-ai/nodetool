/**
 * useAutosave Hook
 *
 * Provides automatic saving functionality for workflows based on:
 * - Timed intervals (configurable)
 * - Significant changes (20+ edits since last save)
 * - Before workflow execution
 * - On window/tab close
 */

import { useEffect, useRef, useCallback } from "react";
import { useSettingsStore } from "../stores/SettingsStore";
import { useVersionHistoryStore } from "../stores/VersionHistoryStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { Workflow, Graph } from "../stores/ApiTypes";
import { useWorkflowVersions } from "../serverState/useWorkflowVersions";

export interface UseAutosaveOptions {
  workflowId: string | null;
  getWorkflow: () => Workflow | undefined;
  isDirty: () => boolean;
  onSaveWorkflow?: (workflow: Workflow) => Promise<void>;
}

export interface UseAutosaveReturn {
  triggerAutosave: () => Promise<void>;
  triggerManualSave: (description?: string) => Promise<void>;
  saveBeforeRun: () => Promise<void>;
  lastAutosaveTime: number;
  editCountSinceLastSave: number;
}

const SIGNIFICANT_EDITS_THRESHOLD = 20;

const convertSaveTypeToName = (
  saveType: "manual" | "autosave" | "restore" | "checkpoint"
): string => {
  switch (saveType) {
    case "manual":
      return "Manual Save";
    case "autosave":
      return "Autosave";
    case "checkpoint":
      return "Checkpoint";
    case "restore":
      return "Restored";
    default:
      return saveType;
  }
};

export const useAutosave = (
  options: UseAutosaveOptions
): UseAutosaveReturn => {
  const { workflowId, getWorkflow, isDirty, onSaveWorkflow } = options;

  const autosaveSettings = useSettingsStore(
    (state) => state.settings.autosave
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const {
    incrementEditCount,
    resetEditCount,
    getLastAutosaveTime,
    updateLastAutosaveTime
  } = useVersionHistoryStore((state) => ({
    incrementEditCount: state.incrementEditCount,
    resetEditCount: state.resetEditCount,
    getLastAutosaveTime: state.getLastAutosaveTime,
    updateLastAutosaveTime: state.updateLastAutosaveTime
  }));

  const {
    createVersion,
    isCreatingVersion
  } = useWorkflowVersions(workflowId);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  const editCountSinceLastSave = workflowId ? getEditCount(workflowId) : 0;
  const lastAutosaveTime = workflowId ? getLastAutosaveTime(workflowId) : 0;

  /**
    * Perform autosave by creating a version via API
    */
  const triggerAutosave = useCallback(async () => {
    if (!autosaveSettings.enabled || !workflowId || isSavingRef.current || isCreatingVersion) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    isSavingRef.current = true;

    try {
      await createVersion({
        name: convertSaveTypeToName("autosave"),
        description: "Autosave"
      });

      updateLastAutosaveTime(workflowId);
      resetEditCount(workflowId);

      addNotification({
        content: "Workflow autosaved",
        type: "info",
        alert: false
      });
    } catch (error) {
      console.error("Autosave failed:", error);
      addNotification({
        content: "Autosave failed",
        type: "error",
        alert: true
      });
    } finally {
      isSavingRef.current = false;
    }
  }, [
    autosaveSettings.enabled,
    workflowId,
    getWorkflow,
    isDirty,
    createVersion,
    isCreatingVersion,
    updateLastAutosaveTime,
    resetEditCount,
    addNotification
  ]);

  /**
    * Manual save with optional description
    */
  const triggerManualSave = useCallback(
    async (description?: string) => {
      if (!workflowId || isSavingRef.current || isCreatingVersion) {
        return;
      }

      const workflow = getWorkflow();
      if (!workflow) {
        return;
      }

      isSavingRef.current = true;

      try {
        await createVersion({
          name: description || convertSaveTypeToName("manual"),
          description: description || "Manual save"
        });

        if (onSaveWorkflow) {
          await onSaveWorkflow(workflow);
        }

        resetEditCount(workflowId);

        addNotification({
          content: `Workflow "${workflow.name}" saved`,
          type: "success",
          alert: true
        });
      } catch (error) {
        console.error("Manual save failed:", error);
        addNotification({
          content: "Save failed",
          type: "error",
          alert: true
        });
      } finally {
        isSavingRef.current = false;
      }
    },
    [
      workflowId,
      getWorkflow,
      createVersion,
      isCreatingVersion,
      onSaveWorkflow,
      resetEditCount,
      addNotification
    ]
  );

  /**
    * Save before running workflow
    */
  const saveBeforeRun = useCallback(async () => {
    if (
      !autosaveSettings.saveBeforeRun ||
      !workflowId ||
      isSavingRef.current ||
      isCreatingVersion
    ) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    isSavingRef.current = true;

    try {
      await createVersion({
        name: convertSaveTypeToName("checkpoint"),
        description: "Before execution"
      });

      if (onSaveWorkflow) {
        await onSaveWorkflow(workflow);
      }

      resetEditCount(workflowId);
    } catch (error) {
      console.error("Save before run failed:", error);
    } finally {
      isSavingRef.current = false;
    }
  }, [
    autosaveSettings.saveBeforeRun,
    workflowId,
    getWorkflow,
    isDirty,
    createVersion,
    isCreatingVersion,
    onSaveWorkflow,
    resetEditCount
  ]);

  /**
    * Increment edit count when workflow changes
    */
  useEffect(() => {
    if (workflowId && isDirty()) {
      incrementEditCount(workflowId);
    }
  }, [workflowId, isDirty, incrementEditCount]);

  /**
    * Track edit count for significant edits autosave
    */
  const trackedEditCount = workflowId ? getEditCount(workflowId) : 0;

  // Set up interval-based autosave
  useEffect(() => {
    if (!autosaveSettings.enabled || !workflowId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const intervalMs = autosaveSettings.intervalMinutes * 60 * 1000;

    intervalRef.current = setInterval(() => {
      triggerAutosave();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    autosaveSettings.enabled,
    autosaveSettings.intervalMinutes,
    workflowId,
    triggerAutosave
  ]);

  // Set up significant edits autosave
  useEffect(() => {
    if (
      !autosaveSettings.enabled ||
      !workflowId ||
      trackedEditCount < SIGNIFICANT_EDITS_THRESHOLD
    ) {
      return;
    }

    triggerAutosave();
  }, [
    autosaveSettings.enabled,
    workflowId,
    trackedEditCount,
    triggerAutosave
  ]);

  // Set up save on window/tab close
  useEffect(() => {
    if (!autosaveSettings.enabled || !autosaveSettings.saveOnClose) {
      return;
    }

    const handleBeforeUnload = () => {
      if (workflowId && isDirty()) {
        const workflow = getWorkflow();
        if (workflow) {
          createVersion({
            name: convertSaveTypeToName("autosave"),
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
    autosaveSettings.enabled,
    autosaveSettings.saveOnClose,
    workflowId,
    isDirty,
    getWorkflow,
    createVersion
  ]);

  return {
    triggerAutosave,
    triggerManualSave,
    saveBeforeRun,
    lastAutosaveTime,
    editCountSinceLastSave: trackedEditCount
  };
};

function getEditCount(workflowId: string): number {
  return useVersionHistoryStore.getState().getEditCount(workflowId);
}
