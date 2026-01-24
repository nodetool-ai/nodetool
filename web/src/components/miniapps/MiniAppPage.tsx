/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  LinearProgress,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useParams } from "react-router-dom";

import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import MiniAppResults from "./components/MiniAppResults";
import MiniAppInputsForm from "./components/MiniAppInputsForm";
import { useMiniAppInputs } from "./hooks/useMiniAppInputs";
import { useMiniAppRunner } from "./hooks/useMiniAppRunner";
import { clampNumber } from "./utils";
import { createStyles } from "./styles";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import { NodeContext } from "../../contexts/NodeContext";
import { useMiniAppsStore } from "../../stores/MiniAppsStore";
import ThemeToggle from "../ui/ThemeToggle";
import MiniWorkflowGraph from "./components/MiniWorkflowGraph";
import { usePanelStore } from "../../stores/PanelStore";

const MiniAppPage: React.FC = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { workflowId } = useParams<{ workflowId?: string }>();
  const [_submitError, setSubmitError] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);

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
    statusMessage,
    results,
    progress,
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
            {/* Header Section */}
            <div className="page-header">
              <div className="page-header-row">
                <Typography variant="h5" fontWeight="600">
                  {workflow.name}
                </Typography>
                <div className="page-header-actions">
                  <ThemeToggle />
                </div>
              </div>
              {workflow.description && (
                <Typography variant="body2" className="workflow-description">
                  {workflow.description}
                </Typography>
              )}
            </div>

            {/* Status Bar - Only shown when running */}
            {isRunning && (
              <div className="status-bar">
                <div className="status-bar-text">
                  <AutorenewIcon
                    fontSize="small"
                    css={css`
                      @keyframes spin {
                        from {
                          transform: rotate(0deg);
                        }
                        to {
                          transform: rotate(360deg);
                        }
                      }
                      animation: spin 1s linear infinite;
                    `}
                  />
                  <Typography
                    variant="body2"
                    fontWeight="500"
                    css={css`
                      @keyframes statusPulseColor {
                        0% {
                          color: #ff6b3d;
                        }
                        25% {
                          color: #ffd700;
                        }
                        50% {
                          color: #40e0d0;
                        }
                        75% {
                          color: #48d1ff;
                        }
                        100% {
                          color: #9370db;
                        }
                      }
                      animation: statusPulseColor 3s linear infinite;
                    `}
                  >
                    {statusMessage || "Processing..."}
                  </Typography>
                </div>
                {progress && (
                  <Box className="status-bar-progress">
                    <LinearProgress
                      variant="determinate"
                      value={(progress.current * 100.0) / progress.total}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                )}
              </div>
            )}

            {/* Main Content Grid */}
            <div className="content-grid">
              <MiniAppInputsForm
                workflow={workflow}
                inputDefinitions={inputDefinitions}
                inputValues={inputValues}
                onInputChange={updateInputValue}
                isSubmitDisabled={isSubmitDisabled}
                onSubmit={handleSubmit}
                onError={setSubmitError}
              />
              <MiniAppResults
                results={results}
                isRunning={isRunning}
                onClear={
                  workflow?.id ? () => clearResults(workflow.id) : undefined
                }
              />
            </div>

            {/* Collapsible Workflow Graph Section */}
            <div className="graph-section">
              <Button
                className="graph-toggle-button"
                onClick={() => setShowGraph(!showGraph)}
                startIcon={<AccountTreeIcon fontSize="small" />}
                endIcon={
                  showGraph ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )
                }
                size="small"
              >
                {showGraph ? "Hide Workflow" : "Show Workflow"}
              </Button>
              <Collapse in={showGraph}>
                <div className="graph-container">
                  <MiniWorkflowGraph
                    workflow={workflow}
                    isRunning={runnerState === "running"}
                  />
                </div>
              </Collapse>
            </div>
          </>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

export default MiniAppPage;
