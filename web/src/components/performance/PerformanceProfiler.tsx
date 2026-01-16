/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
  LinearProgress,
  Collapse
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Speed,
  Warning,
  TrendingUp,
  TrendingDown,
  Timer,
  Analytics
} from "@mui/icons-material";
import usePerformanceProfilerStore, { NodePerformanceData } from "../../stores/PerformanceProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface PerformanceProfilerProps {
  workflowId: string;
  workflowName?: string;
  isRunning?: boolean;
  onAnalyzeBottleneck?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

const getDurationColor = (ms: number, maxMs: number, theme: any): string => {
  const ratio = ms / maxMs;
  if (ratio < 0.2) {
    return theme.palette.success.main;
  }
  if (ratio < 0.5) {
    return theme.palette.warning.main;
  }
  return theme.palette.error.main;
};

const PerformanceNodeItem: React.FC<{
  nodeData: NodePerformanceData;
  maxDuration: number;
  onClick?: () => void;
}> = ({ nodeData, maxDuration, onClick }) => {
  const theme = React.useMemo(() => ({}), []);
  const [expanded, setExpanded] = React.useState(false);
  const color = getDurationColor(nodeData.avgDuration, maxDuration, theme);

  return (
    <ListItem
      component="div"
      onClick={onClick}
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        py: 1.5,
        cursor: onClick ? "pointer" : "default",
        "&:hover": onClick ? { bgcolor: "action.hover" } : {},
        borderRadius: 1,
        transition: "background-color 0.2s"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" fontWeight={500} noWrap>
              {nodeData.nodeLabel}
            </Typography>
            <Chip
              label={nodeData.nodeType}
              size="small"
              sx={{ height: 18, fontSize: "0.65rem" }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min((nodeData.avgDuration / maxDuration) * 100, 100)}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: "grey.200",
                  "& .MuiLinearProgress-bar": {
                    bgcolor: color,
                    borderRadius: 3
                  }
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: "right" }}>
              {formatDuration(nodeData.avgDuration)}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1.5, pl: 1, borderLeft: 2, borderColor: "divider" }}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <Tooltip title="Average execution time">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Timer fontSize="small" color="action" />
                <Typography variant="caption">
                  Avg: <strong>{formatDuration(nodeData.avgDuration)}</strong>
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title="Fastest execution">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <TrendingDown fontSize="small" color="success" />
                <Typography variant="caption">
                  Min: <strong>{formatDuration(nodeData.minDuration)}</strong>
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title="Slowest execution">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <TrendingUp fontSize="small" color="error" />
                <Typography variant="caption">
                  Max: <strong>{formatDuration(nodeData.maxDuration)}</strong>
                </Typography>
              </Box>
            </Tooltip>
            <Tooltip title="Number of executions">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Analytics fontSize="small" color="action" />
                <Typography variant="caption">
                  Runs: <strong>{nodeData.executionCount}</strong>
                </Typography>
              </Box>
            </Tooltip>
          </Box>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Last execution: {formatDuration(nodeData.lastDuration)}
            </Typography>
          </Box>
        </Box>
      </Collapse>
    </ListItem>
  );
};

