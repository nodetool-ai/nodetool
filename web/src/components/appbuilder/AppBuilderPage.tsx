/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Box, FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useAppBuilderStore } from "../../stores/AppBuilderStore";
import { createEmptyAppSpec } from "./appSchema";
import { loadAppSpec, withAppSpec } from "./persistence";
import AppBuilder from "./AppBuilder";

/**
 * Full-page route for the WYSIWYG app builder (`/app-builder/:workflowId`).
 * Fetches the workflow, loads its spec into the editor store, and persists
 * edits back onto `workflow.settings`. Closing returns to the previous view.
 */
const AppBuilderPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);
  const saveWorkflow = useWorkflowManager((s) => s.saveWorkflow);
  const loadSpec = useAppBuilderStore((s) => s.loadSpec);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  const {
    data: workflow,
    isLoading,
    error
  } = useQuery({
    queryKey: ["app-builder", workflowId],
    queryFn: async () => await fetchWorkflow(workflowId ?? ""),
    enabled: !!workflowId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false
  });

  // Load the workflow's spec into the editor once it's fetched.
  useEffect(() => {
    if (!workflow) return;
    loadSpec(loadAppSpec(workflow) ?? createEmptyAppSpec(workflow.name));
  }, [workflow, loadSpec]);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

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
      void queryClient.invalidateQueries({
        queryKey: ["workflow", workflow.id]
      });
      addNotification({ type: "success", content: "App saved" });
    } catch (err) {
      addNotification({
        type: "error",
        content: err instanceof Error ? err.message : "Failed to save app"
      });
    } finally {
      setSaving(false);
    }
  }, [addNotification, queryClient, saveWorkflow, workflow]);

  if (isLoading) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ width: "100%", height: "100%" }}
      >
        <LoadingSpinner size="medium" />
      </FlexColumn>
    );
  }

  if (error || !workflow) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        gap={1}
        sx={{ width: "100%", height: "100%" }}
      >
        <Text color="error" weight={600}>
          Error Loading Workflow
        </Text>
        {error && <Text color="error">{error.message}</Text>}
      </FlexColumn>
    );
  }

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <AppBuilder
        workflow={workflow}
        onClose={handleClose}
        onSave={handleSave}
        saving={saving}
      />
    </Box>
  );
};

export default AppBuilderPage;
