import React, { useCallback, useState, memo, useMemo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Caption,
  LoadingSpinner,
  Box,
  TextField,
  MuiAutocomplete as Autocomplete
} from "../../ui_primitives";
import { useQuery } from "@tanstack/react-query";
import isEqual from "../../../utils/isEqual";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { Workflow } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { replaceDynamicSlots } from "../../../utils/replaceDynamicSlots";
import {
  createsWorkflowCycle,
  extractDynamicIO
} from "./WorkflowLoader.helpers";

export { WORKFLOW_NODE_TYPE } from "../../../constants/nodeTypes";

interface WorkflowOption {
  id: string;
  name: string;
}

const cycleMessage = (name: string): string =>
  `"${name}" runs this workflow, so it cannot run inside it.`;

interface WorkflowLoaderProps {
  nodeId: string;
  data: NodeData;
}

export const WorkflowLoader: React.FC<WorkflowLoaderProps> = memo(
  ({ nodeId, data }) => {
    const selectedWorkflowId = useMemo(
      () =>
        (data.properties?.workflow_id as string | undefined) ??
        ((data.properties?.workflow_json as Record<string, unknown> | undefined)
          ?.id as string | undefined),
      [data.properties?.workflow_id, data.properties?.workflow_json]
    );
    const nodeStore = useNodeStoreRef();
    const hostWorkflowId = useNodes((state) => state.workflow.id);
    const addNotification = useNotificationStore(
      (state) => state.addNotification
    );
    const { load, getWorkflow, fetchWorkflow, selectedWorkflowStore } =
      useWorkflowManager(
        useShallow((state) => ({
          load: state.load,
          getWorkflow: state.getWorkflow,
          fetchWorkflow: state.fetchWorkflow,
          selectedWorkflowStore: selectedWorkflowId
            ? state.nodeStores[selectedWorkflowId]
            : undefined
        }))
      );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
      data: workflows,
      isLoading: isLoadingList
    } = useQuery({
      queryKey: ["workflows-list-for-node"],
      queryFn: async () => {
        const response = await load("", 200);
        const workflowList = response;
        return (workflowList.workflows ?? []).map((workflow) => ({
          id: workflow.id,
          name: workflow.name
        }));
      },
      staleTime: 30 * 1000
    });

    const selectedOption = useMemo(() => {
      if (!selectedWorkflowId || !workflows) {return null;}
      return workflows.find((w) => w.id === selectedWorkflowId) ?? null;
    }, [selectedWorkflowId, workflows]);

    // A workflow cannot run itself: copying its own live graph into this
    // node changes that graph, which triggers another copy.
    const options = useMemo(
      () => (workflows ?? []).filter((w) => w.id !== hostWorkflowId),
      [workflows, hostWorkflowId]
    );

    /** Returns false, and stores nothing, when `workflow` would run this one. */
    const applyWorkflowSelection = useCallback(
      (workflow: Workflow): boolean => {
        if (
          createsWorkflowCycle(
            hostWorkflowId,
            workflow,
            (workflowId) => getWorkflow(workflowId)?.graph
          )
        ) {
          setError(cycleMessage(workflow.name));
          return false;
        }
        setError(null);
        const { dynamic_inputs, dynamic_outputs, dynamic_properties } =
          extractDynamicIO(workflow);
        const nextWorkflowJson = {
          id: workflow.id,
          name: workflow.name,
          graph: workflow.graph
        };
        const nextDynamicInputs =
          Object.keys(dynamic_inputs).length > 0 ? dynamic_inputs : undefined;

        const currentWorkflowJson = (
          data.properties?.workflow_json as Record<string, unknown> | undefined
        );
        const hasNoChanges =
          isEqual(currentWorkflowJson, nextWorkflowJson) &&
          data.properties?.workflow_id === workflow.id &&
          isEqual(data.dynamic_inputs, nextDynamicInputs) &&
          isEqual(data.dynamic_outputs ?? {}, dynamic_outputs) &&
          isEqual(data.dynamic_properties ?? {}, dynamic_properties);

        if (hasNoChanges) {
          return true;
        }

        replaceDynamicSlots(nodeStore, nodeId, {
          properties: {
            ...data.properties,
            workflow_id: workflow.id,
            workflow_json: nextWorkflowJson
          },
          dynamic_inputs: nextDynamicInputs,
          dynamic_outputs,
          dynamic_properties
        });
        return true;
      },
      [
        nodeId,
        nodeStore,
        hostWorkflowId,
        getWorkflow,
        data.properties,
        data.dynamic_inputs,
        data.dynamic_outputs,
        data.dynamic_properties
      ]
    );

    const handleSelect = useCallback(
      async (_event: React.SyntheticEvent, option: WorkflowOption | null) => {
        if (!option) {
          replaceDynamicSlots(nodeStore, nodeId, {
            properties: {
              ...data.properties,
              workflow_id: undefined,
              workflow_json: undefined
            },
            dynamic_inputs: undefined,
            dynamic_outputs: undefined,
            dynamic_properties: {}
          });
          return;
        }

        setError(null);
        setLoading(true);
        try {
          const workflow =
            getWorkflow(option.id) ??
            (await fetchWorkflow(option.id, { makeCurrent: false }));
          if (!workflow) {
            throw new Error("Failed to load workflow");
          }
          if (!applyWorkflowSelection(workflow)) {
            addNotification({
              type: "error",
              content: cycleMessage(workflow.name),
              alert: true
            });
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load workflow"
          );
        } finally {
          setLoading(false);
        }
      },
      [
        nodeId,
        nodeStore,
        data.properties,
        getWorkflow,
        fetchWorkflow,
        applyWorkflowSelection,
        addNotification
      ]
    );

    useEffect(() => {
      if (!selectedWorkflowId) {
        return;
      }

      let isCancelled = false;

      const syncSelectedWorkflow = async () => {
        const currentWorkflow =
          selectedWorkflowStore?.getState().getWorkflow() ??
          getWorkflow(selectedWorkflowId) ??
          (await fetchWorkflow(selectedWorkflowId, { makeCurrent: false }));

        if (!currentWorkflow || isCancelled) {
          return;
        }
        applyWorkflowSelection(currentWorkflow);
      };

      void syncSelectedWorkflow();

      if (!selectedWorkflowStore) {
        return () => {
          isCancelled = true;
        };
      }

      const unsubscribe = selectedWorkflowStore.subscribe((state, prevState) => {
        const hasChanged =
          state.nodes !== prevState.nodes ||
          state.edges !== prevState.edges ||
          state.workflow.updated_at !== prevState.workflow.updated_at ||
          state.workflow.name !== prevState.workflow.name;

        if (!hasChanged || isCancelled) {
          return;
        }
        applyWorkflowSelection(state.getWorkflow());
      });

      return () => {
        isCancelled = true;
        unsubscribe();
      };
    }, [
      selectedWorkflowId,
      selectedWorkflowStore,
      getWorkflow,
      fetchWorkflow,
      applyWorkflowSelection
    ]);

    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        <Autocomplete
          size="small"
          options={options}
          getOptionLabel={(o) => o.name}
          value={selectedOption}
          onChange={handleSelect}
          loading={isLoadingList}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select workflow"
              variant="outlined"
              size="small"
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {(isLoadingList || loading) && (
                        <LoadingSpinner size="small" />
                      )}
                      {params.InputProps.endAdornment}
                    </>
                  )
                }
              }}
            />
          )}
        />
        {error && (
          <Caption
            color="error"
            sx={{ display: "block", mt: 0.5 }}
          >
            {error}
          </Caption>
        )}
      </Box>
    );
  }
);

WorkflowLoader.displayName = "WorkflowLoader";
