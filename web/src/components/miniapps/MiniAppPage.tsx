/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Tooltip,
  Typography
} from "@mui/material";
import { useParams } from "react-router-dom";

import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import MiniAppResults from "./components/MiniAppResults";
import MiniAppInputsForm from "./components/MiniAppInputsForm";
import MiniAppSidePanel from "./components/MiniAppSidePanel";
import { useMiniAppInputs } from "./hooks/useMiniAppInputs";
import { useMiniAppRunner } from "./hooks/useMiniAppRunner";
import { clampNumber } from "./utils";
import { createStyles } from "./styles";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import { NodeContext } from "../../contexts/NodeContext";
import { useMiniAppsStore } from "../../stores/MiniAppsStore";
import { usePanelStore } from "../../stores/PanelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const MiniAppPage: React.FC = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { workflowId } = useParams<{ workflowId?: string }>();
  const [_submitError, setSubmitError] = useState<string | null>(null);

  const { fetchWorkflow } = useWorkflowManager((state) => ({
    fetchWorkflow: state.fetchWorkflow
  }));

  const {
    data: workflow,
    isLoading,
    error
  } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => await fetchWorkflow(workflowId ?? ""),
    enabled: !!workflowId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false
  });

  const { inputDefinitions, inputValues, updateInputValue } =
    useMiniAppInputs(workflow);

  const {
    runWorkflow,
    runnerState,
    results,
    progress,
    lastRunDuration,
    resetWorkflowState
  } = useMiniAppRunner(workflow);

  const clearResults = useMiniAppsStore((state) => state.clearResults);

  const { nodes: workflowNodes, edges: workflowEdges } = useMemo(() => {
    if (!workflow?.graph) {
      return {
        nodes: [],
        edges: []
      } as {
        nodes: ReturnType<typeof graphNodeToReactFlowNode>[];
        edges: ReturnType<typeof graphEdgeToReactFlowEdge>[];
      };
    }

    const nodes = (workflow.graph.nodes || []).map((node) =>
      graphNodeToReactFlowNode(workflow, node)
    );
    const edges = (workflow.graph.edges || []).map((edge) =>
      graphEdgeToReactFlowEdge(edge)
    );

    return { nodes, edges };
  }, [workflow]);

  useEffect(() => {
    setSubmitError(null);
  }, [workflowId]);

  const handleSubmit = useCallback(async () => {
    if (!workflow) {
      return;
    }

    setSubmitError(null);

    try {
      resetWorkflowState(workflow.id);

      const params = inputDefinitions.reduce<Record<string, unknown>>(
        (accumulator, definition) => {
          const value = inputValues[definition.data.name];

          if (value === undefined) {
            return accumulator;
          }

          if (
            (definition.kind === "integer" || definition.kind === "float") &&
            typeof value === "number"
          ) {
            const normalized =
              definition.kind === "integer" ? Math.round(value) : value;
            accumulator[definition.data.name] = clampNumber(
              normalized,
              definition.data.min,
              definition.data.max
            );
            return accumulator;
          }

          accumulator[definition.data.name] = value;
          return accumulator;
        },
        {}
      );

      await runWorkflow(params, workflow, workflowNodes, workflowEdges);
    } catch (error) {
      console.error("Failed to run workflow", error);
      setSubmitError(
        error instanceof Error ? error.message : "Failed to run workflow"
      );
    }
  }, [
    inputDefinitions,
    inputValues,
    resetWorkflowState,
    runWorkflow,
    workflow,
    workflowEdges,
    workflowNodes
  ]);

  const isSubmitDisabled =
    !workflow || runnerState === "running" || runnerState === "connecting";


  // const notificationsCount = notifications?.length ?? 0;
  // const showAlerts = submitError || notificationsCount > 0;

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );
  const { isVisible, panelSize } = usePanelStore((state) => state.panel);
  const leftOffset = isVisible ? panelSize : 50;

  const isRunning = runnerState === "running" || runnerState === "connecting";

  // Live timer during execution
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime((Date.now() - startTimeRef.current) / 1000);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
    }
  }, [isRunning]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  return (
    <NodeContext.Provider value={activeNodeStore ?? null}>
      <Box
        css={styles}
        component="section"
        className="mini-app-page"
        sx={{
          marginLeft: `${leftOffset}px`,
          width: `calc(100% - ${leftOffset}px)`,
          transition: "margin-left 0.2s ease-out, width 0.2s ease-out"
        }}
      >
        {/* Loading State */}
        {isLoading && (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Box py={4}>
            <Typography color="error">{error.message}</Typography>
          </Box>
        )}

        {workflow && (
          <>
            {/* Side Panel */}
            <MiniAppSidePanel
              workflow={workflow}
              isRunning={runnerState === "running"}
            />

            {/* Header Section */}
            <div className="page-header">
              <Typography variant="h2" fontWeight={300}>
                {workflow.name}
              </Typography>
              {workflow.description && (
                <Typography variant="body2" className="workflow-description">
                  {workflow.description}
                </Typography>
              )}
            </div>

            {/* Progress Bar - Only shown when running with progress */}
            {isRunning && progress && (
              <div className="status-bar">
                <Box className="status-bar-progress" sx={{ width: "100%" }}>
                  <LinearProgress
                    variant="determinate"
                    value={(progress.current * 100.0) / progress.total}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                </Box>
              </div>
            )}

            {/* Main Content Grid */}
            <form
              className="content-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              autoComplete="off"
            >
              <div className="inputs-column">
                <MiniAppInputsForm
                  workflow={workflow}
                  inputDefinitions={inputDefinitions}
                  inputValues={inputValues}
                  onInputChange={updateInputValue}
                  onError={setSubmitError}
                />
                <div className="composer-actions">
                  <Tooltip
                    enterDelay={TOOLTIP_ENTER_DELAY * 2}
                    title={
                      isSubmitDisabled
                        ? "Workflow is running..."
                        : ""
                    }
                  >
                    <span style={{ width: "100%" }}>
                      <Button
                        color="primary"
                        variant="contained"
                        type="submit"
                        disabled={isSubmitDisabled}
                        className="generate-button"
                        fullWidth
                      >
                        Run Workflow
                      </Button>
                    </span>
                  </Tooltip>
                  {isRunning && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", textAlign: "center", mt: 1, width: "100%" }}
                    >
                      {formatDuration(elapsedTime)}
                    </Typography>
                  )}
                  {lastRunDuration != null && !isRunning && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", textAlign: "center", mt: 1, width: "100%" }}
                    >
                      Completed in {formatDuration(lastRunDuration)}
                    </Typography>
                  )}
                </div>
              </div>
              <MiniAppResults
                results={results}
                isRunning={isRunning}
                onClear={
                  workflow?.id ? () => clearResults(workflow.id) : undefined
                }
                workflow={workflow}
              />
            </form>
          </>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

export default MiniAppPage;
