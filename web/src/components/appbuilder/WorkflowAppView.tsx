/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  FlexRow,
  FlexColumn,
  LoadingSpinner,
  Text,
  Caption,
  EditorButton,
  Box,
  MOTION,
  SPACING
} from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePanelStore } from "../../stores/PanelStore";
import { NodeContext } from "../../contexts/NodeContext";
import { TOOLBAR_WIDTH } from "../../config/constants";
import AppRuntimeView from "./AppRuntimeView";
import { loadAppData, toAppDocField } from "./persistence";
import { isRenderableData } from "./appData";
import { generateAppDoc } from "./generateAppDoc";

interface WorkflowAppViewProps {
  /** When set, render this workflow instead of reading the route param. */
  workflowId?: string;
  /** Embedded in the workspace shell (no docked left panel to offset). */
  embedded?: boolean;
}

/**
 * Renders a workflow as a runnable app from its saved `app_doc`. A workflow
 * without one gets an empty state whose "Generate app" action builds the doc
 * from the graph's Input/Output nodes and saves it — the app is always a real,
 * editable artifact, never an implicit render. Used both embedded in a
 * workspace tab (workflow View mode) and as the standalone
 * `/miniapp/:workflowId` route.
 */
const WorkflowAppView: React.FC<WorkflowAppViewProps> = ({
  workflowId: workflowIdProp,
  embedded = false
}) => {
  const params = useParams<{ workflowId?: string }>();
  const workflowId = workflowIdProp ?? params.workflowId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [generating, setGenerating] = useState(false);

  const {
    data: workflow,
    isLoading,
    error
  } = useQuery({
    queryKey: ["workflow-app", workflowId],
    queryFn: async () => await fetchWorkflow(workflowId ?? ""),
    enabled: !!workflowId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false
  });

  // Bind to THIS view's workflow store, not the global currentWorkflowId. The
  // workspace keeps every tab mounted, so multiple app views can coexist;
  // each must use its own workflow's store (created by the query above).
  const activeNodeStore = useWorkflowManager((state) =>
    workflowId ? state.nodeStores[workflowId] : undefined
  );
  const isVisible = usePanelStore((state) => state.panel.isVisible);
  const panelSize = usePanelStore((state) => state.panel.panelSize);
  const leftOffset = embedded ? 0 : isVisible ? panelSize : TOOLBAR_WIDTH;

  const appData = useMemo(() => {
    if (!workflow) return null;
    const saved = loadAppData(workflow);
    return isRenderableData(saved) ? saved : null;
  }, [workflow]);

  const handleGenerate = useCallback(async () => {
    if (!workflow) return;
    setGenerating(true);
    try {
      const next: Workflow = {
        ...workflow,
        app_doc: toAppDocField(generateAppDoc(workflow))
      };
      await saveWorkflow(next);
      queryClient.setQueryData(["workflow-app", workflow.id], next);
      addNotification({ type: "success", content: "App generated" });
    } catch (err) {
      addNotification({
        type: "error",
        content:
          err instanceof Error ? err.message : "Failed to generate the app"
      });
    } finally {
      setGenerating(false);
    }
  }, [addNotification, queryClient, saveWorkflow, workflow]);

  const handleOpenBuilder = useCallback(() => {
    if (workflowId) navigate(`/app-builder/${workflowId}`);
  }, [navigate, workflowId]);

  return (
    <NodeContext.Provider value={activeNodeStore ?? null}>
      <Box
        component="section"
        className="workflow-app-view"
        sx={{
          marginLeft: `${leftOffset}px`,
          width: "auto",
          minHeight: embedded ? "100%" : "100vh",
          height: embedded ? "100%" : undefined,
          overflow: "auto",
          transition: `margin-left ${MOTION.normal}`
        }}
      >
        {isLoading && (
          <FlexRow justify="center" fullWidth sx={{ py: 8 }}>
            <LoadingSpinner />
          </FlexRow>
        )}
        {error && (
          <Box sx={{ py: 4, px: 2 }}>
            <Text color="error">{error.message}</Text>
          </Box>
        )}
        {workflow && appData && (
          <Box sx={{ height: "100%", width: "100%" }}>
            <AppRuntimeView workflow={workflow} data={appData} />
          </Box>
        )}
        {workflow && !appData && (
          <FlexColumn
            align="center"
            justify="center"
            gap={SPACING.md}
            sx={{ height: "100%", minHeight: "60vh", px: SPACING.lg }}
          >
            <Text size="bigger" weight={500}>
              {workflow.name}
            </Text>
            <Caption color="secondary" sx={{ textAlign: "center", maxWidth: 420 }}>
              This workflow has no app yet. Generate one from its inputs and
              outputs, then customize it in the App Builder.
            </Caption>
            <FlexRow gap={SPACING.sm} sx={{ mt: SPACING.sm }}>
              <EditorButton
                color="primary"
                variant="contained"
                onClick={() => void handleGenerate()}
                disabled={generating}
              >
                {generating ? "Generating…" : "Generate app"}
              </EditorButton>
              <EditorButton variant="outlined" onClick={handleOpenBuilder}>
                Open App Builder
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

export default WorkflowAppView;
