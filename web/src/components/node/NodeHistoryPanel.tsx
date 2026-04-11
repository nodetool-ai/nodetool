/** @jsxImportSource @emotion/react */
import React, { memo, useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack
} from "@mui/material";
import { Text, Caption, FlexColumn, Chip, EditorButton, LoadingSpinner, AlertBanner, FlexRow } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { CloseButton } from "../ui_primitives";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
import { HistoricalResult } from "../../stores/NodeResultHistoryStore";
import PreviewImageGrid, { ImageSource } from "./PreviewImageGrid";
import OutputRenderer from "./OutputRenderer";
import { Divider } from "../ui_primitives";

/**
 * Unwrap a history result to find the displayable value.
 * Single-key objects get unwrapped; multi-key picks the first typed value.
 */
function unwrapHistoryResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const entries = Object.entries(result as Record<string, unknown>);
  if (entries.length === 1) return entries[0][1];
  const typed = entries.find(
    ([, v]) => v && typeof v === "object" && "type" in (v as Record<string, unknown>)
  );
  if (typed) return typed[1];
  return result;
}

interface NodeHistoryPanelProps {
  workflowId: string;
  nodeId: string;
  nodeName?: string;
  open: boolean;
  onClose: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Text>{message}</Text>
      </DialogContent>
      <DialogActions>
        <EditorButton onClick={onCancel}>Cancel</EditorButton>
        <EditorButton onClick={onConfirm} color="error" variant="contained">
          Confirm
        </EditorButton>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Extract image URIs from a result object.
 * Handles various result formats: single images, arrays, nested objects.
 */
function extractImageSources(result: any): ImageSource[] {
  if (!result) {
    return [];
  }

  const images: ImageSource[] = [];

  // Handle array of results
  if (Array.isArray(result)) {
    result.forEach((item) => {
      images.push(...extractImageSources(item));
    });
    return images;
  }

  // Handle single image/asset with uri
  if (result.type === "image" && result.uri) {
    images.push(result.uri);
    return images;
  }

  // Handle asset with uri
  if (result.uri && typeof result.uri === "string") {
    // Check if it looks like an image URI
    const uri = result.uri.toLowerCase();
    if (
      uri.endsWith(".png") ||
      uri.endsWith(".jpg") ||
      uri.endsWith(".jpeg") ||
      uri.endsWith(".gif") ||
      uri.endsWith(".webp") ||
      uri.includes("/image/") ||
      result.content_type?.startsWith("image/")
    ) {
      images.push(result.uri);
      return images;
    }
  }

  // Handle base64 data
  if (result.data && result.data instanceof Uint8Array) {
    images.push(result.data);
    return images;
  }

  // Handle nested output property
  if (result.output) {
    images.push(...extractImageSources(result.output));
  }

  // Handle nested result property
  if (result.result) {
    images.push(...extractImageSources(result.result));
  }

  return images;
}

/**
 * NodeHistoryPanel displays the execution history for a specific node.
 * 
 * Features:
 * - Shows session history as image tiles (accumulated results from current session)
 * - Option to load persistent asset-based history
 * - Clear history action
 */
const NodeHistoryPanel: React.FC<NodeHistoryPanelProps> = ({
  workflowId,
  nodeId,
  nodeName,
  open,
  onClose
}) => {
  const theme = useTheme();
  const [showAssetHistory, setShowAssetHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const {
    sessionHistory,
    historyCount,
    clearHistory,
    assetHistory,
    isLoadingAssets,
    loadAssetHistory
  } = useNodeResultHistory(workflowId, nodeId);

  // Extract all images from session history
  const allImages = useMemo(() => {
    const images: ImageSource[] = [];
    sessionHistory.forEach((item: HistoricalResult) => {
      images.push(...extractImageSources(item.result));
    });
    return images;
  }, [sessionHistory]);

  const handleLoadAssetHistory = useCallback(() => {
    setShowAssetHistory(true);
    loadAssetHistory();
  }, [loadAssetHistory]);

  const handleClearHistory = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const handleConfirmClearHistory = useCallback(() => {
    clearHistory();
    setShowClearConfirm(false);
  }, [clearHistory]);

  const handleCancelClearHistory = useCallback(() => {
    setShowClearConfirm(false);
  }, []);

  // Double-click is now handled internally by PreviewImageGrid
  // which opens the image in AssetViewer

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
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" width="100%">
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

      <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Session History as Image Grid */}
        {allImages.length > 0 ? (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <PreviewImageGrid
              images={allImages}
              itemSize={128}
              gap={8}
              showActions={true}
            />
          </div>
        ) : sessionHistory.length > 0 ? (
          <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
            {sessionHistory.map((item: HistoricalResult, index: number) => {
              const value = unwrapHistoryResult(item.result);
              return (
                <div key={`history-${item.timestamp}-${index}`}>
                  {index > 0 && <Divider sx={{ my: 1 }} />}
                  <Caption size="tiny" sx={{ opacity: 0.5, mb: 0.5 }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Caption>
                  <OutputRenderer value={value} />
                </div>
              );
            })}
          </div>
        ) : (
          <FlexColumn
            align="center"
            justify="center"
            fullHeight
            sx={{ p: 4 }}
          >
            <HistoryIcon
              sx={{ fontSize: 64, color: theme.vars.palette.text.secondary, mb: 2, opacity: 0.5 }}
            />
            <Text color="secondary">
              No history available for this node
            </Text>
            <Caption
              sx={{ mt: 1 }}
            >
              Results will appear here as you run the workflow
            </Caption>
          </FlexColumn>
        )}

        {/* Asset History Section */}
        {showAssetHistory && (
          <div style={{ padding: 16, borderTop: `1px solid ${theme.vars.palette.divider}` }}>
            <Text size="small" weight={500} sx={{ mb: 1 }}>
              Persistent Asset History
            </Text>
            {isLoadingAssets ? (
              <FlexRow justify="center" sx={{ p: 2 }}>
                <LoadingSpinner size={24} />
              </FlexRow>
            ) : assetHistory && assetHistory.length > 0 ? (
              <AlertBanner severity="info" sx={{ mb: 1 }}>
                Found {assetHistory.length} asset(s) created by this node
              </AlertBanner>
            ) : (
              <AlertBanner severity="info">
                No persistent assets found for this node
              </AlertBanner>
            )}
          </div>
        )}
      </DialogContent>

      <DialogActions>
        {!showAssetHistory && (
          <EditorButton
            startIcon={<CloudDownloadIcon />}
            onClick={handleLoadAssetHistory}
            disabled={isLoadingAssets}
          >
            Load Persistent History
          </EditorButton>
        )}
        <EditorButton
          startIcon={<DeleteIcon />}
          onClick={handleClearHistory}
          disabled={historyCount === 0}
          color="error"
        >
          Clear History
        </EditorButton>
        <EditorButton onClick={onClose}>Close</EditorButton>
      </DialogActions>
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear History"
        message="Are you sure you want to clear the history for this node?"
        onConfirm={handleConfirmClearHistory}
        onCancel={handleCancelClearHistory}
      />
    </Dialog>
  );
};

export default memo(NodeHistoryPanel);
