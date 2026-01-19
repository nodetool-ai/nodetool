/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Typography
} from "@mui/material";
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
        {/* <MiniAppHero
        workflows={workflows}
        selectedWorkflowId={selectedWorkflowId}
        onWorkflowChange={handleWorkflowChange}
        onRefresh={() => refetch()}
        workflowsLoading={workflowsLoading}
        runnerState={runnerState}
        statusMessage={statusMessage}
        progress={progress}
        showWorkflowControls={false}
      /> */}
        {isLoading && <CircularProgress />}
        {error && <Typography color="error">{error.message}</Typography>}
        {workflow && (
          <>
            <Box
              mb={2}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="h5" fontWeight="500">
                {workflow?.name}
              </Typography>
              <Box display="flex" alignItems="center" gap={2}>
                <ThemeToggle />
              </Box>
            </Box>
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
              <Box
                display="flex"
                flexDirection="column"
                gap={1}
                flex={1}
                minHeight={0}
              >
                {statusMessage && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    css={
                      runnerState === "running"
                        ? css`
                            @keyframes statusPulseColor {
                              0% {
                                color: #ff6b3d;
                              }
                              20% {
                                color: #ffd700;
                              }
                              40% {
                                color: #9acd32;
                              }
                              60% {
                                color: #40e0d0;
                              }
                              80% {
                                color: #48d1ff;
                              }
                              100% {
                                color: #9370db;
                              }
                            }
                            @keyframes statusSlideIn {
                              from {
                                transform: translateY(-2px);
                                opacity: 0;
                              }
                              to {
                                transform: translateY(0);
                                opacity: 1;
                              }
                            }
                            animation: statusPulseColor 3s linear infinite,
                              statusSlideIn 0.25s ease-out;
                          `
                        : undefined
                    }
                  >
                    {statusMessage}
                  </Typography>
                )}
                {progress ? (
                  <LinearProgress
                    value={(progress.current * 100.0) / progress.total}
                  />
                ) : null}
                <Box flex={1} minHeight={0} sx={{ height: 0 }}>
                  <MiniAppResults
                    results={results}
                    onClear={
                      workflow?.id ? () => clearResults(workflow.id) : undefined
                    }
                  />
                </Box>
              </Box>
            </div>
          </>
        )}
        {workflow && (
          <Box mt={4} height={200}>
            <MiniWorkflowGraph
              workflow={workflow}
              isRunning={runnerState === "running"}
            />
          </Box>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

export default MiniAppPage;
