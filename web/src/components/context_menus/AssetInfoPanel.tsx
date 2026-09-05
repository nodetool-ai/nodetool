/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo } from "react";
import {
  Text,
  Box,
  CopyButton,
  FlexRow,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import type { Asset } from "../../stores/ApiTypes";
import {
  formatContentType,
  formatDateTime,
  formatFileSize
} from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

/** Metadata keys rendered by their own section, not by the raw dump. */
const RENDERED_METADATA_KEYS = new Set(["prompt", "generation"]);

const styles = (theme: Theme) =>
  css({
    width: "240px",
    padding: "0.75em 1em",
    borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
    "& .info-row": {
      display: "flex",
      gap: "0.5em",
      padding: `${getSpacingPx(SPACING.micro)} 0`,
      alignItems: "baseline",
      lineHeight: 1.4
    },
    "& .info-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400],
      flexShrink: 0,
      minWidth: "55px",
      textAlign: "right"
    },
    "& .info-value": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[100],
      wordBreak: "break-all"
    },
    "& .info-thumb": {
      width: "100%",
      maxHeight: "140px",
      objectFit: "contain",
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: "0.5em",
      backgroundColor: theme.vars.palette.grey[800]
    },
    "& .info-section": {
      borderTop: `1px solid ${theme.vars.palette.grey[700]}`,
      marginTop: "0.35em",
      paddingTop: "0.35em"
    },
    "& .info-section-title": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400]
    },
    "& .info-prompt": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[100],
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "12em",
      overflowY: "auto"
    }
  });

interface AssetInfoPanelProps {
  asset: Asset;
}

/** Render one setting value; arrays join, so no `[object Object]` reaches the UI. */
function formatSetting(value: string | number | boolean | Array<string | number | boolean>) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** A metadata value the sections above do not own; objects stay readable. */
function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

/** `negative_prompt` → `Negative prompt`. */
function settingLabel(key: string) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const AssetInfoPanel: React.FC<AssetInfoPanelProps> = ({ asset }) => {
  const theme = useTheme();
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);

  const folderName = useMemo(() => {
    if (!asset.parent_id) {
      return null;
    }
    if (currentFolder && currentFolder.id === asset.parent_id) {
      return currentFolder.name;
    }
    return asset.parent_id;
  }, [asset.parent_id, currentFolder]);

  const workflowName = useMemo(() => {
    if (!asset.workflow_id) {
      return null;
    }
    const wf = getWorkflow(asset.workflow_id);
    return wf?.name || asset.workflow_id;
  }, [asset.workflow_id, getWorkflow]);

  const isImage = asset.content_type?.startsWith("image/");
  const thumbSrc = asset.thumb_url || (isImage ? asset.get_url : null);
  const metadata = asset.metadata;

  // The prompt and settings the asset was generated with — kept on the asset so
  // the same recipe is at hand when someone wants another variant of it.
  const { prompt, generation } = useMemo(
    () => readAssetGenerationMetadata(metadata),
    [metadata]
  );
  const settings = generation?.params;
  const otherMetadata = useMemo(
    () =>
      Object.entries(metadata ?? {}).filter(
        ([key]) => !RENDERED_METADATA_KEYS.has(key)
      ),
    [metadata]
  );

  return (
    <Box css={styles(theme)}>
      {thumbSrc && (
        <img className="info-thumb" src={thumbSrc} alt="" loading="eager" />
      )}

      <InfoRow label="Name" value={asset.name} />
      <InfoRow
        label="Type"
        value={asset.content_type ? formatContentType(asset.content_type) : null}
      />
      {asset.size != null && asset.size > 0 && (
        <InfoRow label="Size" value={formatFileSize(asset.size)} />
      )}
      {asset.duration != null && asset.duration > 0 && (
        <InfoRow label="Duration" value={secondsToHMS(asset.duration)} />
      )}
      <InfoRow label="Created" value={formatDateTime(asset.created_at)} />

      {(folderName || workflowName) && (
        <div className="info-section">
          {folderName && <InfoRow label="Folder" value={folderName} />}
          {workflowName && <InfoRow label="Workflow" value={workflowName} />}
        </div>
      )}

      {prompt && (
        <div className="info-section">
          <FlexRow align="center" justify="space-between">
            <Text className="info-section-title" component="span">
              Prompt
            </Text>
            <CopyButton value={prompt} tooltip="Copy prompt" buttonSize="small" />
          </FlexRow>
          <Text className="info-prompt" component="p">
            {prompt}
          </Text>
        </div>
      )}

      {generation && (
        <div className="info-section">
          <InfoRow label="Model" value={generation.model_name ?? generation.model} />
          <InfoRow label="Provider" value={generation.provider} />
          <InfoRow label="Node" value={generation.node_type} />
          <InfoRow label="Task" value={generation.capability} />
          {settings &&
            Object.entries(settings).map(([key, value]) => (
              <InfoRow
                key={key}
                label={settingLabel(key)}
                value={formatSetting(value)}
              />
            ))}
        </div>
      )}

      <div className="info-section">
        <InfoRow label="ID" value={asset.id} />
      </div>

      {otherMetadata.length > 0 && (
        <div className="info-section">
          {otherMetadata.map(([key, val]) => (
            <InfoRow key={key} label={key} value={formatMetadataValue(val)} />
          ))}
        </div>
      )}
    </Box>
  );
};

const InfoRow = memo(function InfoRow({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="info-row">
      <Text className="info-label" component="span">
        {label}
      </Text>
      <Text className="info-value" component="span">
        {value}
      </Text>
    </div>
  );
});

export default memo(AssetInfoPanel);
