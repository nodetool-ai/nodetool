/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import { Box, FlexRow, FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import FrontendToolRuntimeSync from "../panels/FrontendToolRuntimeSync";
import { APP_DATA_VERSION, createEmptyData } from "./appData";
import { loadAppData, withAppDocument } from "./persistence";
import PuckAppEditor from "./puck/PuckAppEditor";
import AppBuilderAgentPanel from "./AppBuilderAgentPanel";

/**
 * Full-page route for the WYSIWYG app builder (`/app-builder/:workflowId`).
 * Fetches the workflow, hands its Puck document to the editor, and persists
 * edits back onto `workflow.settings` on publish.
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
  const [agentOpen, setAgentOpen] = useState(true);
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

  const handlePublish = useCallback(
    async (nextData: Data) => {
      if (!workflow) return;
      try {
        const next: Workflow = {
          ...workflow,
          settings: withAppDocument(workflow.settings, {
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
    <FlexRow gap={0} sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      {/* Syncs workflow tools to this workflow so the agent can edit the graph. */}
      <FrontendToolRuntimeSync />
      <Box sx={{ flex: 1, minWidth: 0, height: "100%" }}>
        <PuckAppEditor
          workflow={workflow}
          data={data}
          onPublish={handlePublish}
          onClose={handleClose}
          agentOpen={agentOpen}
          onToggleAgent={toggleAgent}
        />
      </Box>
      {agentOpen && (
        <Box
          sx={{
            width: 400,
            flexShrink: 0,
            height: "100%",
            borderLeft: "1px solid",
            borderColor: "divider"
          }}
        >
          <AppBuilderAgentPanel workflowId={workflow.id} />
        </Box>
      )}
    </FlexRow>
  );
};

export default AppBuilderPage;
