import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  parseApplicationDocument,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import { useNodes } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import useMetadataStore from "../../../stores/MetadataStore";
import { useApplication, useApplications } from "../../../hooks/useApplications";
import {
  Box,
  Caption,
  FlexColumn,
  GAP,
  LoadingSpinner,
  MuiAutocomplete as Autocomplete,
  SPACING,
  TextField
} from "../../ui_primitives";
import isEqual from "../../../utils/isEqual";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import type { NodeData } from "../../../stores/NodeData";
import type { TypeMetadata, Workflow } from "../../../stores/ApiTypes";
import {
  extractAppNodeIO,
  workflowOperations,
  type AppNodeMetadataLookup
} from "./appNodeIO";

interface AppOption {
  id: string;
  name: string;
}

interface AppLoaderProps {
  nodeId: string;
  data: NodeData;
}

const metadataLookup: AppNodeMetadataLookup = {
  inputType: (nodeType: string): TypeMetadata | undefined =>
    useMetadataStore.getState().getMetadata(nodeType)?.outputs[0]?.type,
  outputCorrelation: (nodeType: string, handle: string) =>
    useMetadataStore.getState().getMetadata(nodeType)?.output_correlation?.[
      handle
    ]
};

const storedOperationId = (data: NodeData): string | undefined => {
  const snapshot = data.properties?.app_json;
  return isObjectLike(snapshot) && isString(snapshot.operation_id)
    ? snapshot.operation_id
    : undefined;
};

/**
 * Picks the app an App node runs and keeps the node's ports in step with it.
 *
 * The node stores a snapshot of the app's workflow graph in `app_json`, the
 * same way the Workflow node does, and re-derives its ports whenever the app
 * document or the workflow changes (including live edits in an open tab). A
 * value typed into an input on the node survives a re-derive.
 */