const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  isRunning = false,
  onAnalyzeBottleneck
}) => {
  const profile = usePerformanceProfilerStore((state) => state.getProfile(workflowId));
  const bottlenecks = usePerformanceProfilerStore((state) => state.getBottlenecks(workflowId));
  const comparison = usePerformanceProfilerStore((state) =>
    profile ? state.compareWithPrevious(workflowId, state.currentRunTimings) : null
  );
  const currentRunTimings = useExecutionTimeStore((state) => state.timings);

  const nodeTimings = useMemo(() => {
    const timings: Record<string, number> = {};
    for (const [key, timing] of Object.entries(currentRunTimings)) {
      if (key.startsWith(workflowId) && timing.endTime) {
        const nodeId = key.split(":")[1];
        timings[nodeId] = timing.endTime - timing.startTime;
      }
    }
    return timings;
  }, [currentRunTimings, workflowId]);

  const maxDuration = useMemo(() => {
    if (!profile) {
      return 1;
    }
    return Math.max(...Object.values(profile.nodeData).map((n) => n.avgDuration), 1);
  }, [profile]);

  const sortedNodes = useMemo(() => {
    if (!profile) {
      return [];
    }
    return Object.values(profile.nodeData).sort((a, b) => b.avgDuration - a.avgDuration);
  }, [profile]);

  const isLoading = isRunning;

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">
          Profiling workflow execution...
        </Typography>
      </Box>
    );
  }

  if (!profile || sortedNodes.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Speed sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No profiling data available yet. Run the workflow to collect performance metrics.
        </Typography>
      </Box>
    );
  }

  const isFaster = comparison && comparison.percentChange < -5;
  const isSlower = comparison && comparison.percentChange > 5;

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Analytics color="primary" />
        <Typography variant="h6">Performance Profile</Typography>
        <Chip label={`${profile.runCount} runs`} size="small" sx={{ ml: "auto" }} />
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <Paper sx={{ p: 1.5, flex: 1, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Total Time</Typography>
          <Typography variant="h6">{formatDuration(profile.totalDuration)}</Typography>
        </Paper>
        <Paper sx={{ p: 1.5, flex: 1, minWidth: 120 }}>
          <Typography variant="caption" color="text.secondary">Nodes Profiled</Typography>
          <Typography variant="h6">{sortedNodes.length}</Typography>
        </Paper>
        {comparison && (
          <Paper
            sx={{
              p: 1.5,
              flex: 1,
              minWidth: 120,
              bgcolor: isFaster ? "success.lighter" : isSlower ? "error.lighter" : "grey.100"
            }}
          >
            <Typography variant="caption" color="text.secondary">vs Previous</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {isFaster ? <TrendingDown color="success" fontSize="small" /> : null}
              {isSlower ? <TrendingUp color="error" fontSize="small" /> : null}
              <Typography
                variant="h6"
                color={isFaster ? "success.main" : isSlower ? "error.main" : "text.primary"}
              >
                {comparison.percentChange > 0 ? "+" : ""}{comparison.percentChange.toFixed(1)}%
              </Typography>
            </Box>
          </Paper>
        )}
      </Box>

      {bottlenecks.length > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, bgcolor: "warning.lighter", border: 1, borderColor: "warning.light" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Warning color="warning" fontSize="small" />
            <Typography variant="subtitle2" fontWeight={600}>Top Bottlenecks</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {bottlenecks.map((nodeId) => {
              const nodeData = profile.nodeData[nodeId];
              return (
                <Chip
                  key={nodeId}
                  label={nodeData?.nodeLabel || nodeId}
                  size="small"
                  onClick={() => onAnalyzeBottleneck?.(nodeId)}
                  sx={{ bgcolor: "background.paper" }}
                />
              );
            })}
          </Box>
        </Paper>
      )}

      {comparison && comparison.fasterNodes.length > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, bgcolor: "success.lighter", border: 1, borderColor: "success.light" }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
            Improved Performance
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {comparison.fasterNodes.slice(0, 3).map((node) => (
              <Chip
                key={node.nodeId}
                label={`${node.label} (-${node.improvement.toFixed(0)}%)`}
                size="small"
                color="success"
                sx={{ bgcolor: "background.paper" }}
              />
            ))}
          </Box>
        </Paper>
      )}

      {comparison && comparison.slowerNodes.length > 0 && (
        <Paper sx={{ p: 1.5, mb: 2, bgcolor: "error.lighter", border: 1, borderColor: "error.light" }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
            Performance Regression
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {comparison.slowerNodes.slice(0, 3).map((node) => (
              <Chip
                key={node.nodeId}
                label={`${node.label} (+${node.regression.toFixed(0)}%)`}
                size="small"
                color="error"
                sx={{ bgcolor: "background.paper" }}
              />
            ))}
          </Box>
        </Paper>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Node Performance
      </Typography>

      <List dense sx={{ bgcolor: "background.paper", borderRadius: 1 }}>
        {sortedNodes.map((nodeData, index) => (
          <React.Fragment key={nodeData.nodeId}>
            {index > 0 && <Divider component="li" />}
            <PerformanceNodeItem
              nodeData={nodeData}
              maxDuration={maxDuration}
              onClick={() => onAnalyzeBottleneck?.(nodeData.nodeId)}
            />
          </React.Fragment>
        ))}
      </List>
    </Box>
  );
};

export default PerformanceProfiler;
