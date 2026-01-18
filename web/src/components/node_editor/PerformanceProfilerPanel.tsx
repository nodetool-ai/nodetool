/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
  Divider,
  Paper
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedIcon from "@mui/icons-material/Speed";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { useReactFlow } from "@xyflow/react";
import useErrorStore from "../../stores/ErrorStore";
import useMetadataStore from "../../stores/MetadataStore";
import usePerformanceStore, { NodePerformanceData } from "../../stores/PerformanceStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useResultsStore from "../../stores/ResultsStore";
import usePerformancePanelStore from "../../stores/PerformancePanelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.round(ms % 1000);
    return `${seconds}s ${milliseconds}ms`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
};

const getPerformanceColor = (
  duration: number,
  thresholds: { slow: number; verySlow: number }
): string => {
  if (duration >= thresholds.verySlow) {
    return "var(--palette-error-main)";
  } else if (duration >= thresholds.slow) {
    return "var(--palette-warning-main)";
  }
  return "var(--palette-success-main)";
};

const NodePerformanceRow = memo<{
  node: NodePerformanceData;
  maxDuration: number;
  thresholds: { slow: number; verySlow: number };
  onFocus: (nodeId: string) => void;
}>(({ node, maxDuration, thresholds, onFocus }) => {
  const percentage = maxDuration > 0 ? (node.duration / maxDuration) * 100 : 0;
  const color = getPerformanceColor(node.duration, thresholds);

  const getStatusIcon = () => {
    switch (node.status) {
      case "completed":
        return <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />;
      case "error":
        return <ErrorOutlineIcon sx={{ fontSize: 14, color: "error.main" }} />;
      case "running":
        return <ScheduleIcon sx={{ fontSize: 14, color: "warning.main" }} />;
      default:
        return <ScheduleIcon sx={{ fontSize: 14, color: "text.disabled" }} />;
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.75,
        px: 1,
        borderRadius: 1,
        "&:hover": {
          backgroundColor: "action.hover"
        }
      }}
    >
      <Box sx={{ minWidth: 20 }}>{getStatusIcon()}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {node.nodeLabel || node.nodeId}
          </Typography>
          {node.isBottleneck && (
            <Chip
              icon={<WarningAmberIcon sx={{ fontSize: "12px !important" }} />}
              label="Bottleneck"
              size="small"
              color="warning"
              sx={{ height: 18, fontSize: "10px" }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <LinearProgress
              variant="determinate"
              value={percentage}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "action.hover",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: color,
                  borderRadius: 3
                }
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              minWidth: 70,
              textAlign: "right",
              fontFamily: "monospace"
            }}
          >
            {formatDuration(node.duration)}
          </Typography>
        </Box>
      </Box>
      <Tooltip title="Focus node" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
        <IconButton
          size="small"
          onClick={() => onFocus(node.nodeId)}
          sx={{ color: "text.secondary" }}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
});

NodePerformanceRow.displayName = "NodePerformanceRow";

const styles = (theme: Theme) =>
  css({
    "&.performance-panel": {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden"
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: "rgba(0, 0, 0, 0.02)"
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: 1
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .stats-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 12,
      marginBottom: 16
    },
    "& .stat-card": {
      padding: 12,
      borderRadius: 8,
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .stat-label": {
      fontSize: "11px",
      color: "text.secondary",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: 4
    },
    "& .stat-value": {
      fontSize: "20px",
      fontWeight: 600,
      color: "text.primary",
      fontFamily: "monospace"
    },
    "& .stat-subtitle": {
      fontSize: "11px",
      color: "text.disabled",
      marginTop: 2
    },
    "& .section-title": {
      fontSize: "12px",
      fontWeight: 600,
      color: "text.secondary",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: 8
    },
    "& .bottleneck-list": {
      marginBottom: 16
    },
    "& .all-nodes-list": {
      marginTop: 8
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: 48,
      color: "text.disabled",
      marginBottom: 12
    },
    "& .empty-text": {
      fontSize: "13px",
      color: "text.secondary",
      marginBottom: 16
    }
  });

interface PerformanceProfilerPanelProps {
  workflowId: string;
}