export const AppLoader: React.FC<AppLoaderProps> = memo(({ nodeId, data }) => {
  const appId = isString(data.properties?.app_id)
    ? data.properties.app_id
    : "";
  const operationId = storedOperationId(data);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const { data: apps, isLoading: isLoadingList } = useApplications();
  const {
    data: application,
    isFetching: isLoadingApp,
    error: appError
  } = useApplication(appId || null);
  const [error, setError] = useState<string | null>(null);

  const appDocument = useMemo(
    () => parseApplicationDocument(application?.document) ?? null,
    [application?.document]
  );
  const operations = useMemo(
    () => (appDocument ? workflowOperations(appDocument) : []),
    [appDocument]
  );
  const operation: OperationBinding | undefined =
    operations.find((candidate) => candidate.id === operationId) ??
    operations[0];
  const workflowId = operation?.workflowId;

  const { getWorkflow, fetchWorkflow, workflowStore } = useWorkflowManager(
    useShallow((state) => ({
      getWorkflow: state.getWorkflow,
      fetchWorkflow: state.fetchWorkflow,
      workflowStore: workflowId ? state.nodeStores[workflowId] : undefined
    }))
  );

  const appOptions = useMemo<AppOption[]>(
    () => (apps ?? []).map((app) => ({ id: app.id, name: app.name })),
    [apps]
  );
  const selectedApp = useMemo(
    () => appOptions.find((option) => option.id === appId) ?? null,
    [appOptions, appId]
  );
  const operationOptions = useMemo<AppOption[]>(
    () =>
      operations.map((candidate) => ({
        id: candidate.id,
        name: candidate.name || candidate.id
      })),
    [operations]
  );
  const selectedOperation = useMemo(
    () =>
      operationOptions.find((option) => option.id === operation?.id) ?? null,
    [operationOptions, operation?.id]
  );

  const applyWorkflow = useCallback(
    (workflow: Workflow) => {
      if (!appDocument || !operation || !application) {
        return;
      }
      const io = extractAppNodeIO(
        application.name,
        appDocument,
        operation,
        workflow,
        metadataLookup
      );
      const previous = data.dynamic_properties ?? {};
      const dynamic_properties: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(io.dynamic_properties)) {
        dynamic_properties[name] = Object.hasOwn(previous, name)
          ? previous[name]
          : value;
      }
      const dynamic_inputs =
        Object.keys(io.dynamic_inputs).length > 0 ? io.dynamic_inputs : undefined;
      const dynamic_output_correlation =
        Object.keys(io.dynamic_output_correlation).length > 0
          ? io.dynamic_output_correlation
          : undefined;
      if (
        isEqual(data.properties?.app_json, io.app_json) &&
        isEqual(data.dynamic_inputs, dynamic_inputs) &&
        isEqual(data.dynamic_outputs ?? {}, io.dynamic_outputs) &&
        isEqual(data.dynamic_output_correlation, dynamic_output_correlation) &&
        isEqual(previous, dynamic_properties)
      ) {
        return;
      }
      updateNodeData(nodeId, {
        properties: { ...data.properties, app_json: io.app_json },
        dynamic_inputs,
        dynamic_outputs: io.dynamic_outputs,
        dynamic_output_correlation,
        dynamic_properties
      });
    },
    [
      application,
      appDocument,
      operation,
      nodeId,
      updateNodeData,
      data.properties,
      data.dynamic_inputs,
      data.dynamic_outputs,
      data.dynamic_output_correlation,
      data.dynamic_properties
    ]
  );

  useEffect(() => {
    if (!application) {
      return;
    }
    if (!appDocument) {
      setError("This app's document could not be read.");
      return;
    }
    if (!workflowId) {
      setError("This app has no workflow operation to run.");
      return;
    }
    setError(null);
    let cancelled = false;

    const sync = async (): Promise<void> => {
      try {
        const workflow =
          workflowStore?.getState().getWorkflow() ??
          getWorkflow(workflowId) ??
          (await fetchWorkflow(workflowId, { makeCurrent: false }));
        if (cancelled) {
          return;
        }
        if (!workflow) {
          setError("The workflow behind this app could not be loaded.");
          return;
        }
        applyWorkflow(workflow);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load the app"
          );
        }
      }
    };
    void sync();

    const unsubscribe = workflowStore?.subscribe((state, prevState) => {
      if (
        cancelled ||
        (state.nodes === prevState.nodes &&
          state.edges === prevState.edges &&
          state.workflow.updated_at === prevState.workflow.updated_at)
      ) {
        return;
      }
      applyWorkflow(state.getWorkflow());
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [
    application,
    appDocument,
    workflowId,
    workflowStore,
    getWorkflow,
    fetchWorkflow,
    applyWorkflow
  ]);

  const handleSelectApp = useCallback(
    (_event: React.SyntheticEvent, option: AppOption | null) => {
      setError(null);
      updateNodeData(nodeId, {
        properties: {
          ...data.properties,
          app_id: option?.id ?? "",
          app_json: {}
        },
        dynamic_inputs: undefined,
        dynamic_outputs: undefined,
        dynamic_output_correlation: undefined,
        dynamic_properties: {}
      });
    },
    [nodeId, updateNodeData, data.properties]
  );

  const handleSelectOperation = useCallback(
    (_event: React.SyntheticEvent, option: AppOption | null) => {
      if (!option) {
        return;
      }
      updateNodeData(nodeId, {
        properties: {
          ...data.properties,
          app_json: { operation_id: option.id }
        },
        dynamic_inputs: undefined,
        dynamic_outputs: undefined,
        dynamic_output_correlation: undefined,
        dynamic_properties: {}
      });
    },
    [nodeId, updateNodeData, data.properties]
  );

  const loading = isLoadingList || isLoadingApp;
  const message =
    error ?? (appError ? "This app could not be loaded." : null);

  return (
    <FlexColumn gap={GAP.tight} sx={{ px: SPACING.sm, py: SPACING.xs }}>
      <Autocomplete
        size="small"
        options={appOptions}
        getOptionLabel={(option) => option.name}
        value={selectedApp}
        onChange={handleSelectApp}
        loading={loading}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select App"
            variant="outlined"
            size="small"
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && <LoadingSpinner size="small" />}
                    {params.InputProps.endAdornment}
                  </>
                )
              }
            }}
          />
        )}
      />
      {operationOptions.length > 1 && (
        <Autocomplete
          size="small"
          options={operationOptions}
          getOptionLabel={(option) => option.name}
          value={selectedOperation ?? undefined}
          onChange={handleSelectOperation}
          disableClearable
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Operation"
              variant="outlined"
              size="small"
            />
          )}
        />
      )}
      {message && (
        <Box>
          <Caption color="error">{message}</Caption>
        </Box>
      )}
    </FlexColumn>
  );
});

AppLoader.displayName = "AppLoader";
