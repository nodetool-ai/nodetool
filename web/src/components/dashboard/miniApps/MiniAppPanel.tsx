/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress
} from "@mui/material";
import { Text, Tooltip, FlexColumn, FlexRow, LoadingSpinner, ToolbarIconButton } from "../../ui_primitives";
import EditIcon from "@mui/icons-material/Edit";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../../trpc/client";
import { NodeContext } from "../../../contexts/NodeContext";
import { useMiniAppsStore } from "../../../stores/MiniAppsStore";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { clampNumber } from "../../miniapps/utils";
import { createStyles } from "../../miniapps/styles";

import MiniAppResults from "../../miniapps/components/MiniAppResults";
import MiniAppInputsForm from "../../miniapps/components/MiniAppInputsForm";
import { useMiniAppInputs } from "../../miniapps/hooks/useMiniAppInputs";
import { useMiniAppRunner } from "../../miniapps/hooks/useMiniAppRunner";

interface MiniAppPanelProps {
  workflowId?: string;
  onWorkflowSelect?: (workflowId: string) => void;
}

const MiniAppPanel: React.FC<MiniAppPanelProps> = ({
  workflowId,
  onWorkflowSelect
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [_submitError, _setSubmitError] = useState<string | null>(null);
  const navigate = useNavigate();

  const { fetchWorkflow } = useWorkflowManager((state) => ({
    fetchWorkflow: state.fetchWorkflow
  }));

  // Fetch all workflows for the selector if no workflowId is provided
  const { data: workflowsData } = useQuery({
    queryKey: ["workflows-list"],
    queryFn: async () => {
      if (!workflowId) {
        return trpcClient.workflows.list.query({ limit: 100 });
      }
      return null;
    },
    enabled: !workflowId
  });

  const {
    data: workflow,
    isLoading,
    error
  } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      if (workflowId) {
        return await fetchWorkflow(workflowId);
      }
      return null;
    },
    enabled: !!workflowId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false
  });

  const { inputDefinitions, inputValues, updateInputValue } =
    useMiniAppInputs(workflow ?? undefined);

  const {
    runWorkflow,
    runnerState,
    statusMessage,
    results,
    progress,
    resetWorkflowState
  } = useMiniAppRunner(workflow ?? undefined);

  const clearResults = useMiniAppsStore((state) => state.clearResults);

  const handleWorkflowSelect = useCallback((e: unknown) => {
    const value = typeof e === "object" && e !== null && "target" in e
      ? (e.target as { value: string }).value
      : null;
    if (value) {
      onWorkflowSelect?.(value);
    }
  }, [onWorkflowSelect]);

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

  const _handleSubmit = useCallback(async () => {
    if (!workflow) {
      return;
    }

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

  const _isSubmitDisabled =
    !workflow || runnerState === "running" || runnerState === "connecting";

  const handleOpenInEditor = useCallback(() => {
    if (workflow?.id) {
      navigate(`/editor/${workflow.id}`);
    }
  }, [navigate, workflow?.id]);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  if (!workflowId) {
    return (
      <FlexColumn
        fullHeight
        align="center"
        justify="center"
        padding={2}
      >
        <Text size="normal" weight={600} gutterBottom>
          Select a Mini App
        </Text>
        <FormControl fullWidth sx={{ maxWidth: 300 }}>
          <InputLabel id="workflow-select-label">Workflow</InputLabel>
          <Select
            labelId="workflow-select-label"
            value=""
            label="Workflow"
            onChange={handleWorkflowSelect}
          >
            {(() => {
              const items = Array.isArray(workflowsData) 
                ? workflowsData 
                : workflowsData?.workflows || [];
              
              return items.map((wf: any) => (
                <MenuItem key={wf.id} value={wf.id}>
                  {wf.name}
                </MenuItem>
              ));
            })()}
          </Select>
        </FormControl>
      </FlexColumn>
    );
  }

  return (
    <NodeContext.Provider value={activeNodeStore ?? null}>
      <Box css={styles} component="section" sx={{ height: "100%", overflow: "hidden" }}>
        {isLoading && (
          <FlexRow justify="center" padding={2}>
            <LoadingSpinner />
          </FlexRow>
        )}
        {error && <Text color="error">{error.message}</Text>}
        {workflow && (
          <>
            <FlexRow
              justify="space-between"
              align="center"
              sx={{
                mb: 1,
                px: 1
              }}
            >
              <Text size="normal" weight={500} noWrap>
                {workflow?.name}
              </Text>
              <ToolbarIconButton
                icon={<EditIcon fontSize="small" />}
                tooltip="Open in Editor"
                onClick={handleOpenInEditor}
                size="small"
                nodrag={false}
              />
            </FlexRow>

            <div className="content-grid" style={{ height: "calc(100% - 40px)", overflow: "auto", display: "flex", flexDirection: "column" }}>
              <MiniAppInputsForm
                workflow={workflow}
                inputDefinitions={inputDefinitions}
                inputValues={inputValues}
                onInputChange={updateInputValue}
              />
              <FlexColumn gap={1} sx={{ flex: 1, minHeight: 0 }}>
                {statusMessage && (
                  <Text
                    size="small"
                    color="secondary"
                    className={runnerState === "running" ? "status-message animating" : ""}
                  >
                    {statusMessage}
                  </Text>
                )}
                {progress ? (
                  <LinearProgress
                    value={(progress.current * 100.0) / progress.total}
                  />
                ) : null}
                <Box flex={1} minHeight={0} sx={{ height: "auto" }}>
                  <MiniAppResults
                    results={results}
                    onClear={
                      workflow?.id
                        ? () => clearResults(workflow.id)
                        : undefined
                    }
                  />
                </Box>
              </FlexColumn>
            </div>
          </>
        )}
      </Box>
    </NodeContext.Provider>
  );
};

MiniAppPanel.displayName = 'MiniAppPanel';

export default React.memo(MiniAppPanel);
