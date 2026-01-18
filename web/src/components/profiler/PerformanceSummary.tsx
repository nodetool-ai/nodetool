import React from "react";
import { Box, Typography, Paper, Grid, LinearProgress, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useProfilingStore, { WorkflowProfile } from "../../stores/ProfilingStore";

interface PerformanceSummaryProps {
  profile: WorkflowProfile;
}

export const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({ profile }) => {
  const theme = useTheme();

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  };

  const completedNodes = Object.values(profile.nodes).filter(
    n => n.status === "completed" || n.status === "error"
  );
  const failedNodes = Object.values(profile.nodes).filter(n => n.status === "error");
  const avgNodeTime = completedNodes.length > 0
    ? completedNodes.reduce((sum, n) => sum + n.duration, 0) / completedNodes.length
    : 0;

  const metrics = [
    {
      label: "Total Duration",
      value: formatDuration(profile.totalDuration),
      color: theme.palette.primary.main
    },
    {
      label: "Nodes Executed",
      value: `${completedNodes.length}/${profile.nodeCount}`,
      color: theme.palette.secondary.main
    },
    {
      label: "Failed Nodes",
      value: failedNodes.length,
      color: failedNodes.length > 0 ? theme.palette.error.main : theme.palette.success.main
    },
    {
      label: "Avg Node Time",
      value: formatDuration(avgNodeTime),
      color: theme.palette.info.main
    }
  ];

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        Performance Summary
      </Typography>

      <Grid container spacing={2}>
        {metrics.map((metric) => (
          <Grid size={{ xs: 6 }} key={metric.label}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: `${metric.color}15`,
                border: `1px solid ${metric.color}30`
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {metric.label}
              </Typography>
              <Typography variant="h6" sx={{ color: metric.color, fontWeight: 600 }}>
                {metric.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Parallelization Efficiency
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {(profile.parallelizationEfficiency * 100).toFixed(0)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={profile.parallelizationEfficiency * 100}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: theme.palette.grey[200],
            "& .MuiLinearProgress-bar": {
              borderRadius: 4,
              bgcolor: profile.parallelizationEfficiency > 0.7
                ? theme.palette.success.main
                : profile.parallelizationEfficiency > 0.4
                  ? theme.palette.warning.main
                  : theme.palette.error.main
            }
          }}
        />
      </Box>

      {profile.bottleneckNodes.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Bottleneck Nodes
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {profile.bottleneckNodes.map(nodeId => {
              const node = profile.nodes[nodeId];
              return (
                <Chip
                  key={nodeId}
                  label={node?.nodeName || nodeId}
                  size="small"
                  sx={{
                    bgcolor: theme.palette.error.light,
                    color: theme.palette.error.contrastText,
                    fontSize: "0.7rem"
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {profile.criticalPath.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Critical Path
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {profile.criticalPath.map((nodeId, index) => {
              const node = profile.nodes[nodeId];
              return (
                <React.Fragment key={nodeId}>
                  <Chip
                    label={node?.nodeName || nodeId}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.7rem" }}
                  />
                  {index < profile.criticalPath.length - 1 && (
                    <Typography variant="caption" sx={{ alignSelf: "center" }}>
                      →
                    </Typography>
                  )}
                </React.Fragment>
              );
            })}
          </Box>
        </Box>
      )}
    </Paper>
  );
};

export default PerformanceSummary;
