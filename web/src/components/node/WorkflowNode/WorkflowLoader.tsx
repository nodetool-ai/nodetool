import React, { useCallback, useState, memo, useMemo } from "react";
import {
  Box,
  CircularProgress,
  Typography,
  Autocomplete,
  TextField
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNodes } from "../../../contexts/NodeContext";
import { client } from "../../../stores/ApiClient";
import { TypeMetadata, Workflow } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";

export const WORKFLOW_NODE_TYPE = "nodetool.workflows.base_node.WorkflowNode";

/** Map input node types to TypeMetadata types */
const INPUT_TYPE_MAP: Record<string, string> = {
  "nodetool.input.StringInput": "str",
  "nodetool.input.IntegerInput": "int",
  "nodetool.input.FloatInput": "float",
  "nodetool.input.BooleanInput": "bool",
  "nodetool.input.ImageInput": "image",
  "nodetool.input.AudioInput": "audio",
  "nodetool.input.VideoInput": "video",
  "nodetool.input.TextInput": "str"
};

/** Map output node types to TypeMetadata types */
const OUTPUT_TYPE_MAP: Record<string, string> = {
  "nodetool.output.StringOutput": "str",
  "nodetool.output.IntegerOutput": "int",
  "nodetool.output.FloatOutput": "float",
  "nodetool.output.BooleanOutput": "bool",
  "nodetool.output.ImageOutput": "image",
  "nodetool.output.AudioOutput": "audio",
  "nodetool.output.VideoOutput": "video",
  "nodetool.output.TextOutput": "str",
  "nodetool.output.Output": "any"
};

interface WorkflowOption {
  id: string;
  name: string;
}

interface WorkflowLoaderProps {
  nodeId: string;
  data: NodeData;
}

const fetchWorkflows = async (): Promise<WorkflowOption[]> => {
  const { data, error } = await client.GET("/api/workflows/", {});
  if (error) {
    throw new Error("Failed to fetch workflows");
  }
  const result = data as { next: string | null; workflows: Workflow[] };
  const workflows = result.workflows ?? [];
  return workflows.map((w: Workflow) => ({
    id: w.id,
    name: w.name
  }));
};

const fetchWorkflowById = async (id: string): Promise<Workflow> => {
  const { data, error } = await client.GET("/api/workflows/{id}", {
    params: { path: { id } }
  });
  if (error) {
    throw new Error("Failed to fetch workflow");
  }
  return data as Workflow;
};

/**
 * Extract dynamic inputs and outputs from a workflow's input/output nodes.
 * Input nodes become dynamic inputs; Output nodes become dynamic outputs.
 */
function extractDynamicIO(workflow: Workflow) {
  const graph = workflow.graph;
  if (!graph || !graph.nodes) {
    return { dynamic_inputs: {}, dynamic_outputs: {}, dynamic_properties: {} };
  }

  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes
    : Object.values(graph.nodes);

  const dynamic_inputs: Record<
    string,
    TypeMetadata & { description?: string }
  > = {};
  const dynamic_outputs: Record<string, TypeMetadata> = {};
  const dynamic_properties: Record<string, unknown> = {};

  for (const node of nodes) {
    const nodeType = (node as { type?: string }).type ?? "";
    const nodeData = (node as { data?: Record<string, unknown> }).data ?? {};
    const properties =
      (nodeData.properties as Record<string, unknown>) ?? {};
    const inputName =
      (properties.name as string) ?? (nodeData.title as string) ?? nodeType.split(".").pop() ?? "input";

    if (INPUT_TYPE_MAP[nodeType]) {
      const resolvedType = INPUT_TYPE_MAP[nodeType];
      dynamic_inputs[inputName] = {
        type: resolvedType,
        optional: true,
        type_args: [] as TypeMetadata[],
        description: (properties.description as string) ?? ""
      };
      dynamic_properties[inputName] = properties.value ?? "";
    }

    if (OUTPUT_TYPE_MAP[nodeType]) {
      const resolvedType = OUTPUT_TYPE_MAP[nodeType];
      const outputName =
        (properties.name as string) ?? (nodeData.title as string) ?? nodeType.split(".").pop() ?? "output";
      dynamic_outputs[outputName] = {
        type: resolvedType,
        optional: false,
        type_args: [] as TypeMetadata[]
      };
    }
  }

  return { dynamic_inputs, dynamic_outputs, dynamic_properties };
}

/**
 * WorkflowLoader - Lets users select a workflow and loads its IO as dynamic handles.
 */
export const WorkflowLoader: React.FC<WorkflowLoaderProps> = memo(
  ({ nodeId, data }) => {
    const updateNodeData = useNodes((state) => state.updateNodeData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
      data: workflows,
      isLoading: isLoadingList
    } = useQuery({
      queryKey: ["workflows-list-for-node"],
      queryFn: fetchWorkflows,
      staleTime: 30 * 1000
    });

    const selectedWorkflowId = useMemo(
      () => (data.properties?.workflow_json as Record<string, unknown> | undefined)?.id as string | undefined,
      [data.properties?.workflow_json]
    );

    const selectedOption = useMemo(() => {
      if (!selectedWorkflowId || !workflows) {return null;}
      return workflows.find((w) => w.id === selectedWorkflowId) ?? null;
    }, [selectedWorkflowId, workflows]);

    const handleSelect = useCallback(
      async (_event: unknown, option: WorkflowOption | null) => {
        if (!option) {
          updateNodeData(nodeId, {
            properties: { ...data.properties, workflow_json: undefined },
            dynamic_inputs: undefined,
            dynamic_outputs: undefined,
            dynamic_properties: {}
          });
          return;
        }

        setError(null);
        setLoading(true);
        try {
          const workflow = await fetchWorkflowById(option.id);
          const { dynamic_inputs, dynamic_outputs, dynamic_properties } =
            extractDynamicIO(workflow);

          updateNodeData(nodeId, {
            properties: {
              ...data.properties,
              workflow_json: {
                id: workflow.id,
                name: workflow.name,
                graph: workflow.graph
              }
            },
            dynamic_inputs:
              Object.keys(dynamic_inputs).length > 0
                ? dynamic_inputs
                : undefined,
            dynamic_outputs,
            dynamic_properties
          });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load workflow"
          );
        } finally {
          setLoading(false);
        }
      },
      [nodeId, updateNodeData, data.properties]
    );

    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        <Autocomplete
          size="small"
          options={workflows ?? []}
          getOptionLabel={(o) => o.name}
          value={selectedOption}
          onChange={handleSelect}
          loading={isLoadingList}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select Workflow"
              variant="outlined"
              size="small"
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {(isLoadingList || loading) && (
                        <CircularProgress size={16} color="inherit" />
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
          <Typography
            variant="caption"
            color="error"
            sx={{ display: "block", mt: 0.5 }}
          >
            {error}
          </Typography>
        )}
      </Box>
    );
  }
);

WorkflowLoader.displayName = "WorkflowLoader";
