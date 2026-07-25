import React, { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Box,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  Caption,
  AlertBanner,
  SPACING
} from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { createEmptyDocument, type AppDocument } from "./appData";
import { loadAppDocument, toAppDocField } from "./persistence";
import AppBuilderShell from "./AppBuilderShell";

/**
 * Full-page route for the WYSIWYG app builder (`/app-builder/:workflowId`) —
 * the legacy target: the document lives on `workflow.app_doc`. Editing an
 * `applications` record goes through `ApplicationAppBuilder` instead.
 */
const AppBuilderPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const navigate = useNavigate();

  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);
  const saveWorkflow = useWorkflowManager((s) => s.saveWorkflow);
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

  const document = useMemo(
    () => (workflow ? loadAppDocument(workflow) ?? createEmptyDocument() : null),
    [workflow]
  );

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSave = useCallback(
    async (document: AppDocument) => {
      if (!workflow) return;
      try {
        const next: Workflow = {
          ...workflow,
          app_doc: toAppDocField(document)
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

  if (error || !workflow || !document) {
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
    <AppBuilderShell
      key={workflow.id}
      document={document}
      workflow={workflow}
      agentWorkflowId={workflow.id}
      onSave={(document) => void handleSave(document)}
      onClose={handleClose}
      header={
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
      }
    />
  );
};

export default AppBuilderPage;
