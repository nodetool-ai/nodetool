/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Asset } from "../../stores/ApiTypes";
import { formatFileSize } from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: Theme) =>
  css({
    width: "240px",
    padding: "0.75em 1em",
    borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
    "& .info-row": {
      display: "flex",
      gap: "0.5em",
      padding: "2px 0",
      alignItems: "baseline",
      lineHeight: 1.4
    },
    "& .info-label": {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[400],
      flexShrink: 0,
      minWidth: "55px",
      textAlign: "right"
    },
    "& .info-value": {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[100],
      wordBreak: "break-all"
    },
    "& .info-thumb": {
      width: "100%",
      maxHeight: "140px",
      objectFit: "contain",
      borderRadius: "3px",
      marginBottom: "0.5em",
      backgroundColor: theme.vars.palette.grey[800]
    },
    "& .info-section": {
      borderTop: `1px solid ${theme.vars.palette.grey[700]}`,
      marginTop: "0.35em",
      paddingTop: "0.35em"
    }
  });

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

interface AssetInfoPanelProps {
  asset: Asset;
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
  const metadata = asset.metadata as Record<string, unknown> | null | undefined;

  return (
    <Box css={styles(theme)}>
      {thumbSrc && (
        <img className="info-thumb" src={thumbSrc} alt="" loading="eager" />
      )}

      <InfoRow label="Name" value={asset.name} />
      <InfoRow label="Type" value={asset.content_type} />
      {asset.size != null && asset.size > 0 && (
        <InfoRow label="Size" value={formatFileSize(asset.size)} />
      )}
      {asset.duration != null && asset.duration > 0 && (
        <InfoRow label="Duration" value={secondsToHMS(asset.duration)} />
      )}
      <InfoRow label="Created" value={formatDate(asset.created_at)} />

      {(folderName || workflowName) && (
        <div className="info-section">
          {folderName && <InfoRow label="Folder" value={folderName} />}
          {workflowName && <InfoRow label="Workflow" value={workflowName} />}
        </div>
      )}

      <div className="info-section">
        <InfoRow label="ID" value={asset.id} />
      </div>

      {metadata && Object.keys(metadata).length > 0 && (
        <div className="info-section">
          {Object.entries(metadata).map(([key, val]) => (
            <InfoRow key={key} label={key} value={String(val)} />
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
      <Typography className="info-label" component="span">
        {label}
      </Typography>
      <Typography className="info-value" component="span">
        {value}
      </Typography>
    </div>
  );
});

export default memo(AssetInfoPanel);
