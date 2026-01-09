import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Delete as DeleteIcon,
  Timeline as TimelineIcon,
} from "@mui/icons-material";
import usePerformanceStore, {
  NodePerformanceMetrics,
  WorkflowPerformanceSummary,
} from "../../stores/PerformanceStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
};

const getDurationColor = (duration: number): string => {
  if (duration < 100) {
    return "#4caf50";
  }
  if (duration < 1000) {
    return "#ff9800";
  }
  return "#f44336";
};

const NodePerformanceItem: React.FC<{
  node: NodePerformanceMetrics;
  isActive: boolean;
  onClick: () => void;
}> = ({ node, isActive, onClick }) => {
  const duration = node.duration || 0;

  return (
    <ListItem
      sx={{
        bgcolor: isActive ? "action.hover" : "transparent",
        borderRadius: 1,
        mb: 0.5,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.selected" },
      }}
      onClick={onClick}
    >
      <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor:
              node.status === "completed"
                ? "#4caf50"
                : node.status === "error"
                  ? "#f44336"
                  : node.status === "running"
                    ? "#ff9800"
                    : "#9e9e9e",
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap title={node.nodeTitle}>
            {node.nodeTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {node.nodeType}
          </Typography>
        </Box>
        {duration > 0 && (
          <Box sx={{ textAlign: "right" }}>
            <Typography
              variant="body2"
              sx={{ color: getDurationColor(duration), fontWeight: "medium" }}
            >
              {formatDuration(duration)}
            </Typography>
            {node.retryCount > 0 && (
              <Chip
                size="small"
                label={`${node.retryCount} retries`}
                sx={{ height: 16, fontSize: "0.6rem" }}
                color="warning"
              />
            )}
          </Box>
        )}
        {node.status === "running" && (
          <CircularProgress size={16} sx={{ ml: 1 }} />
        )}
      </Box>
    </ListItem>
  );
};

const PerformanceSummaryCard: React.FC<{
  summary: WorkflowPerformanceSummary;
}> = ({ summary }) => {
  const successRate =
    summary.nodeCount > 0
      ? ((summary.completedCount / summary.nodeCount) * 100).toFixed(0)
      : 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        bgcolor: "background.default",
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <SpeedIcon sx={{ mr: 1, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontWeight: "medium" }}>
          {summary.workflowName}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={`${successRate}% success`}
          color={Number(successRate) >= 80 ? "success" : "warning"}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 2,
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            {formatDuration(summary.totalDuration)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Time
          </Typography>
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            {summary.completedCount}/{summary.nodeCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Nodes Done
          </Typography>
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            {formatDuration(summary.averageNodeDuration)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Avg per Node
          </Typography>
        </Box>
      </Box>

      {summary.bottlenecks.length > 0 && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            <TrendingUpIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
            Bottlenecks
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {summary.bottlenecks.map((node) => (
              <Chip
                key={node.nodeId}
                size="small"
                label={`${node.nodeTitle}: ${formatDuration(node.duration || 0)}`}
                sx={{ bgcolor: "error.dark", color: "error.contrastText" }}
              />
            ))}
          </Box>
        </Box>
      )}

      {summary.fastestNode && summary.slowestNode && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Tooltip title={summary.fastestNode.nodeTitle}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <TrendingDownIcon sx={{ fontSize: 14, color: "success.main", mr: 0.5 }} />
                <Typography variant="caption" color="text.secondary">
                  Fastest: {formatDuration(summary.fastestNode.duration || 0)}
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title={summary.slowestNode.nodeTitle}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  Slowest: {formatDuration(summary.slowestNode.duration || 0)}
                </Typography>
                <TrendingUpIcon sx={{ fontSize: 14, color: "error.main", ml: 0.5 }} />
              </Box>
            </Tooltip>
          </Box>
        </Box>
      )}
    </Paper>
  );
};

const PerformanceDashboard: React.FC = () => {
  const { getWorkflowSummary, getPerformanceHistory, clearAllPerformance, isRecording } =
    usePerformanceStore();

  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);

  const summary = useMemo(
    () => (currentWorkflowId ? getWorkflowSummary(currentWorkflowId) : null),
    [currentWorkflowId, getWorkflowSummary]
  );

  const nodeMetrics = currentWorkflowId
    ? usePerformanceStore.getState().nodeMetrics[currentWorkflowId] || {}
    : {};

  const nodeList = useMemo(
    () =>
      Object.values(nodeMetrics).sort((a, b) => {
        if (a.status === "running" && b.status !== "running") {
          return -1;
        }
        if (b.status === "running" && a.status !== "running") {
          return 1;
        }
        return (b.duration || 0) - (a.duration || 0);
      }),
    [nodeMetrics]
  );

  const history = useMemo(() => getPerformanceHistory(10), [getPerformanceHistory]);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const handleClearAll = useCallback(() => {
    setClearDialogOpen(true);
  }, []);

  const handleConfirmClear = useCallback(() => {
    clearAllPerformance();
    setClearDialogOpen(false);
  }, [clearAllPerformance]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        p: 2,
        overflow: "auto",
      }}
    >
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear Performance Data</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to clear all performance data?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmClear} color="error">
            Clear
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <TimelineIcon sx={{ mr: 1 }} />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Performance
        </Typography>
        {isRecording && (
          <Chip
            size="small"
            label="Recording"
            color="primary"
            icon={<CircularProgress size={12} />}
          />
        )}
        <Tooltip title="Clear all data">
          <IconButton size="small" onClick={handleClearAll} sx={{ ml: 1 }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {summary ? (
        <PerformanceSummaryCard summary={summary} />
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            textAlign: "center",
            bgcolor: "background.default",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            mb: 2,
          }}
        >
          <Typography color="text.secondary">
            {isRecording
              ? "Recording workflow execution..."
              : "Run a workflow to see performance metrics"}
          </Typography>
        </Paper>
      )}

      {nodeList.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Nodes ({nodeList.filter((n) => n.status === "completed").length}/
            {nodeList.length} completed)
          </Typography>
          <List dense sx={{ maxHeight: 300, overflow: "auto" }}>
            {nodeList.map((node) => (
              <NodePerformanceItem
                key={node.nodeId}
                node={node}
                isActive={false}
                onClick={() => {}}
              />
            ))}
          </List>
        </Box>
      )}

      {history.length > 0 && (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Recent Runs
          </Typography>
          <List dense sx={{ maxHeight: 200, overflow: "auto" }}>
            {history.map((entry, index) => (
              <ListItem key={`${entry.workflowId}-${entry.timestamp}-${index}`}>
                <ListItemText
                  primary={entry.workflowName}
                  secondary={`${formatDuration(entry.duration)} • ${entry.nodeCount} nodes • ${entry.status}`}
                  primaryTypographyProps={{ variant: "body2" }}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default PerformanceDashboard;
