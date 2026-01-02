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
import { Workflow } from "../stores/ApiTypes";

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
    saveVersion,
    getEditCount,
    resetEditCount,
    getLastAutosaveTime,
    updateLastAutosaveTime,
    pruneOldVersions
  } = useVersionHistoryStore((state) => ({
    saveVersion: state.saveVersion,
    getEditCount: state.getEditCount,
    resetEditCount: state.resetEditCount,
    getLastAutosaveTime: state.getLastAutosaveTime,
    updateLastAutosaveTime: state.updateLastAutosaveTime,
    pruneOldVersions: state.pruneOldVersions
  }));

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);

  // Get current values for the workflow
  const editCountSinceLastSave = workflowId ? getEditCount(workflowId) : 0;
  const lastAutosaveTime = workflowId ? getLastAutosaveTime(workflowId) : 0;

  /**
   * Create a version snapshot
   */
  const createVersion = useCallback(
    (
      workflow: Workflow,
      saveType: "manual" | "autosave" | "restore" | "checkpoint",
      description?: string
    ) => {
      if (!workflow.id || !workflow.graph) {
        return;
      }

      saveVersion(workflow.id, workflow.graph, saveType, description);

      // Prune old versions after saving
      pruneOldVersions(
        workflow.id,
        autosaveSettings.maxVersionsPerWorkflow,
        autosaveSettings.keepManualVersionsDays,
        autosaveSettings.keepAutosaveVersionsDays
      );
    },
    [saveVersion, pruneOldVersions, autosaveSettings]
  );

  /**
   * Perform autosave if conditions are met
   */
  const triggerAutosave = useCallback(async () => {
    if (!autosaveSettings.enabled || !workflowId || isSavingRef.current) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    isSavingRef.current = true;

    try {
      // Create version snapshot
      createVersion(workflow, "autosave");

      // Also save to backend if handler provided
      if (onSaveWorkflow) {
        await onSaveWorkflow(workflow);
      }

      updateLastAutosaveTime(workflowId);
      resetEditCount(workflowId);

      addNotification({
        content: "Workflow autosaved",
        type: "info",
        alert: false // Silent notification
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
    onSaveWorkflow,
    updateLastAutosaveTime,
    resetEditCount,
    addNotification
  ]);

  /**
   * Manual save with optional description
   */
  const triggerManualSave = useCallback(
    async (description?: string) => {
      if (!workflowId || isSavingRef.current) {
        return;
      }

      const workflow = getWorkflow();
      if (!workflow) {
        return;
      }

      isSavingRef.current = true;

      try {
        // Create version snapshot with manual type
        createVersion(workflow, "manual", description);

        // Save to backend if handler provided
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
      isSavingRef.current
    ) {
      return;
    }

    const workflow = getWorkflow();
    if (!workflow || !isDirty()) {
      return;
    }

    isSavingRef.current = true;

    try {
      // Create checkpoint version
      createVersion(workflow, "checkpoint", "Before execution");

      // Save to backend if handler provided
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
    onSaveWorkflow,
    resetEditCount
  ]);

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
      editCountSinceLastSave < SIGNIFICANT_EDITS_THRESHOLD
    ) {
      return;
    }

    // Trigger autosave when significant edits threshold is reached
    triggerAutosave();
  }, [
    autosaveSettings.enabled,
    workflowId,
    editCountSinceLastSave,
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
          // Use synchronous localStorage save for beforeunload
          // The version store will handle this through its persist middleware
          createVersion(workflow, "autosave", "Before close");
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
    editCountSinceLastSave
  };
};
