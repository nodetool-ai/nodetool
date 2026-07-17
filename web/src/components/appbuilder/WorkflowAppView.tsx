/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { FlexRow, LoadingSpinner, Text, Box, MOTION } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { usePanelStore } from "../../stores/PanelStore";
import { NodeContext } from "../../contexts/NodeContext";
import { TOOLBAR_WIDTH } from "../../config/constants";
import AppRuntimeView from "./AppRuntimeView";
import { loadAppData } from "./persistence";
import { isRenderableData } from "./appData";
import { generateAppData } from "./generateAppDoc";

interface WorkflowAppViewProps {
  /** When set, render this workflow instead of reading the route param. */
  workflowId?: string;
  /** Embedded in the workspace shell (no docked left panel to offset). */
  embedded?: boolean;
}

/**
 * Renders a workflow as a runnable app: its saved `app_doc` when present,
 * otherwise a form/results layout generated from the graph's Input/Output
 * nodes. Used both embedded in a workspace tab (workflow View mode) and as
 * the standalone `/miniapp/:workflowId` route.
 */
const WorkflowAppView: React.FC<WorkflowAppViewProps> = ({
  workflowId: workflowIdProp,
  embedded = false
}) => {
  const params = useParams<{ workflowId?: string }>();
  const workflowId = workflowIdProp ?? params.workflowId;

  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
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
    return isRenderableData(saved) ? saved : generateAppData(workflow);
  }, [workflow]);

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
      </Box>
    </NodeContext.Provider>
  );
};

export default WorkflowAppView;
