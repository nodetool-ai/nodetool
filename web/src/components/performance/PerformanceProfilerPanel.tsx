/**
 * Performance Profiler Panel
 *
 * Displays workflow performance metrics, bottlenecks, and optimization insights.
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { usePerformanceProfilerStore } from "../../stores/PerformanceProfilerStore";
import { WorkflowPerformance, PerformanceInsight } from "../../utils/performanceProfiler";
import { formatDuration } from "../../utils/performanceProfiler";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  nodeIds: string[];
  nodeTypes: Map<string, string>;
  durations: Map<string, number>;
  statuses: Map<string, "completed" | "failed" | "pending">;
}

const InsightItem: React.FC<{ insight: PerformanceInsight; expanded: boolean; onToggle: () => void }> = ({
  insight,
  expanded,
  onToggle
}) => {
  const theme = useTheme();

  const getIcon = () => {
    switch (insight.type) {
      case "bottleneck":
        return <WarningIcon color="warning" />;
      case "parallel":
        return <TrendingUpIcon color="primary" />;
      case "warning":
        return <ErrorIcon color="error" />;
      default:
        return <CheckCircleIcon color="success" />;
    }
  };

  const getImpactColor = () => {
    switch (insight.impact) {
      case "high":
        return theme.palette.error.main;
      case "medium":
        return theme.palette.warning.main;
      default:
        return theme.palette.info.main;
    }
  };

  return (
    <ListItem
      sx={{
        bgcolor: theme.palette.action.hover,
        borderRadius: 1,
        mb: 0.5,
        flexDirection: "column",
        alignItems: "stretch"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          cursor: "pointer"
        }}
        onClick={onToggle}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>{getIcon()}</ListItemIcon>
        <ListItemText
          primary={insight.message}
          secondary={insight.suggestion}
          secondaryTypographyProps={{
            color: theme.palette.text.secondary
          }}
        />
        <Chip
          label={insight.impact}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.65rem",
            bgcolor: getImpactColor(),
            color: theme.palette.getContrastText(getImpactColor())
          }}
        />
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      {expanded && insight.suggestion && (
        <Box
          sx={{
            mt: 1,
            p: 1,
            bgcolor: theme.palette.background.default,
            borderRadius: 1
          }}
        >
          <Typography variant="caption" color="text.secondary">
            💡 {insight.suggestion}
          </Typography>
        </Box>
      )}
    </ListItem>
  );
};

const NodePerformanceItem: React.FC<{
  node: {
    nodeId: string;
    nodeType: string;
    duration: number;
    percentage: number;
    status: "completed" | "failed" | "pending";
  };
  isBottleneck: boolean;
  totalDuration: number;
}> = ({ node, isBottleneck, totalDuration }) => {
  const theme = useTheme();

  const getStatusIcon = () => {
    switch (node.status) {
      case "completed":
        return <CheckCircleIcon color="success" fontSize="small" />;
      case "failed":
        return <ErrorIcon color="error" fontSize="small" />;
      default:
        return <ScheduleIcon color="disabled" fontSize="small" />;
    }
  };

  const progress = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;

  return (
    <Box
      sx={{
        p: 1,
        mb: 0.5,
        borderRadius: 1,
        bgcolor: isBottleneck
          ? "rgba(237, 108, 2, 0.1)"
          : theme.palette.action.hover,
        border: isBottleneck
          ? `1px solid ${theme.palette.warning.main}`
          : "1px solid transparent"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        {getStatusIcon()}
        <Typography variant="body2" sx={{ flex: 1, fontWeight: isBottleneck ? "bold" : "normal" }}>
          {node.nodeType?.split(".").pop() || "Node"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDuration(node.duration)}
        </Typography>
        <Chip
          label={`${node.percentage.toFixed(1)}%`}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.65rem",
            bgcolor: isBottleneck
              ? theme.palette.warning.main
              : theme.palette.action.selected,
            color: isBottleneck
              ? theme.palette.warning.contrastText
              : theme.palette.text.secondary
          }}
        />
        {isBottleneck && (
          <Tooltip title="Performance bottleneck">
            <SpeedIcon color="warning" fontSize="small" />
          </Tooltip>
        )}
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(progress, 100)}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: theme.palette.action.selected,
          "& .MuiLinearProgress-bar": {
            bgcolor: isBottleneck
              ? theme.palette.warning.main
              : theme.palette.primary.main,
            borderRadius: 2
          }
        }}
      />
    </Box>
  );
};

export const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  nodeIds,
  nodeTypes,
  durations,
  statuses
}) => {
  const theme = useTheme();

  const {
    isPanelOpen,
    setPanelOpen,
    recordExecution,
    showBottlenecksOnly,
    toggleBottlenecksOnly
  } = usePerformanceProfilerStore();

  // Compute performance on the fly
  const performance = useMemo(() => {
    if (!isPanelOpen) {
      return null;
    }

    // Simple performance calculation
    let totalDuration = 0;
    let completedCount = 0;
    let failedCount = 0;

    const nodes = nodeIds.map((nodeId) => {
      const duration = durations.get(nodeId) || 0;
      const status = statuses.get(nodeId) || "pending";

      if (status === "completed") {
        totalDuration += duration;
        completedCount++;
      } else if (status === "failed") {
        failedCount++;
      }

      return {
        nodeId,
        nodeType: nodeTypes.get(nodeId) || "unknown",
        duration,
        percentage: 0,
        status
      };
    });

    // Calculate percentages
    nodes.forEach((node) => {
      node.percentage = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;
    });

    // Sort by duration
    const sortedNodes = [...nodes].sort((a, b) => b.duration - a.duration);

    // Identify bottlenecks (> 20% of total time)
    const bottlenecks = sortedNodes.filter((node) => node.percentage > 20);

    return {
      totalDuration,
      nodeCount: nodeIds.length,
      completedCount,
      failedCount,
      nodes: sortedNodes,
      bottlenecks
    } as WorkflowPerformance;
  }, [isPanelOpen, nodeIds, nodeTypes, durations, statuses]);

  // Generate insights
  const insights = useMemo(() => {
    if (!performance) {
      return [];
    }

    const result: PerformanceInsight[] = [];

    // Bottleneck insights
    performance.bottlenecks.forEach((bottleneck) => {
      result.push({
        type: "bottleneck",
        message: `"${bottleneck.nodeType}" node takes ${bottleneck.percentage.toFixed(1)}% of total time`,
        suggestion: `Consider using a faster model or optimizing this node's configuration`,
        impact: "high"
      });
    });

    // Completion insight
    if (performance.failedCount > 0) {
      result.push({
        type: "warning",
        message: `${performance.failedCount} node(s) failed`,
        suggestion: "Check failed nodes for errors in configuration or data",
        impact: "high"
      });
    }

    // Success insight
    if (performance.completedCount === performance.nodeCount && performance.nodeCount > 0) {
      result.push({
        type: "info",
        message: `All ${performance.nodeCount} nodes completed in ${formatDuration(performance.totalDuration)}`,
        impact: "low"
      });
    }

    return result;
  }, [performance]);

  // Track expanded insight items
  const [expandedInsight, setExpandedInsight] = React.useState<number | null>(null);

  if (!isPanelOpen) {
    return null;
  }

  const handleRecord = () => {
    recordExecution(workflowId, nodeIds, nodeTypes, durations, statuses);
  };

  return (
    <Paper
      sx={{
        width: 320,
        maxHeight: "100%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <SpeedIcon color="primary" />
        <Typography variant="subtitle1" fontWeight="medium" sx={{ flex: 1 }}>
          Performance
        </Typography>
        <Tooltip title="Close panel">
          <IconButton size="small" onClick={() => setPanelOpen(false)}>
            <ExpandMoreIcon sx={{ transform: "rotate(45deg)" }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary */}
      {performance && (
        <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Total Time
              </Typography>
              <Typography variant="h6">
                {formatDuration(performance.totalDuration)}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: "right" }}>
              <Typography variant="caption" color="text.secondary">
                Nodes
              </Typography>
              <Typography variant="h6">
                {performance.completedCount}/{performance.nodeCount}
              </Typography>
            </Box>
          </Box>
          {performance.failedCount > 0 && (
            <Chip
              icon={<ErrorIcon />}
              label={`${performance.failedCount} failed`}
              color="error"
              size="small"
              sx={{ height: 24 }}
            />
          )}
        </Box>
      )}

      {/* Insights */}
      <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Typography variant="subtitle2" gutterBottom>
          Insights
        </Typography>
        {insights.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No insights available
          </Typography>
        ) : (
          <List dense disablePadding>
            {insights.map((insight, index) => (
              <InsightItem
                key={index}
                insight={insight}
                expanded={expandedInsight === index}
                onToggle={() => setExpandedInsight(expandedInsight === index ? null : index)}
              />
            ))}
          </List>
        )}
      </Box>

      {/* Bottleneck Filter */}
      <Box sx={{ p: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Show bottlenecks only
        </Typography>
        <IconButton
          size="small"
          onClick={toggleBottlenecksOnly}
          color={showBottlenecksOnly ? "primary" : "default"}
        >
          {showBottlenecksOnly ? (
            <TrendingDownIcon />
          ) : (
            <TrendingUpIcon />
          )}
        </IconButton>
      </Box>

      {/* Node Performance List */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Node Performance
        </Typography>
        {performance && performance.nodes.length > 0 ? (
          performance.nodes
            .filter((node) => !showBottlenecksOnly || performance.bottlenecks.some(b => b.nodeId === node.nodeId))
            .map((node) => (
              <NodePerformanceItem
                key={node.nodeId}
                node={node}
                isBottleneck={performance.bottlenecks.some(b => b.nodeId === node.nodeId)}
                totalDuration={performance.totalDuration}
              />
            ))
        ) : (
          <Typography variant="body2" color="text.secondary">
            No execution data available
          </Typography>
        )}
      </Box>

      {/* Record Button */}
      <Box sx={{ p: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            Record current execution
          </Typography>
          <Tooltip title="Record performance data">
            <IconButton size="small" onClick={handleRecord} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
};

export default PerformanceProfilerPanel;
