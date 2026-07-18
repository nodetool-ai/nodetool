/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import {
  Box,
  FlexRow,
  FlexColumn,
  LoadingSpinner,
  Text,
  Caption,
  AlertBanner,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import FrontendToolRuntimeSync from "../panels/FrontendToolRuntimeSync";
import { APP_DATA_VERSION, createEmptyData } from "./appData";
import { loadAppData, toAppDocField } from "./persistence";
import PuckAppEditor from "./puck/PuckAppEditor";
import AppBuilderAgentPanel from "./AppBuilderAgentPanel";

/**
 * Full-page route for the WYSIWYG app builder (`/app-builder/:workflowId`).
 * Fetches the workflow, hands its Puck document to the editor, and persists
 * edits back onto `workflow.settings` on save.
 */
const AppBuilderPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const navigate = useNavigate();

  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);
  const saveWorkflow = useWorkflowManager((s) => s.saveWorkflow);
  const setCurrentWorkflowId = useWorkflowManager((s) => s.setCurrentWorkflowId);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  const [data, setData] = useState<Data | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

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

  // Seed the editor once the workflow is fetched, and make it the current
  // workflow so the agent's workflow tools target it.
  useEffect(() => {
    if (!workflow) return;
    setData(loadAppData(workflow) ?? createEmptyData());
    setCurrentWorkflowId(workflow.id);
  }, [workflow, setCurrentWorkflowId]);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSave = useCallback(
    async (nextData: Data) => {
      if (!workflow) return;
      try {
        const next: Workflow = {
          ...workflow,
          app_doc: toAppDocField({
            version: APP_DATA_VERSION,
            data: nextData
          })
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
      }
    },
    [addNotification, queryClient, saveWorkflow, workflow]
  );

  if (isLoading || (workflow && !data)) {
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

  if (error || !workflow || !data) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        gap={SPACING.md}
        sx={{ width: "100%", height: "100%" }}
      >
        <AlertBanner severity="error" title="Error loading workflow">
          {error?.message ?? "The workflow could not be loaded."}
        </AlertBanner>
      </FlexColumn>
    );
  }

  return (
    <FlexRow gap={0} sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      {/* Syncs workflow tools to this workflow so the agent can edit the graph. */}
      <FrontendToolRuntimeSync />
      <FlexColumn sx={{ flex: 1, minWidth: 0, height: "100%", minHeight: 0 }}>
        <FlexRow
          align="center"
          justify="space-between"
          sx={{
            px: SPACING.lg,
            py: SPACING.md,
            borderBottom: "1px solid",
            borderColor: "divider",
            backgroundColor: "background.paper"
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Text size="small" weight={500} truncate>
              {workflow.name}
            </Text>
            <Caption color="secondary" sx={{ display: "block" }}>
              App Builder
            </Caption>
          </Box>
          <Caption color="secondary">
            Bind widgets to workflow inputs and outputs, then save.
          </Caption>
        </FlexRow>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <PuckAppEditor
            workflow={workflow}
            data={data}
            onPublish={handleSave}
            onClose={handleClose}
            agentOpen={agentOpen}
            onToggleAgent={toggleAgent}
          />
        </Box>
      </FlexColumn>
      {agentOpen && (
        <Box
          sx={{
            width: { xs: "min(100vw, 360px)", lg: 420 },
            flexShrink: 0,
            height: "100%",
            borderLeft: "1px solid",
            borderColor: "divider",
            overflow: "hidden",
            borderTopLeftRadius: BORDER_RADIUS.lg
          }}
        >
          <AppBuilderAgentPanel workflowId={workflow.id} />
        </Box>
      )}
    </FlexRow>
  );
};

export default AppBuilderPage;
