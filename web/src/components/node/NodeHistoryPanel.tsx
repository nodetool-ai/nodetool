/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Stack
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import HistoryIcon from "@mui/icons-material/History";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { CloseButton } from "../ui_primitives";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
import { HistoricalResult } from "../../stores/NodeResultHistoryStore";
import PreviewImageGrid, { ImageSource } from "./PreviewImageGrid";

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
        <Typography>{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Confirm
        </Button>
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
            <Typography variant="h6" component="h6">
              {nodeName ? `${nodeName} - History` : "Node History"}
            </Typography>
            <Chip size="small" label={`${historyCount}`} />
          </Stack>
          <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Session History as Image Grid */}
        {allImages.length > 0 ? (
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <PreviewImageGrid
              images={allImages}
              itemSize={128}
              gap={8}
              showActions={true}
            />
          </Box>
        ) : sessionHistory.length > 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              p: 4
            }}
          >
            <Typography variant="body1" sx={{ color: theme.vars.palette.text.secondary }}>
              {historyCount} result(s) available, but no images to display
            </Typography>
            <Typography
              variant="caption"
              sx={{ mt: 1, color: theme.vars.palette.text.secondary }}
            >
              Only image outputs are shown as tiles
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              p: 4
            }}
          >
            <HistoryIcon
              sx={{ fontSize: 64, color: theme.vars.palette.text.secondary, mb: 2, opacity: 0.5 }}
            />
            <Typography variant="body1" sx={{ color: theme.vars.palette.text.secondary }}>
              No history available for this node
            </Typography>
            <Typography
              variant="caption"
              sx={{ mt: 1, color: theme.vars.palette.text.secondary }}
            >
              Results will appear here as you run the workflow
            </Typography>
          </Box>
        )}

        {/* Asset History Section */}
        {showAssetHistory && (
          <Box sx={{ p: 2, borderTop: `1px solid ${theme.vars.palette.divider}` }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: theme.vars.palette.text.primary }}>
              Persistent Asset History
            </Typography>
            {isLoadingAssets ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : assetHistory && assetHistory.length > 0 ? (
              <Alert severity="info" sx={{ mb: 1 }}>
                Found {assetHistory.length} asset(s) created by this node
              </Alert>
            ) : (
              <Alert severity="info">
                No persistent assets found for this node
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {!showAssetHistory && (
          <Button
            startIcon={<CloudDownloadIcon />}
            onClick={handleLoadAssetHistory}
            disabled={isLoadingAssets}
          >
            Load Persistent History
          </Button>
        )}
        <Button
          startIcon={<DeleteIcon />}
          onClick={handleClearHistory}
          disabled={historyCount === 0}
          color="error"
        >
          Clear History
        </Button>
        <Button onClick={onClose}>Close</Button>
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

export default NodeHistoryPanel;
