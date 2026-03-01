import React, { useCallback, useState, memo } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useNodes } from "../../../contexts/NodeContext";
import { BASE_URL } from "../../../stores/BASE_URL";
import { TypeMetadata } from "../../../stores/ApiTypes";
import { resolveReplicateSchemaClient } from "../../../utils/replicateDynamicSchema";
import { NodeData } from "../../../stores/NodeData";

export const DYNAMIC_REPLICATE_NODE_TYPE =
  "replicate.dynamic_schema.ReplicateAI";

interface ReplicateSchemaLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Replicate-specific control: "Load schema" button for ReplicateAI dynamic nodes.
 * Fetches model schema via backend and updates node dynamic_properties / dynamic_outputs.
 */
export const ReplicateSchemaLoader: React.FC<ReplicateSchemaLoaderProps> = memo(
  ({ nodeId, data }) => {
    const updateNodeData = useNodes((state) => state.updateNodeData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modelInfo = (
      (data.properties?.model_info as string) ??
      (data as NodeData & { model_info?: string }).model_info ??
      ""
    ).trim();

    const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);

    const handleLoad = useCallback(async () => {
      if (!modelInfo) {
        setError("Paste a Replicate model identifier first.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const resolved = await resolveReplicateSchemaClient(
          modelInfo,
          BASE_URL
        );
        const dynamic_outputs: Record<string, TypeMetadata> = {};
        for (const [k, v] of Object.entries(resolved.dynamic_outputs ?? {})) {
          const meta = v as {
            type: string;
            optional?: boolean;
            type_args?: unknown[];
            values?: (string | number)[] | null;
            type_name?: string | null;
          };
          dynamic_outputs[k] = {
            type: meta.type,
            optional: meta.optional ?? false,
            type_args: (Array.isArray(meta.type_args)
              ? meta.type_args
              : []) as TypeMetadata[],
            ...(meta.values != null && { values: meta.values }),
            ...(meta.type_name != null && { type_name: meta.type_name })
          } as TypeMetadata;
        }
        const dynamic_inputs: Record<
          string,
          TypeMetadata & { description?: string }
        > = {};
        for (const [k, v] of Object.entries(resolved.dynamic_inputs ?? {})) {
          const meta = v as {
            type: string;
            optional?: boolean;
            type_args?: unknown[];
            description?: string;
            values?: (string | number)[] | null;
            enum?: (string | number)[] | null;
            type_name?: string | null;
            min?: number;
            max?: number;
            default?: unknown;
            enum?: (string | number)[] | null;
          };
          dynamic_inputs[k] = {
            ...meta,
            type: meta.type,
            optional: meta.optional ?? false,
            type_args: (Array.isArray(meta.type_args)
              ? meta.type_args
              : []) as TypeMetadata[],
            ...(meta.description != null && { description: meta.description }),
            values: meta.values || meta.enum
          };
        }
        updateNodeData(nodeId, {
          dynamic_properties: resolved.dynamic_properties,
          dynamic_inputs:
            Object.keys(dynamic_inputs).length > 0
              ? dynamic_inputs
              : undefined,
          dynamic_outputs,
          ...(resolved.model_id != null && {
            model_id: resolved.model_id
          })
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load schema"
        );
      } finally {
        setLoading(false);
      }
    }, [nodeId, modelInfo, updateNodeData]);

    React.useEffect(() => {
      const isResolved = !!data.model_id;
      if (
        modelInfo &&
        !isResolved &&
        !loading &&
        !error &&
        !autoLoadAttempted
      ) {
        setAutoLoadAttempted(true);
        handleLoad();
      }
    }, [
      modelInfo,
      data.model_id,
      loading,
      error,
      autoLoadAttempted,
      handleLoad
    ]);

    React.useEffect(() => {
      setAutoLoadAttempted(false);
    }, [modelInfo]);

    return (
      <Box sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        <Button
          size="small"
          variant="outlined"
          disabled={loading}
          onClick={handleLoad}
          fullWidth
        >
          {loading ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            "Load schema"
          )}
        </Button>
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

ReplicateSchemaLoader.displayName = "ReplicateSchemaLoader";
