/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
  IconButton,
  Alert,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { useNodeResultHistory } from "../../hooks/nodes/useNodeResultHistory";
import { HistoricalResult } from "../../stores/NodeResultHistoryStore";
import OutputRenderer from "./OutputRenderer";

interface NodeHistoryPanelProps {
  workflowId: string;
  nodeId: string;
  nodeName?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * NodeHistoryPanel displays the execution history for a specific node.
 * 
 * Features:
 * - Shows session history (accumulated results from current session)
 * - Option to load persistent asset-based history
 * - Timestamp and status for each result
 * - Preview of each historical result
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

  const {
    sessionHistory,
    historyCount,
    clearHistory,
    assetHistory,
    isLoadingAssets,
    loadAssetHistory
  } = useNodeResultHistory(workflowId, nodeId);

  const handleLoadAssetHistory = useCallback(() => {
    setShowAssetHistory(true);
    loadAssetHistory();
  }, [loadAssetHistory]);

  const handleClearHistory = useCallback(() => {
    if (
      window.confirm(
        "Are you sure you want to clear the history for this node?"
      )
    ) {
      clearHistory();
    }
  }, [clearHistory]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "error":
      case "failed":
        return "error";
      case "running":
        return "info";
      default:
        return "default";
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: "80vh",
          backgroundColor: theme.vars.palette.c_editor_bg_color
        }
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon />
          <Typography variant="h6">
            {nodeName ? `${nodeName} - History` : "Node History"}
          </Typography>
          <Chip label={`${historyCount} results`} size="small" />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* Session History */}
        {sessionHistory.length > 0 ? (
          <List sx={{ p: 0 }}>
            {sessionHistory.map((item: HistoricalResult, index: number) => (
              <React.Fragment key={`${item.timestamp}-${index}`}>
                <ListItem
                  sx={{
                    flexDirection: "column",
                    alignItems: "stretch",
                    py: 2
                  }}
                >
                  {/* Header */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 1
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(item.timestamp)}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {item.jobId && (
                        <Chip
                          label={`Job: ${item.jobId.slice(0, 8)}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={item.status}
                        size="small"
                        color={getStatusColor(item.status) as any}
                      />
                    </Box>
                  </Box>

                  {/* Result Preview */}
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: theme.vars.palette.background.paper,
                      borderRadius: 1,
                      maxHeight: "200px",
                      overflow: "auto"
                    }}
                  >
                    <OutputRenderer
                      key={`output-${item.timestamp}-${index}`}
                      result={item.result}
                      nodeId={nodeId}
                    />
                  </Box>
                </ListItem>
                {index < sessionHistory.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
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
              sx={{ fontSize: 64, color: "text.secondary", mb: 2, opacity: 0.5 }}
            />
            <Typography variant="body1" color="text.secondary">
              No history available for this node
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1 }}
            >
              Results will appear here as you run the workflow
            </Typography>
          </Box>
        )}

        {/* Asset History Section */}
        {showAssetHistory && (
          <Box sx={{ p: 2, borderTop: `1px solid ${theme.vars.palette.divider}` }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
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

      <DialogActions
        sx={{
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          p: 2
        }}
      >
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
    </Dialog>
  );
};

export default NodeHistoryPanel;
