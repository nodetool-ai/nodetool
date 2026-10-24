import React, { useCallback, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { Caption, ToolbarIconButton, Box, SPACING, getSpacingPx, ICON_SIZE } from "../../ui_primitives";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useNodeStoreRef } from "../../../contexts/NodeContext";
import { BASE_URL } from "../../../stores/BASE_URL";
import { resolveReplicateSchemaClient } from "../../../utils/replicateDynamicSchema";
import {
  normalizeDynamicOutputs,
  normalizeDynamicSlots
} from "../../../utils/dynamicSlots";
import { replaceDynamicSlots } from "../../../utils/replaceDynamicSlots";
import { NodeData } from "../../../stores/NodeData";

export { DYNAMIC_REPLICATE_NODE_TYPE } from "../../../constants/nodeTypes";

interface ReplicateSchemaLoaderProps {
  nodeId: string;
  data: NodeData;
}

/**
 * Replicate-specific control: small icon button to (re)load schema for ReplicateAI dynamic nodes.
 * Fetches model schema via backend and updates node dynamic_properties / dynamic_outputs.
 */
export const ReplicateSchemaLoader: React.FC<ReplicateSchemaLoaderProps> = memo(
  ({ nodeId, data }) => {
    const { t } = useTranslation();
    const nodeStore = useNodeStoreRef();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modelInfo = (
      (data.properties?.model_info as string) ??
      (data as NodeData & { model_info?: string }).model_info ??
      ""
    ).trim();

    const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
    const existingDynamicPropsRef = React.useRef(data.dynamic_properties);
    React.useEffect(() => {
      existingDynamicPropsRef.current = data.dynamic_properties;
    }, [data.dynamic_properties]);

    const handleLoad = useCallback(async (force = false) => {
      if (!modelInfo) {
        setError(t("i18n-next39.nodeEditor.schemaLoader.pasteReplicateModelFirst"));
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const resolved = await resolveReplicateSchemaClient(
          modelInfo,
          BASE_URL
        );
        const dynamic_outputs = normalizeDynamicOutputs(resolved.dynamic_outputs);
        const dynamic_inputs = normalizeDynamicSlots(resolved.dynamic_inputs);
        const dynamic_properties = force
          ? resolved.dynamic_properties
          : { ...resolved.dynamic_properties, ...(existingDynamicPropsRef.current ?? {}) };
        replaceDynamicSlots(nodeStore, nodeId, {
          dynamic_properties,
          dynamic_inputs:
            Object.keys(dynamic_inputs).length > 0 ? dynamic_inputs : undefined,
          dynamic_outputs,
          ...(resolved.model_id != null && {
            model_id: resolved.model_id
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
        // The stored model_id still belongs to the old model, so the
        // resolved check below would skip the load.
        setError(null);
        setAutoLoadAttempted(true);
        void handleLoad(true); // new model → reset to fresh defaults
        return;
      }
      // Need both model_id AND dynamic_inputs — inputs are transient (not persisted) and must be re-fetched
      const isResolved = !!data.model_id && Object.keys(data.dynamic_inputs ?? {}).length > 0;
      if (!isResolved && !error && !autoLoadAttempted) {
        setAutoLoadAttempted(true);
        void handleLoad(false); // auto-load: preserve existing values
      }
    }, [
      modelInfo,
      data.model_id,
      data.dynamic_inputs,
      loading,
      error,
      autoLoadAttempted,
      handleLoad
    ]);

    return (
      <Box sx={{ display: "inline-flex", alignItems: "center" }}>
        <ToolbarIconButton
          title={t("i18n-next39.nodeEditor.schemaLoader.reloadSchema")}
          size="small"
          loading={loading}
          onClick={() => void handleLoad(true)}
          sx={{
            padding: getSpacingPx(SPACING.xs),
            color: "var(--palette-text-secondary)",
            "&:hover": {
              color: "var(--palette-text-primary)",
              backgroundColor: "var(--palette-action-hover)"
            }
          }}
        >
          <RefreshIcon sx={{ fontSize: ICON_SIZE.sm }} />
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
  }
);

ReplicateSchemaLoader.displayName = "ReplicateSchemaLoader";
