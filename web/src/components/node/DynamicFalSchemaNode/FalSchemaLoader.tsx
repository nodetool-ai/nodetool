import React, { useCallback, useState, memo } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useNodes } from "../../../contexts/NodeContext";
import { BASE_URL } from "../../../stores/BASE_URL";
import { TypeMetadata } from "../../../stores/ApiTypes";
import { resolveFalSchemaClient } from "../../../utils/falDynamicSchema";
import { NodeData } from "../../../stores/NodeData";

export const DYNAMIC_FAL_NODE_TYPE = "fal.dynamic_schema.FalAI";

interface FalSchemaLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * FAL-specific control: "Load schema" button for FalAI nodes.
 * Resolves schema via backend and updates node dynamic_properties / dynamic_outputs.
 */
export const FalSchemaLoader: React.FC<FalSchemaLoaderProps> = memo(({
  nodeId,
  data
}) => {
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelInfo =
    ((data.properties?.model_info as string) ??
      (data as NodeData & { model_info?: string }).model_info ??
      "").trim();

  // Auto-load once if modelInfo is present but schema is not (fully) loaded
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);

  const handleLoad = useCallback(async () => {
    if (!modelInfo) {
      setError("Node definition not found.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const resolved = await resolveFalSchemaClient(modelInfo, BASE_URL);
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
          type_name?: string | null;
          min?: number;
          max?: number;
          default?: unknown;
        };
        const effectiveMin =
          k === "seed" && meta.default === -1
            ? (typeof meta.min === "number" ? Math.min(meta.min, -1) : -1)
            : meta.min;
        dynamic_inputs[k] = {
          ...meta,
          type: meta.type,
          optional: meta.optional ?? false,
          type_args: (Array.isArray(meta.type_args)
            ? meta.type_args
            : []) as TypeMetadata[],
          ...(meta.description != null && { description: meta.description }),
          ...(effectiveMin != null && { min: effectiveMin }),
          values: meta.values || (meta as any).enum,
        };
      }
      updateNodeData(nodeId, {
        dynamic_properties: resolved.dynamic_properties,
        dynamic_inputs:
          Object.keys(dynamic_inputs).length > 0 ? dynamic_inputs : undefined,
        dynamic_outputs,
        ...(resolved.endpoint_id != null && {
          endpoint_id: resolved.endpoint_id
        })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schema");
    } finally {
      setLoading(false);
    }
  }, [nodeId, modelInfo, updateNodeData]);

  React.useEffect(() => {
    // If we have an endpoint_id, it was successfully resolved via backend
    const isResolved = !!data.endpoint_id;
    if (modelInfo && !isResolved && !loading && !error && !autoLoadAttempted) {
      setAutoLoadAttempted(true);
      handleLoad();
    }
  }, [modelInfo, data.endpoint_id, loading, error, autoLoadAttempted, handleLoad]);

  // Reset attempt if modelInfo changes
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
});

FalSchemaLoader.displayName = "FalSchemaLoader";
