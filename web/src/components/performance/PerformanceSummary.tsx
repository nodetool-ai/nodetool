/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Typography, Paper, Grid, Chip } from "@mui/material";
import { styled } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SpeedIcon from "@mui/icons-material/Speed";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import isEqual from "lodash/isEqual";
import type { PerformanceProfile } from "../../stores/PerformanceProfilerStore";

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.vars.palette.background.default,
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: theme.shape.borderRadius
}));

const MetricCard = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.vars.palette.action.hover
}));

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

const formatDurationLong = (ms: number): string => {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const parts: string[] = [];

  if (hours > 0) { parts.push(`${hours}h`); }
  if (minutes > 0) { parts.push(`${minutes}m`); }
  if (seconds > 0 || parts.length === 0) { parts.push(`${seconds}s`); }

  return parts.join(" ");
};

interface PerformanceSummaryProps {
  profile: PerformanceProfile | null;
}

const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({ profile }) => {
  if (!profile) {
    return (
      <StyledPaper>
        <Typography variant="body2" color="text.secondary">
          No performance data available. Run the workflow to see performance metrics.
        </Typography>
      </StyledPaper>
    );
  }

  const hasBottlenecks = profile.bottleneckNodes.length > 0;

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Performance Summary
      </Typography>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard>
            <AccessTimeIcon sx={{ color: "primary.main", mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Total Duration
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {formatDurationLong(profile.totalDuration)}
            </Typography>
          </MetricCard>
        </Grid>

        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard>
            <SpeedIcon sx={{ color: "secondary.main", mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Avg per Node
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {formatDuration(profile.averageNodeDuration)}
            </Typography>
          </MetricCard>
        </Grid>

        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard>
            <CheckCircleIcon sx={{ color: "success.main", mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Completed
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {profile.completedNodes}/{profile.nodeCount}
            </Typography>
          </MetricCard>
        </Grid>

        <Grid size={{ xs: 6, md: 3 }}>
          <MetricCard>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {hasBottlenecks ? (
                <WarningAmberIcon sx={{ color: "warning.main" }} />
              ) : (
                <CheckCircleIcon sx={{ color: "success.main" }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Bottlenecks
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {profile.bottleneckNodes.length}
            </Typography>
          </MetricCard>
        </Grid>
      </Grid>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Chip
          size="small"
          icon={<CheckCircleIcon />}
          label={`${profile.completedNodes} completed`}
          color="success"
          variant="outlined"
        />
        {profile.failedNodes > 0 && (
          <Chip
            size="small"
            icon={<ErrorIcon />}
            label={`${profile.failedNodes} failed`}
            color="error"
            variant="outlined"
          />
        )}
        <Chip
          size="small"
          label={`Max: ${formatDuration(profile.maxNodeDuration)}`}
          variant="outlined"
        />
        <Chip
          size="small"
          label={`Min: ${formatDuration(profile.minNodeDuration)}`}
          variant="outlined"
        />
      </Box>

      {hasBottlenecks && (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: "warning.main", borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ color: "warning.contrastText", mb: 1 }}>
            Performance Bottlenecks Detected
          </Typography>
          {profile.bottleneckNodes.slice(0, 3).map((node) => (
            <Box
              key={node.nodeId}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                py: 0.5
              }}
            >
              <Typography variant="body2" sx={{ color: "warning.contrastText" }}>
                {node.nodeName || node.nodeId}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "warning.contrastText", fontWeight: 600 }}
              >
                {formatDuration(node.duration)} ({Math.round((node.duration / profile.totalDuration) * 100)}%)
              </Typography>
            </Box>
          ))}
          {profile.bottleneckNodes.length > 3 && (
            <Typography variant="caption" sx={{ color: "warning.contrastText" }}>
              +{profile.bottleneckNodes.length - 3} more...
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default memo(PerformanceSummary, isEqual);
