/**
 * PerformanceDashboard Component
 *
 * Displays workflow performance metrics and analysis for researchers.
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  IconButton,
  Tooltip
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Clear as ClearIcon
} from "@mui/icons-material";
import usePerformanceProfileStore from "../../stores/PerformanceProfileStore";

interface PerformanceDashboardProps {
  workflowId: string;
  workflowName?: string;
  onClose?: () => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
};

const StatCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  warning?: boolean;
}> = ({ title, value, subtitle, icon, color, warning }) => (
  <Card
    sx={{
      height: "100%",
      bgcolor: warning ? "rgba(211, 47, 47, 0.08)" : "background.paper",
      border: warning ? 1 : 0,
      borderColor: "error.main"
    }}
  >
    <CardContent>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ color: color }}>{icon}</Box>
        {warning && <WarningIcon color="error" fontSize="small" />}
      </Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const ProgressBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Box sx={{ flex: 1, bgcolor: "action.hover", borderRadius: 1, height: 8, overflow: "hidden" }}>
        <Box
          sx={{
            width: `${percentage}%`,
            height: "100%",
            bgcolor: color,
            transition: "width 0.3s ease"
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 50, textAlign: "right" }}>
        {formatDuration(value)}
      </Typography>
    </Box>
  );
};

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  workflowId,
  workflowName: _workflowName,
  onClose
}) => {
  const { getLatestProfile, getStatistics, getWorkflowBottlenecks, clearProfiles } = usePerformanceProfileStore();

  const profile = getLatestProfile(workflowId);
  const stats = getStatistics(workflowId);
  const bottlenecks = getWorkflowBottlenecks(workflowId).slice(0, 5);
  const recentProfiles = usePerformanceProfileStore.getState().getRecentProfiles(workflowId, 10);

  const maxBottleneckTime = useMemo(() => {
    return Math.max(...bottlenecks.map((b) => b.averageTime), 1);
  }, [bottlenecks]);

  const handleClear = () => {
    clearProfiles(workflowId);
  };

  if (!profile) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <SpeedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Performance Data
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Run your workflow to collect performance metrics
        </Typography>
      </Paper>
    );
  }

  const successRateColor = stats.successRate >= 90 ? "success.main" : stats.successRate >= 70 ? "warning.main" : "error.main";

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Analysis</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <ClearIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Total Runs"
            value={stats.totalRuns.toString()}
            subtitle="Workflow executions"
            icon={<TimerIcon />}
            color="primary.main"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Avg Duration"
            value={formatDuration(stats.avgDuration)}
            subtitle="Per run"
            icon={<TrendingUpIcon />}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Success Rate"
            value={`${stats.successRate.toFixed(1)}%`}
            subtitle={`${stats.totalRuns} total runs`}
            icon={<SpeedIcon />}
            color={successRateColor}
            warning={stats.successRate < 90}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard
            title="Top Bottleneck"
            value={stats.topBottleneck ? stats.topBottleneck.nodeName : "None"}
            subtitle={stats.topBottleneck ? formatDuration(stats.topBottleneck.averageTime) : "No data"}
            icon={<WarningIcon />}
            color="warning.main"
            warning={!!stats.topBottleneck}
          />
        </Grid>
      </Grid>

      {bottlenecks.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Node Execution Times
          </Typography>
          <Box sx={{ mt: 2 }}>
            {bottlenecks.map((node) => (
              <Box key={node.nodeId} sx={{ mb: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="caption" noWrap sx={{ maxWidth: 200 }}>
                    {node.nodeName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDuration(node.averageTime)} avg
                  </Typography>
                </Box>
                <ProgressBar value={node.averageTime} max={maxBottleneckTime} color="primary.main" />
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Run</TableCell>
              <TableCell align="right">Duration</TableCell>
              <TableCell align="right">Nodes</TableCell>
              <TableCell align="right">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentProfiles.slice(0, 5).map((run, index) => (
              <TableRow key={run.runId}>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip
                      label={`v${run.runId.split("_")[1] || index + 1}`}
                      size="small"
                      color={run.status === "completed" ? "success" : run.status === "error" ? "error" : "default"}
                      sx={{ height: 20, fontSize: "0.65rem" }}
                    />
                    <Typography variant="caption">
                      {new Date(run.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">{formatDuration(run.totalDuration)}</TableCell>
                <TableCell align="right">{run.successfulNodes}/{run.nodeCount}</TableCell>
                <TableCell align="right">
                  <Chip
                    label={run.status}
                    size="small"
                    color={run.status === "completed" ? "success" : "error"}
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Tooltip title="Clear all performance data">
          <IconButton size="small" onClick={handleClear}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default PerformanceDashboard;
