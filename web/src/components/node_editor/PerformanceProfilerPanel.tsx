/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Divider
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedIcon from "@mui/icons-material/Speed";
import TimerIcon from "@mui/icons-material/Timer";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import usePerformanceProfileStore from "../../stores/PerformanceProfileStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  workflowName: string;
  nodes: Array<{ id: string; data: { title?: string }; type: string }>;
}

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

const getDurationColor = (duration: number, maxDuration: number): string => {
  const ratio = duration / maxDuration;
  if (ratio > 0.8) {
    return "#ef5350";
  } else if (ratio > 0.5) {
    return "#ff9800";
  } else if (ratio > 0.3) {
    return "#ffeb3b";
  }
  return "#66bb6a";
};

interface ChartDataItem {
  name: string;
  fullName: string;
  duration: number;
  executions: number;
}

const SimpleBarChart: React.FC<{ data: ChartDataItem[]; maxDuration: number }> = ({
  data,
  maxDuration
}) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {data.map((item) => {
        const percentage = maxDuration > 0 ? (item.duration / maxDuration) * 100 : 0;
        return (
          <Box key={item.fullName} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              variant="caption"
              sx={{
                width: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {item.name}
            </Typography>
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={percentage}
                sx={{
                  flex: 1,
                  height: 20,
                  borderRadius: 1,
                  backgroundColor: "action.hover",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: getDurationColor(item.duration, maxDuration)
                  }
                }}
              />
              <Typography variant="caption" sx={{ width: 50, textAlign: "right" }}>
                {formatDuration(item.duration)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  nodes
}) => {
  const profile = usePerformanceProfileStore((state) => state.profiles[workflowId]);
  const clearProfile = usePerformanceProfileStore((state) => state.clearProfile);
  const currentDuration = useExecutionTimeStore((state) => {
    let total = 0;
    for (const node of nodes) {
      const duration = state.getDuration(workflowId, node.id);
      total += duration || 0;
    }
    return total;
  });

  const chartData = useMemo((): ChartDataItem[] => {
    if (!profile) {
      return [];
    }

    return Object.values(profile.nodeData)
      .map((node) => ({
        name: node.nodeName.length > 12 ? node.nodeName.substring(0, 12) + "..." : node.nodeName,
        fullName: node.nodeName,
        duration: node.averageDuration,
        executions: node.executionCount
      }))
      .sort((a, b) => b.duration - a.duration);
  }, [profile]);

  const maxDuration = useMemo(() => {
    if (chartData.length === 0) {
      return 1;
    }
    return Math.max(...chartData.map((d) => d.duration), 1);
  }, [chartData]);

  const totalNodesWithTiming = useMemo(() => {
    if (!profile) {
      return 0;
    }
    return Object.values(profile.nodeData).filter((n) => n.executionCount > 0).length;
  }, [profile]);

  const hasData = profile && profile.totalRuns > 0;

  if (!hasData) {
    return (
      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
          color: "text.secondary"
        }}
      >
        <SpeedIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
        <Typography variant="body2" align="center">
          No performance data yet
        </Typography>
        <Typography variant="caption" align="center" sx={{ mt: 1, opacity: 0.7 }}>
          Run the workflow to collect performance metrics
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Tooltip title="Clear performance data">
          <IconButton
            size="small"
            onClick={() => clearProfile(workflowId)}
            disabled={profile.totalRuns === 0}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <Paper
          sx={{
            p: 1.5,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
          variant="outlined"
        >
          <TimerIcon sx={{ color: "primary.main", mb: 0.5 }} />
          <Typography variant="h6">{formatDuration(profile.totalDuration)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Last Run
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 1.5,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
          variant="outlined"
        >
          <Typography variant="h6">{profile.totalRuns}</Typography>
          <Typography variant="caption" color="text.secondary">
            Total Runs
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 1.5,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
          variant="outlined"
        >
          <Typography variant="h6">{totalNodesWithTiming}</Typography>
          <Typography variant="caption" color="text.secondary">
            Tracked Nodes
          </Typography>
        </Paper>
      </Box>

      <Divider sx={{ my: 2 }} />

      {chartData.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Execution Time Distribution
          </Typography>
          <Box sx={{ mt: 1 }}>
            <SimpleBarChart data={chartData} maxDuration={maxDuration} />
          </Box>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <WarningAmberIcon sx={{ color: "warning.main", fontSize: 18 }} />
          <Typography variant="subtitle2">Top Bottlenecks</Typography>
        </Box>
        <List dense disablePadding>
          {profile.bottlenecks.slice(0, 5).map((node, index) => {
            const percentage = maxDuration > 0 ? (node.averageDuration / maxDuration) * 100 : 0;
            return (
              <ListItem
                key={node.nodeId}
                sx={{
                  px: 1,
                  py: 0.5,
                  backgroundColor: index === 0 ? "rgba(239, 83, 80, 0.1)" : "transparent",
                  borderRadius: 1
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                        {node.nodeName}
                      </Typography>
                      <Chip
                        label={formatDuration(node.averageDuration)}
                        size="small"
                        sx={{
                          backgroundColor: getDurationColor(node.averageDuration, maxDuration),
                          color: "white",
                          fontWeight: 600
                        }}
                      />
                    </Box>
                  }
                  secondary={`${node.executionCount} runs · ${formatDuration(node.minDuration)} - ${formatDuration(node.maxDuration)}`}
                />
                <Box sx={{ width: 60, ml: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={percentage}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "action.hover",
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: getDurationColor(node.averageDuration, maxDuration)
                      }
                    }}
                  />
                </Box>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {Object.keys(profile.nodeData).length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              All Node Timings
            </Typography>
            <List dense disablePadding>
              {Object.values(profile.nodeData)
                .sort((a, b) => b.averageDuration - a.averageDuration)
                .map((node) => {
                  const percentage =
                    maxDuration > 0 ? (node.averageDuration / maxDuration) * 100 : 0;
                  return (
                    <ListItem key={node.nodeId} sx={{ px: 0, py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ flex: 1, maxWidth: 150 }}>
                              {node.nodeName}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ width: 60, textAlign: "right" }}
                            >
                              {formatDuration(node.averageDuration)}
                            </Typography>
                          </Box>
                        }
                      />
                      <Box sx={{ width: 80, ml: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={percentage}
                          sx={{
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "action.hover",
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: getDurationColor(node.averageDuration, maxDuration)
                            }
                          }}
                        />
                      </Box>
                    </ListItem>
                  );
                })}
            </List>
          </Box>
        </>
      )}

      {currentDuration > 0 && (
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            backgroundColor: "action.hover",
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Current execution: {formatDuration(currentDuration)}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default PerformanceProfilerPanel;
