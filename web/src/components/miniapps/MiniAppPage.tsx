/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import {
  Text,
  Caption,
  Tooltip,
  LoadingSpinner,
  ProgressBar,
  FlexRow,
  FlexColumn,
  EditorButton,
  Box,
  MOTION
} from "../ui_primitives";
import { useParams } from "react-router-dom";

import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import MiniAppResults from "./components/MiniAppResults";
import MiniAppInputsForm from "./components/MiniAppInputsForm";
import AppRuntimeView from "../appbuilder/AppRuntimeView";
import { loadAppData } from "../appbuilder/persistence";
import { isRenderableData } from "../appbuilder/appData";
import { useMiniAppInputs } from "./hooks/useMiniAppInputs";
import { useMiniAppRunner } from "./hooks/useMiniAppRunner";
import { clampNumber } from "./utils";
import { createStyles } from "./styles";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import { NodeContext } from "../../contexts/NodeContext";
import { useMiniAppsStore } from "../../stores/MiniAppsStore";
import { usePanelStore } from "../../stores/PanelStore";
import { TOOLTIP_ENTER_DELAY, TOOLBAR_WIDTH } from "../../config/constants";

interface MiniAppPageProps {
  /** When set, render this workflow instead of reading the route param. */
  workflowId?: string;
  /** Embedded in the workspace shell (no docked left panel to offset). */
  embedded?: boolean;
}

const MiniAppPage: React.FC<MiniAppPageProps> = ({
  workflowId: workflowIdProp,
  embedded = false
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useParams<{ workflowId?: string }>();
  const workflowId = workflowIdProp ?? params.workflowId;
  const [_submitError, setSubmitError] = useState<string | null>(null);

  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);

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
    cancelWorkflow,
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

  const handleCancelWorkflow = useCallback(() => {
    void cancelWorkflow();
  }, [cancelWorkflow]);

  const isSubmitDisabled =
    !workflow || runnerState === "running" || runnerState === "connecting";

  // Bind to THIS page's workflow store, not the global currentWorkflowId. The
  // workspace keeps every tab mounted, so multiple MiniAppPages coexist; each
  // must use its own workflow's store (created by the fetchWorkflow query above).
  const activeNodeStore = useWorkflowManager((state) =>
    workflowId ? state.nodeStores[workflowId] : undefined
  );
  const isVisible = usePanelStore((state) => state.panel.isVisible);
  const panelSize = usePanelStore((state) => state.panel.panelSize);
  const leftOffset = embedded ? 0 : isVisible ? panelSize : TOOLBAR_WIDTH;

  // Check for an App Builder document. Without one, render the generated form.
  const appData = useMemo(() => loadAppData(workflow), [workflow]);
  const hasAppSpec = isRenderableData(appData);

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
          width: "auto", // Allow auto width to fill available space
          minHeight: embedded ? "100%" : "100vh",
          height: embedded ? "100%" : undefined,
          overflow: embedded ? "auto" : undefined,
          transition: `margin-left ${MOTION.normal}`
        }}
      >
        {/* App Builder document: reactive, event-driven UI. */}
        {hasAppSpec && appData && workflow && (
          <Box sx={{ height: "100%", width: "100%", flex: 1 }}>
            <AppRuntimeView workflow={workflow} data={appData} />
          </Box>
        )}

        {/* Default UI - Centered Container */}
        {!hasAppSpec && (
          <div className="layout-container">
            {/* Loading State */}
            {isLoading && (
              <FlexRow justify="center" fullWidth sx={{ py: 8 }}>
                <LoadingSpinner />
              </FlexRow>
            )}

            {/* Error State */}
            {error && (
              <Box py={4}>
                <Text color="error">{error.message}</Text>
              </Box>
            )}

            {workflow && activeNodeStore && (
              <>
                {/* Header Section */}
                <div className="page-header">
                  <Text size="bigger" weight={400}>
                    {workflow.name}
                  </Text>
                  {workflow.description && (
                    <Text
                      size="small"
                      className="workflow-description"
                    >
                      {workflow.description}
                    </Text>
                  )}
                </div>

                {/* Progress Bar - Only shown when running with progress */}
                {isRunning && progress && (
                  <div className="status-bar">
                    <Box className="status-bar-progress" sx={{ width: "100%" }}>
                      <ProgressBar
                        value={
                          progress.total > 0
                            ? (progress.current * 100.0) / progress.total
                            : 0
                        }
                        showValue={false}
                        barHeight={6}
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
                    <FlexColumn className="composer-actions" gap={1} fullWidth>
                      {isRunning ? (
                        <EditorButton
                          color="warning"
                          variant="contained"
                          onClick={handleCancelWorkflow}
                          className="generate-button"
                          fullWidth
                        >
                          Stop
                        </EditorButton>
                      ) : (
                        <Tooltip
                          delay={TOOLTIP_ENTER_DELAY * 2}
                          title={
                            isSubmitDisabled ? "Workflow is running..." : ""
                          }
                        >
                          <Box component="span" sx={{ width: "100%" }}>
                            <EditorButton
                              color="primary"
                              variant="contained"
                              type="submit"
                              disabled={isSubmitDisabled}
                              className="generate-button"
                              fullWidth
                            >
                              Run Workflow
                            </EditorButton>
                          </Box>
                        </Tooltip>
                      )}
                      {isRunning && (
                        <Caption
                          color="secondary"
                          sx={{
                            display: "block",
                            textAlign: "center",
                            mt: 1,
                            width: "100%"
                          }}
                        >
                          {formatDuration(elapsedTime)}
                        </Caption>
                      )}
                      {lastRunDuration != null && !isRunning && (
                        <Caption
                          color="secondary"
                          sx={{
                            display: "block",
                            textAlign: "center",
                            mt: 1,
                            width: "100%"
                          }}
                        >
                          Completed in {formatDuration(lastRunDuration)}
                        </Caption>
                      )}
                    </FlexColumn>
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
          </div>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

export default MiniAppPage;
