import React, { useCallback, useState, memo } from "react";
import { Box } from "@mui/material";
import { Tooltip, Caption, LoadingSpinner, ToolbarIconButton } from "../../ui_primitives";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useNodes } from "../../../contexts/NodeContext";
import { BASE_URL } from "../../../stores/BASE_URL";
import { TypeMetadata } from "../../../stores/ApiTypes";
import { resolveKieSchemaClient } from "../../../utils/kieDynamicSchema";
import { NodeData } from "../../../stores/NodeData";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

export const DYNAMIC_KIE_NODE_TYPE = "kie.dynamic_schema.KieAI";

interface KieSchemaLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Kie.ai-specific control: small icon button to (re)load schema for KieAI dynamic nodes.
 * Parses pasted API docs via backend and updates node dynamic_properties / dynamic_outputs.
 */
export const KieSchemaLoader: React.FC<KieSchemaLoaderProps> = memo(
  ({ nodeId, data }) => {
    const updateNodeData = useNodes((state) => state.updateNodeData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modelInfo = (
      (data.properties?.model_info as string) ??
      (data.dynamic_properties?.model_info as string) ??
      (data as NodeData & { model_info?: string }).model_info ??
      ""
    ).trim();

    const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
    const previousModelInfoRef = React.useRef(modelInfo);
    const lastAutoLoadedModelInfoRef = React.useRef<string | null>(null);
    const existingDynamicPropsRef = React.useRef(data.dynamic_properties);
    React.useEffect(() => {
      existingDynamicPropsRef.current = data.dynamic_properties;
    }, [data.dynamic_properties]);
    // Need both model_id AND dynamic_inputs — inputs are transient (not persisted) and must be re-fetched
    const hasResolvedSchema =
      !!data.model_id && Object.keys(data.dynamic_inputs ?? {}).length > 0;

    const handleLoad = useCallback(async (force = false) => {
      if (!modelInfo) {
        setError("Paste kie.ai API documentation first.");
        return;
      }
      if (!force && lastAutoLoadedModelInfoRef.current === modelInfo) {
        return;
      }
      lastAutoLoadedModelInfoRef.current = modelInfo;
      setError(null);
      setLoading(true);
      try {
        const resolved = await resolveKieSchemaClient(modelInfo, BASE_URL);
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
          dynamic_inputs[k] = {
            ...meta,
            type: meta.type,
            optional: meta.optional ?? false,
            type_args: (Array.isArray(meta.type_args)
              ? meta.type_args
              : []) as TypeMetadata[],
            ...(meta.description != null && { description: meta.description }),
            values: meta.values || (meta as typeof meta & { enum?: (string | number)[] }).enum
          };
        }
        // When force-reloading use fresh defaults; on auto-load (reload) preserve user values
        const dynamic_properties = force
          ? resolved.dynamic_properties
          : { ...resolved.dynamic_properties, ...(existingDynamicPropsRef.current ?? {}) };
        updateNodeData(nodeId, {
          dynamic_properties,
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
      if (!modelInfo) {
        previousModelInfoRef.current = modelInfo;
        lastAutoLoadedModelInfoRef.current = null;
        setAutoLoadAttempted(false);
        setError(null);
        return;
      }

      if (loading) {
        return;
      }

      const modelInfoChanged = previousModelInfoRef.current !== modelInfo;
      previousModelInfoRef.current = modelInfo;

      if (modelInfoChanged) {
        lastAutoLoadedModelInfoRef.current = null;
        setError(null);
        setAutoLoadAttempted(true);
        void handleLoad(true); // new model → reset to fresh defaults
        return;
      }

      if (!hasResolvedSchema && !error && !autoLoadAttempted) {
        setAutoLoadAttempted(true);
        void handleLoad();
      }
    }, [
      modelInfo,
      hasResolvedSchema,
      loading,
      error,
      autoLoadAttempted,
      handleLoad
    ]);

    return (
      <Box sx={{ display: "inline-flex", alignItems: "center" }}>
        <Tooltip title="Reload Schema" arrow delay={TOOLTIP_ENTER_DELAY}>
          <ToolbarIconButton
            title="Reload Schema"
            size="small"
            disabled={loading}
            onClick={() => void handleLoad(true)}
            sx={{
              padding: "4px",
              color: "rgba(255, 255, 255, 0.5)",
              "&:hover": {
                color: "rgba(255, 255, 255, 0.9)",
                backgroundColor: "rgba(255, 255, 255, 0.08)"
              }
            }}
          >
            {loading ? (
              <LoadingSpinner size="small" />
            ) : (
              <RefreshIcon sx={{ fontSize: 16 }} />
            )}
          </ToolbarIconButton>
        </Tooltip>
        {error && (
          <Caption
            color="error"
            sx={{
              position: "absolute",
              right: 0,
              top: 0,
              textAlign: "right",
              transform: "translateX(120%)",
              whiteSpace: "nowrap"
            }}
          >
            {error}
          </Caption>
        )}
      </Box>
    );
  }
);

KieSchemaLoader.displayName = "KieSchemaLoader";