const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = memo(({ workflowId }) => {
  const theme = useTheme();
  const { getNodes, setCenter } = useReactFlow();
  const isOpen = usePerformancePanelStore((state) => state.isOpen);
  const thresholds = usePerformanceStore((state) => state.thresholds);
  const profile = usePerformanceStore((state) => state.profiles[workflowId]);
  const analyzeWorkflow = usePerformanceStore((state) => state.analyzeWorkflow);

  const getNodeDuration = useCallback((nodeId: string) => {
    return useExecutionTimeStore.getState().getDuration(workflowId, nodeId);
  }, [workflowId]);

  const getNodeStatus = useCallback((nodeId: string) => {
    const result = useResultsStore.getState().getResult(workflowId, nodeId);
    const errorState = useErrorStore.getState();
    const hasError = errorState.errors[hashKey(workflowId, nodeId)];
    if (hasError) { return "error" as const; }
    if (result !== undefined) { return "completed" as const; }
    return "pending" as const;
  }, [workflowId]);

  const getNodeType = useCallback((nodeId: string) => {
    const node = getNodes().find((n) => n.id === nodeId);
    return node?.type || "unknown";
  }, [getNodes]);

  const getNodeLabel = useCallback((nodeId: string) => {
    const node = getNodes().find((n) => n.id === nodeId);
    const metadata = useMetadataStore.getState().getMetadata(node?.type || "unknown");
    return metadata?.title || node?.id || nodeId;
  }, [getNodes]);

  const handleRefresh = useCallback(() => {
    const nodeIds = getNodes().map((n) => n.id);
    analyzeWorkflow(workflowId, nodeIds, getNodeDuration, getNodeStatus, getNodeType, getNodeLabel);
  }, [workflowId, getNodes, analyzeWorkflow, getNodeDuration, getNodeStatus, getNodeType, getNodeLabel]);

  const handleFocus = useCallback((nodeId: string) => {
    const node = getNodes().find((n) => n.id === nodeId);
    if (node) {
      setCenter(node.position.x, node.position.y, { zoom: 1.5, duration: 300 });
    }
  }, [getNodes, setCenter]);

  const computedProfile = useMemo(() => {
    const nodeIds = getNodes().map((n) => n.id);
    return analyzeWorkflow(workflowId, nodeIds, getNodeDuration, getNodeStatus, getNodeType, getNodeLabel);
  }, [workflowId, getNodes, analyzeWorkflow, getNodeDuration, getNodeStatus, getNodeType, getNodeLabel]);

  const displayProfile = profile || computedProfile;

  const maxDuration = useMemo(() => {
    if (!displayProfile?.nodes.length) { return 0; }
    return Math.max(...displayProfile.nodes.map((n) => n.duration));
  }, [displayProfile]);

  const hasBottlenecks = displayProfile?.bottlenecks.length > 0;

  if (!isOpen) {
    return null;
  }

  if (!displayProfile || displayProfile.nodeCount === 0) {
    return (
      <Box className="performance-panel" css={styles(theme)}>
        <Box className="panel-header">
          <Box className="panel-title">
            <SpeedIcon sx={{ color: "primary.main" }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Performance Profiler
            </Typography>
          </Box>
        </Box>
        <Box className="panel-content">
          <Box className="empty-state">
            <SpeedIcon className="empty-icon" />
            <Typography className="empty-text">
              Run your workflow to see performance analysis
            </Typography>
            <Button variant="outlined" size="small" onClick={handleRefresh}>
              Refresh
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="performance-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Box className="panel-title">
          <SpeedIcon sx={{ color: "primary.main" }} />
          <Typography variant="subtitle1" fontWeight={600}>
            Performance Profiler
          </Typography>
        </Box>
        <Tooltip title="Refresh analysis" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={handleRefresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="panel-content">
        <Box className="stats-grid">
          <Paper className="stat-card" elevation={0}>
            <Box className="stat-label">Total Duration</Box>
            <Box className="stat-value">{formatDuration(displayProfile.totalDuration)}</Box>
            <Box className="stat-subtitle">
              {displayProfile.completedCount}/{displayProfile.nodeCount} nodes completed
            </Box>
          </Paper>
          <Paper className="stat-card" elevation={0}>
            <Box className="stat-label">Bottlenecks</Box>
            <Box className="stat-value" sx={{ color: hasBottlenecks ? "warning.main" : "success.main" }}>
              {displayProfile.bottlenecks.length}
            </Box>
            <Box className="stat-subtitle">
              {hasBottlenecks ? "Performance issues found" : "No issues detected"}
            </Box>
          </Paper>
        </Box>

        {hasBottlenecks && (
          <>
            <Box className="section-title">
              <TrendingUpIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "text-bottom" }} />
              Bottlenecks
            </Box>
            <Box className="bottleneck-list">
              {displayProfile.bottlenecks.map((node) => (
                <NodePerformanceRow
                  key={node.nodeId}
                  node={node}
                  maxDuration={maxDuration}
                  thresholds={thresholds}
                  onFocus={handleFocus}
                />
              ))}
            </Box>
            <Divider sx={{ my: 2 }} />
          </>
        )}

        <Box className="section-title">All Nodes</Box>
        <Box className="all-nodes-list">
          {displayProfile.nodes
            .filter((n) => n.status === "completed")
            .sort((a, b) => b.duration - a.duration)
            .map((node) => (
              <NodePerformanceRow
                key={node.nodeId}
                node={node}
                maxDuration={maxDuration}
                thresholds={thresholds}
                onFocus={handleFocus}
              />
            ))}
        </Box>
      </Box>
    </Box>
  );
});

PerformanceProfilerPanel.displayName = "PerformanceProfilerPanel";

export default PerformanceProfilerPanel;

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;
