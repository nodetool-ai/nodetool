/**
 * Performance Profiler Panel
 *
 * Visualizes workflow execution performance metrics including:
 * - Execution time breakdown by node
 * - Bottleneck identification
 * - Performance trends across versions
 * - Resource usage visualization
 */

import React, { useMemo, useCallback, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  LinearProgress,
  Card,
  CardContent,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  Theme
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  Timeline as TimelineIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon
} from "@mui/icons-material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";

interface PerformanceProfilerProps {
  workflowId: string;
  onAnalyzeBottleneck?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

const getStatusColor = (status: string, theme: Theme) => {
  switch (status) {
    case "success":
      return theme.palette.success.main;
    case "partial":
      return theme.palette.warning.main;
    case "failed":
      return theme.palette.error.main;
    default:
      return theme.palette.grey[500];
  }
};

const PerformanceCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, subtitle, icon, color }) => {
  const theme = useTheme();
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Box
            sx={{
              p: 0.5,
              borderRadius: 1,
              bgcolor: color || theme.palette.primary.main,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" fontWeight="bold">
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

const NodePerformanceBar: React.FC<{
  nodeName: string;
  durationMs: number;
  maxDuration: number;
  color: string;
}> = ({ nodeName, durationMs, maxDuration, color }) => {
  const percentage = Math.min((durationMs / maxDuration) * 100, 100);

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" noWrap sx={{ maxWidth: 150 }}>
          {nodeName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDuration(durationMs)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": {
            bgcolor: color,
            borderRadius: 4
          }
        }}
      />
    </Box>
  );
};

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId
}) => {
  const theme = useTheme();
  const [viewMode, setViewMode] = useState<"timeline" | "breakdown">("timeline");
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);

  const {
    snapshots,
    currentRun,
    isRecording,
    startRecording,
    cancelRecording,
    clearSnapshots
  } = usePerformanceProfilerStore();

  const workflowSnapshots = useMemo(
    () => snapshots.filter((s) => s.workflowId === workflowId),
    [snapshots, workflowId]
  );

  const selectedSnapshot = workflowSnapshots[selectedSnapshotIndex];

  const aggregatedMetrics = useMemo(() => {
    if (workflowSnapshots.length === 0) {
      return null;
    }

    const totalRuns = workflowSnapshots.length;
    const avgDuration =
      workflowSnapshots.reduce((sum, s) => sum + s.durationMs, 0) / totalRuns;
    const minDuration = Math.min(...workflowSnapshots.map((s) => s.durationMs));
    const maxDuration = Math.max(...workflowSnapshots.map((s) => s.durationMs));
    const successRate =
      (workflowSnapshots.filter((s) => s.status === "success").length / totalRuns) *
      100;

    const nodeTypeFrequency: Record<string, number> = {};
    const nodeTypeAvgDuration: Record<string, { total: number; count: number }> = {};

    workflowSnapshots.forEach((snapshot) => {
      snapshot.topBottlenecks.forEach((bottleneck) => {
        nodeTypeFrequency[bottleneck.nodeType] =
          (nodeTypeFrequency[bottleneck.nodeType] || 0) + 1;
        if (!nodeTypeAvgDuration[bottleneck.nodeType]) {
          nodeTypeAvgDuration[bottleneck.nodeType] = { total: 0, count: 0 };
        }
        nodeTypeAvgDuration[bottleneck.nodeType].total += bottleneck.durationMs;
        nodeTypeAvgDuration[bottleneck.nodeType].count += 1;
      });
    });

    const frequentBottlenecks = Object.entries(nodeTypeFrequency)
      .map(([nodeType, count]) => ({
        nodeType,
        count,
        avgDuration:
          nodeTypeAvgDuration[nodeType].total /
          nodeTypeAvgDuration[nodeType].count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRuns,
      avgDuration,
      minDuration,
      maxDuration,
      successRate,
      frequentBottlenecks
    };
  }, [workflowSnapshots]);

  const handleStartRecording = useCallback(() => {
    startRecording(workflowId);
  }, [workflowId, startRecording]);

  const handleClearHistory = useCallback(() => {
    clearSnapshots(workflowId);
    setSelectedSnapshotIndex(0);
  }, [workflowId, clearSnapshots]);

  const handleViewModeChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newMode: "timeline" | "breakdown" | null) => {
      if (newMode) {
        setViewMode(newMode);
      }
    },
    []
  );

  if (workflowSnapshots.length === 0 && !isRecording) {
    return (
      <Paper
        elevation={3}
        sx={{
          p: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300
        }}
      >
        <SpeedIcon sx={{ fontSize: 48, color: "action.disabled", mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Performance Data
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
          Run your workflow to collect performance metrics
        </Typography>
        <Button variant="contained" onClick={handleStartRecording}>
          Start Recording
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflow: "auto",
        maxHeight: "100%"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {isRecording ? (
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={cancelRecording}
            >
              Cancel
            </Button>
          ) : (
            <>
              <Tooltip title="Clear history">
                <IconButton size="small" onClick={handleClearHistory}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Button
                variant="contained"
                size="small"
                startIcon={<TimerIcon />}
                onClick={handleStartRecording}
              >
                Record Run
              </Button>
            </>
          )}
        </Box>
      </Box>

      {isRecording && currentRun && (
        <Box
          sx={{
            p: 2,
            bgcolor: "rgba(25, 118, 210, 0.1)",
            borderRadius: 1,
            border: 1,
            borderColor: "primary.main"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: "error.main",
                animation: "pulse 1s infinite"
              }}
            />
            <Typography variant="body2" fontWeight="medium">
              Recording Performance...
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {currentRun.completedNodes} / {currentRun.nodeCount} nodes completed
          </Typography>
          <LinearProgress
            sx={{ mt: 1 }}
            variant="determinate"
            value={
              currentRun.nodeCount > 0
                ? (currentRun.completedNodes / currentRun.nodeCount) * 100
                : 0
            }
          />
        </Box>
      )}

      {aggregatedMetrics && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, md: 3 }}>
            <PerformanceCard
              title="Total Runs"
              value={String(aggregatedMetrics.totalRuns)}
              subtitle="Workflow executions"
              icon={<TimelineIcon fontSize="small" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <PerformanceCard
              title="Avg Duration"
              value={formatDuration(aggregatedMetrics.avgDuration)}
              subtitle="Per execution"
              icon={<TimerIcon fontSize="small" />}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <PerformanceCard
              title="Success Rate"
              value={`${aggregatedMetrics.successRate.toFixed(0)}%`}
              subtitle="Successful runs"
              icon={<TrendingUpIcon fontSize="small" />}
              color={
                aggregatedMetrics.successRate >= 90
                  ? theme.palette.success.main
                  : aggregatedMetrics.successRate >= 70
                    ? theme.palette.warning.main
                    : theme.palette.error.main
              }
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <PerformanceCard
              title="Best Time"
              value={formatDuration(aggregatedMetrics.minDuration)}
              subtitle={`Fastest (max: ${formatDuration(aggregatedMetrics.maxDuration)})`}
              icon={<SpeedIcon fontSize="small" />}
            />
          </Grid>
        </Grid>
      )}

      {workflowSnapshots.length > 1 && (
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Recent Runs
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap"
            }}
          >
            {workflowSnapshots.slice(0, 5).map((snapshot, index) => (
              <Chip
                key={snapshot.id}
                label={`v${index + 1}: ${formatDuration(snapshot.durationMs)}`}
                size="small"
                color={selectedSnapshotIndex === index ? "primary" : "default"}
                onClick={() => setSelectedSnapshotIndex(index)}
                icon={
                  snapshot.status === "failed" ? (
                    <WarningIcon fontSize="small" />
                  ) : undefined
                }
              />
            ))}
          </Box>
        </Box>
      )}

      {selectedSnapshot && (
        <>
          <Divider />

          <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
            >
              <ToggleButton value="timeline">
                <Tooltip title="Timeline View">
                  <TimelineIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="breakdown">
                <Tooltip title="Breakdown View">
                  <BarChartIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="subtitle2" sx={{ alignSelf: "center" }}>
              {viewMode === "timeline" ? "Execution Timeline" : "Node Breakdown"}
            </Typography>
          </Box>

          {viewMode === "timeline" ? (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Duration
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {formatDuration(selectedSnapshot.durationMs)}
                  </Typography>
                </Box>
                <Chip
                  label={selectedSnapshot.status.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: getStatusColor(selectedSnapshot.status, theme),
                    color: "white"
                  }}
                />
              </Box>

              {selectedSnapshot.topBottlenecks.length > 0 && (
                <Box>
                  <Typography
                    variant="subtitle2"
                    color="warning.main"
                    gutterBottom
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <WarningIcon fontSize="small" />
                    Top Bottlenecks
                  </Typography>
                  {selectedSnapshot.topBottlenecks.slice(0, 5).map((bottleneck, i) => (
                    <NodePerformanceBar
                      key={bottleneck.nodeId}
                      nodeName={bottleneck.nodeType.split(".").pop() || "Node"}
                      durationMs={bottleneck.durationMs}
                      maxDuration={selectedSnapshot.topBottlenecks[0]?.durationMs || 1}
                      color={
                        i === 0
                          ? theme.palette.error.main
                          : i === 1
                            ? theme.palette.warning.main
                            : theme.palette.info.main
                      }
                    />
                  ))}
                </Box>
              )}
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Node Performance Distribution
              </Typography>
              <List dense>
                {selectedSnapshot.topBottlenecks.map((bottleneck) => (
                  <ListItem
                    key={bottleneck.nodeId}
                    sx={{
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      mb: 0.5
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <PieChartIcon fontSize="small" color="action" />
                    </ListItemIcon>
                    <ListItemText
                      primary={bottleneck.nodeType.split(".").pop() || "Node"}
                      secondary={formatDuration(bottleneck.durationMs)}
                    />
                    <Chip
                      label={`${((bottleneck.durationMs / selectedSnapshot.durationMs) * 100).toFixed(1)}%`}
                      size="small"
                      variant="outlined"
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {aggregatedMetrics?.frequentBottlenecks && aggregatedMetrics.frequentBottlenecks.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <TrendingUpIcon fontSize="small" />
                  Frequent Performance Issues
                </Typography>
                <List dense>
                  {aggregatedMetrics.frequentBottlenecks.map((item) => (
                    <ListItem key={item.nodeType}>
                      <ListItemText
                        primary={item.nodeType.split(".").pop()}
                        secondary={`${item.count} occurrences`}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Avg: {formatDuration(item.avgDuration)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}
        </>
      )}
    </Paper>
  );
};

export default PerformanceProfiler;
