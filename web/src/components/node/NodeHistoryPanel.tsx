/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import {
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack
} from "@mui/material";
import {
  Text,
  Caption,
  FlexColumn,
  Chip,
  EditorButton,
  LoadingSpinner,
  FlexRow,
  Dialog
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import { CloseButton } from "../ui_primitives";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
import type { Asset } from "../../stores/ApiTypes";
import PreviewImageGrid, { ImageSource } from "./PreviewImageGrid";

interface NodeHistoryPanelProps {
  workflowId: string;
  nodeId: string;
  nodeName?: string;
  open: boolean;
  onClose: () => void;
}

const isImageAsset = (asset: Asset) =>
  typeof asset.content_type === "string" &&
  asset.content_type.startsWith("image/");

const assetToImageSource = (asset: Asset): ImageSource | undefined => {
  const url = asset.thumb_url || asset.get_url;
  return url || undefined;
};

/**
 * NodeHistoryPanel — displays a node's persisted output history.
 *
 * Backed entirely by the assets table (filtered by node_id). Generative
 * nodes auto-save their outputs to assets on completion, so this dialog
 * is the canonical view of "what did this node produce across runs."
 */
const NodeHistoryPanel: React.FC<NodeHistoryPanelProps> = ({
  workflowId,
  nodeId,
  nodeName,
  open,
  onClose
}) => {
  const theme = useTheme();
  const { assetHistory, historyCount, isLoading } = useNodeResultHistory(
    workflowId,
    nodeId
  );

  const imageSources = useMemo<ImageSource[]>(() => {
    return assetHistory
      .filter(isImageAsset)
      .map(assetToImageSource)
      .filter((src): src is ImageSource => Boolean(src));
  }, [assetHistory]);

  const nonImageAssets = useMemo(
    () => assetHistory.filter((asset) => !isImageAsset(asset)),
    [assetHistory]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        },
        paper: {
          style: {
            maxWidth: "950px",
            width: "950px",
            height: "80vh",
            border: `1px solid ${theme.vars.palette.grey[700]}`,
            borderRadius: theme.vars.rounded.dialog,
            background: theme.vars.palette.glass.backgroundDialogContent
          }
        }
      }}
    >
      <DialogTitle className="dialog-title">
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          width="100%"
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <HistoryIcon />
            <Text size="normal" weight={600} component="h6">
              {nodeName ? `${nodeName} - History` : "Node History"}
            </Text>
            <Chip size="small" label={`${historyCount}`} />
          </Stack>
          <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
        </Stack>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          p: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {isLoading ? (
          <FlexRow justify="center" align="center" sx={{ p: 4, flex: 1 }}>
            <LoadingSpinner size="medium" />
          </FlexRow>
        ) : imageSources.length > 0 ? (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <PreviewImageGrid
              images={imageSources}
              itemSize={128}
              gap={8}
              showActions={true}
            />
          </div>
        ) : nonImageAssets.length > 0 ? (
          <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
            {nonImageAssets.map((asset) => (
              <FlexRow
                key={asset.id}
                sx={{
                  py: 0.5,
                  borderBottom: `1px solid ${theme.vars.palette.divider}`
                }}
                justify="space-between"
              >
                <Text size="small">{asset.name || asset.id}</Text>
                <Caption size="tiny" sx={{ opacity: 0.6 }}>
                  {asset.created_at
                    ? new Date(asset.created_at).toLocaleString()
                    : ""}
                </Caption>
              </FlexRow>
            ))}
          </div>
        ) : (
          <FlexColumn align="center" justify="center" fullHeight sx={{ p: 4 }}>
            <HistoryIcon
              sx={{
                fontSize: 64,
                color: theme.vars.palette.text.secondary,
                mb: 2,
                opacity: 0.5
              }}
            />
            <Text color="secondary">No saved outputs for this node</Text>
            <Caption sx={{ mt: 1 }}>
              Results appear here once a run completes
            </Caption>
          </FlexColumn>
        )}
      </DialogContent>

      <DialogActions>
        <EditorButton onClick={onClose}>Close</EditorButton>
      </DialogActions>
    </Dialog>
  );
};

export default memo(NodeHistoryPanel);
