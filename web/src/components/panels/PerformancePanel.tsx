/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Collapse
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  Timer as TimerIcon,
  ErrorOutline as ErrorIcon,
  Refresh as RefreshIcon,
  Clear as ClearIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import useExecutionTimeStore, {
  NodePerformanceRecord,
  WorkflowPerformanceSummary
} from "../../stores/ExecutionTimeStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "12px 14px 14px 14px",
    boxSizing: "border-box",
    gap: 12,
    ".header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 32
    },
    ".title": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 600,
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.text.primary
    },
    ".stats-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 8
    },
    ".stat-card": {
      display: "flex",
      flexDirection: "column",
      padding: 10,
      borderRadius: 8,
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".stat-label": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      marginBottom: 4
    },
    ".stat-value": {
      fontSize: theme.fontSizeBig,
      fontWeight: 600,
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.primary
    },
    ".stat-value.warning": {
      color: theme.palette.warning.main
    },
    ".stat-value.error": {
      color: theme.palette.error.main
    },
    ".stat-value.success": {
      color: theme.palette.success.main
    },
    ".section": {
      marginTop: 4
    },
    ".section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      cursor: "pointer"
    },
    ".section-title": {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    ".bottleneck-item": {
      display: "flex",
      flexDirection: "column",
      padding: "8px 10px",
      marginBottom: 6,
      borderRadius: 6,
      backgroundColor: `${theme.vars.palette.warning.main}11`,
      border: `1px solid ${theme.vars.palette.warning.main}33`
    },
    ".bottleneck-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6
    },
    ".bottleneck-name": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".bottleneck-duration": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      fontFamily: theme.fontFamily2,
      color: theme.palette.warning.main
    },
    ".progress-bar": {
      height: 4,
      borderRadius: 2,
      backgroundColor: `${theme.vars.palette.divider}`,
      overflow: "hidden"
    },
    ".progress-fill": {
      height: "100%",
      borderRadius: 2,
      transition: "width 0.3s ease"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center",
      padding: 24
    },
    ".empty-icon": {
      fontSize: 48,
      marginBottom: 12,
      opacity: 0.5
    },
    ".empty-text": {
      fontSize: theme.fontSizeSmall,
      marginBottom: 4
    },
    ".empty-subtext": {
      fontSize: theme.fontSizeSmall,
      opacity: 0.7
    },
    ".history-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": {
        borderBottom: "none"
      }
    },
    ".history-name": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: 1,
      marginRight: 8
    },
    ".history-duration": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.secondary
    }
  });

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    const remainderMs = ms % 1000;
    if (remainderMs === 0) {
      return `${seconds}s`;
    }
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const PerformancePanel: React.FC = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => containerStyles(theme), [theme]);

  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const openWorkflows = useWorkflowManager((s) => s.openWorkflows);

  const getPerformanceSummary = useExecutionTimeStore(
    (s) => s.getPerformanceSummary
  );
  const getAggregatedStats = useExecutionTimeStore((s) => s.getAggregatedStats);
  const getWorkflowHistory = useExecutionTimeStore((s) => s.getWorkflowHistory);
  const clearHistory = useExecutionTimeStore((s) => s.clearHistory);

  const [showBottlenecks, setShowBottlenecks] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const currentWorkflowName = useMemo(() => {
    if (!currentWorkflowId) {
      return null;
    }
    const workflow = openWorkflows.find((w) => w.id === currentWorkflowId);
    return workflow?.name || currentWorkflowId;
  }, [currentWorkflowId, openWorkflows]);

  const summary = useMemo<WorkflowPerformanceSummary | null>(() => {
    if (!currentWorkflowId) {
      return null;
    }
    return getPerformanceSummary(currentWorkflowId);
  }, [currentWorkflowId, getPerformanceSummary]);

  const aggregatedStats = useMemo(() => getAggregatedStats(), [getAggregatedStats]);

  const workflowHistory = useMemo<NodePerformanceRecord[]>(() => {
    if (!currentWorkflowId) {
      return [];
    }
    return getWorkflowHistory(currentWorkflowId);
  }, [currentWorkflowId, getWorkflowHistory]);

  const isEmpty = !summary || summary.nodeCount === 0;

  const maxBottleneckDuration = useMemo(() => {
    if (!summary?.bottlenecks.length) {
      return 1;
    }
    return Math.max(...summary.bottlenecks.map((b) => b.duration), 1);
  }, [summary]);

  if (isEmpty) {
    return (
      <Box css={memoizedStyles}>
        <Box className="header">
          <Box className="title">
            <SpeedIcon fontSize="small" />
            Performance
          </Box>
        </Box>
        <Box className="empty-state">
          <SpeedIcon className="empty-icon" />
          <Typography className="empty-text">
            No performance data yet
          </Typography>
          <Typography className="empty-subtext">
            Run a workflow to see execution statistics
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      <Box className="header">
        <Box className="title">
          <SpeedIcon fontSize="small" />
          Performance
          {currentWorkflowName && (
            <Chip
              size="small"
              label={currentWorkflowName}
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          )}
        </Box>
        <Tooltip title="Clear history">
          <IconButton size="small" onClick={clearHistory}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="stats-grid">
        <Paper className="stat-card">
          <Typography className="stat-label">
            <TimerIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
            Avg Duration
          </Typography>
          <Typography className="stat-value">
            {formatDuration(summary.averageDuration)}
          </Typography>
        </Paper>

        <Paper className="stat-card">
          <Typography className="stat-label">
            <TrendingUpIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
            Nodes Executed
          </Typography>
          <Typography className="stat-value">
            {summary.completedCount} / {summary.nodeCount}
          </Typography>
        </Paper>

        <Paper className="stat-card">
          <Typography className="stat-label">
            <WarningIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
            Error Rate
          </Typography>
          <Typography
            className={`stat-value ${
              summary.errorCount > 0 ? "error" : "success"
            }`}
          >
            {summary.nodeCount > 0
              ? formatPercentage((summary.errorCount / summary.nodeCount) * 100)
              : "0%"}
          </Typography>
        </Paper>

        <Paper className="stat-card">
          <Typography className="stat-label">
            <SpeedIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
            Total Runs
          </Typography>
          <Typography className="stat-value">
            {aggregatedStats.totalRuns}
          </Typography>
        </Paper>
      </Box>

      {summary.slowestNode && (
        <Box className="section">
          <Box
            className="section-header"
            onClick={() => setShowBottlenecks(!showBottlenecks)}
          >
            <Box className="section-title">
              <WarningIcon sx={{ fontSize: 14 }} />
              Slowest Nodes
            </Box>
            <IconButton size="small">
              {showBottlenecks ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
          <Collapse in={showBottlenecks}>
            {summary.bottlenecks.map((bottleneck) => (
              <Box key={bottleneck.nodeId} className="bottleneck-item">
                <Box className="bottleneck-header">
                  <Typography className="bottleneck-name">
                    {bottleneck.nodeName}
                  </Typography>
                  <Typography className="bottleneck-duration">
                    {formatDuration(bottleneck.duration)}
                  </Typography>
                </Box>
                <Box className="progress-bar">
                  <Box
                    className="progress-fill"
                    style={{
                      width: `${(bottleneck.duration / maxBottleneckDuration) * 100}%`,
                      backgroundColor:
                        bottleneck.duration > 5000
                          ? theme.palette.error.main
                          : bottleneck.duration > 2000
                          ? theme.palette.warning.main
                          : theme.palette.success.main
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Collapse>
        </Box>
      )}

      <Box className="section">
        <Box
          className="section-header"
          onClick={() => setShowHistory(!showHistory)}
        >
          <Box className="section-title">
            <RefreshIcon sx={{ fontSize: 14 }} />
            Recent Executions
          </Box>
          <IconButton size="small">
            {showHistory ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </IconButton>
        </Box>
        <Collapse in={showHistory}>
          {workflowHistory.slice(0, 10).map((record, index) => (
            <Box key={`${record.nodeId}:${record.timestamp}:${index}`} className="history-item">
              <Typography className="history-name">
                {record.nodeName}
              </Typography>
              <Typography
                className="history-duration"
                sx={{
                  color:
                    record.status === "error"
                      ? theme.palette.error.main
                      : record.duration > 5000
                      ? theme.palette.warning.main
                      : theme.vars.palette.text.secondary
                }}
              >
                {record.status === "error" ? (
                  <ErrorIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
                ) : null}
                {formatDuration(record.duration)}
              </Typography>
            </Box>
          ))}
        </Collapse>
      </Box>
    </Box>
  );
};

export default memo(PerformancePanel);
