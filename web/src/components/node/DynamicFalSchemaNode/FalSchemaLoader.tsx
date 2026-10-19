import React, { useCallback, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { Caption, LoadingSpinner, ToolbarIconButton, Box, SPACING, getSpacingPx, ICON_SIZE } from "../../ui_primitives";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useNodeStoreRef } from "../../../contexts/NodeContext";
import { BASE_URL } from "../../../stores/BASE_URL";
import { TypeMetadata } from "../../../stores/ApiTypes";
import { resolveFalSchemaClient } from "../../../utils/falDynamicSchema";
import { normalizeDynamicSlots } from "../../../utils/dynamicSlots";
import { replaceDynamicSlots } from "../../../utils/replaceDynamicSlots";
import { NodeData } from "../../../stores/NodeData";
import { isNumber } from "../../../utils/typePredicates";

export { DYNAMIC_FAL_NODE_TYPE } from "../../../constants/nodeTypes";

interface FalSchemaLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * FAL-specific control: small icon button to (re)load schema for FalAI nodes.
 * Resolves schema via backend and updates node dynamic_properties / dynamic_outputs.
 */
export const FalSchemaLoader: React.FC<FalSchemaLoaderProps> = memo(({
  nodeId,
  data
}) => {
  const { t } = useTranslation();
  const nodeStore = useNodeStoreRef();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelInfo =
    ((data.properties?.model_info as string) ??
      (data as NodeData & { model_info?: string }).model_info ??
      "").trim();

  // Auto-load once if modelInfo is present but schema is not (fully) loaded
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  const existingDynamicPropsRef = React.useRef(data.dynamic_properties);
  React.useEffect(() => {
    existingDynamicPropsRef.current = data.dynamic_properties;
  }, [data.dynamic_properties]);

  const handleLoad = useCallback(async (force = false) => {
    if (!modelInfo) {
      setError(t("i18n-next39.nodeEditor.schemaLoader.nodeDefinitionNotFound"));
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
      // Resolver-flat shape; normalized to slot declarations before it lands
      // in the store (see `utils/dynamicSlots.ts`).
      const dynamic_inputs: Record<string, Record<string, unknown>> = {};
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
            ? (isNumber(meta.min) ? Math.min(meta.min, -1) : -1)
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
          values: meta.values || (meta as typeof meta & { enum?: (string | number)[] }).enum,
        };
      }
      const dynamic_properties = force
        ? resolved.dynamic_properties
        : { ...resolved.dynamic_properties, ...(existingDynamicPropsRef.current ?? {}) };
      replaceDynamicSlots(nodeStore, nodeId, {
        dynamic_properties,
        dynamic_inputs:
          Object.keys(dynamic_inputs).length > 0
            ? normalizeDynamicSlots(dynamic_inputs)
            : undefined,
        dynamic_outputs,
        ...(resolved.endpoint_id != null && {
          endpoint_id: resolved.endpoint_id
        })
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("i18n-next39.nodeEditor.schemaLoader.failedToLoadSchema")
      );
    } finally {
      setLoading(false);
    }
  }, [nodeId, modelInfo, nodeStore, t]);

  const previousModelInfoRef = React.useRef(modelInfo);
  React.useEffect(() => {
    if (!modelInfo) {
      previousModelInfoRef.current = modelInfo;
      setAutoLoadAttempted(false);
      return;
    }
    if (loading) {
      return;
    }
    const modelInfoChanged = previousModelInfoRef.current !== modelInfo;
    previousModelInfoRef.current = modelInfo;
    if (modelInfoChanged) {
      // The stored endpoint_id still belongs to the old model, so the
      // resolved check below would skip the load.
      setError(null);
      setAutoLoadAttempted(true);
      void handleLoad(true); // new model → reset to fresh defaults
      return;
    }
    // Need both endpoint_id AND dynamic_inputs — inputs are transient (not persisted) and must be re-fetched
    const isResolved = !!data.endpoint_id && Object.keys(data.dynamic_inputs ?? {}).length > 0;
    if (!isResolved && !error && !autoLoadAttempted) {
      setAutoLoadAttempted(true);
      void handleLoad(false); // auto-load: preserve existing values
    }
  }, [modelInfo, data.endpoint_id, data.dynamic_inputs, loading, error, autoLoadAttempted, handleLoad]);

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center" }}>
      <ToolbarIconButton
        title={t("i18n-next39.nodeEditor.schemaLoader.reloadSchema")}
        size="small"
        disabled={loading}
        onClick={() => void handleLoad(true)}
        sx={{
          padding: getSpacingPx(SPACING.xs),
          color: "var(--palette-text-secondary)",
          "&:hover": {
            color: "var(--palette-text-primary)",
            backgroundColor: "var(--palette-c_overlay)"
          }
        }}
      >
        {loading ? (
          <LoadingSpinner size="small" />
        ) : (
          <RefreshIcon sx={{ fontSize: ICON_SIZE.sm }} />
        )}
      </ToolbarIconButton>
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
});

FalSchemaLoader.displayName = "FalSchemaLoader";
