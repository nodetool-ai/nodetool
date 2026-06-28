/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Dialog } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAppBuilderStore } from "../../stores/AppBuilderStore";
import { createEmptyAppSpec } from "./appSchema";
import { loadAppSpec, withAppSpec } from "./persistence";
import AppBuilder from "./AppBuilder";

interface AppBuilderModalProps {
  open: boolean;
  workflow: Workflow | null;
  onClose: () => void;
}

const AppBuilderModal: React.FC<AppBuilderModalProps> = ({
  open,
  workflow,
  onClose
}) => {
  const [saving, setSaving] = useState(false);
  const loadSpec = useAppBuilderStore((s) => s.loadSpec);
  const saveWorkflow = useWorkflowManager((s) => s.saveWorkflow);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  // Load the workflow's spec into the editor when the modal opens.
  useEffect(() => {
    if (!open || !workflow) return;
    loadSpec(loadAppSpec(workflow) ?? createEmptyAppSpec(workflow.name));
  }, [open, workflow, loadSpec]);

  const handleSave = useCallback(async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      const spec = useAppBuilderStore.getState().spec;
      const next: Workflow = {
        ...workflow,
        settings: withAppSpec(workflow.settings, spec)
      };
      await saveWorkflow(next);
      queryClient.setQueryData(["workflow", workflow.id], next);
      void queryClient.invalidateQueries({ queryKey: ["workflow", workflow.id] });
      addNotification({ type: "success", content: "App saved" });
    } catch (error) {
      addNotification({
        type: "error",
        content: error instanceof Error ? error.message : "Failed to save app"
      });
    } finally {
      setSaving(false);
    }
  }, [addNotification, queryClient, saveWorkflow, workflow]);

  if (!workflow) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      slotProps={{
        paper: {
          sx: {
            width: "95vw",
            height: "90vh",
            maxWidth: "1800px"
          }
        }
      }}
    >
      <AppBuilder
        workflow={workflow}
        onClose={onClose}
        onSave={handleSave}
        saving={saving}
      />
    </Dialog>
  );
};

export default AppBuilderModal;
