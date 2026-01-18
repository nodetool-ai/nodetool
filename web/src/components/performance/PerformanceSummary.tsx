import React, { memo } from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip
} from "@mui/material";
import SpeedIcon from "@mui/icons-material/Speed";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import isEqual from "lodash/isEqual";

interface PerformanceSummaryData {
  totalNodes: number;
  completedNodes: number;
  errorNodes: number;
  runningNodes: number;
  pendingNodes: number;
  totalDuration: number;
  parallelDuration: number;
  bottleneckNode: {
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
    duration: number | undefined;
  } | null;
  fastestNode: {
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
    duration: number | undefined;
  } | null;
  averageDuration: number;
  completionPercentage: number;
}

interface PerformanceSummaryProps {
  summary: PerformanceSummaryData;
  formatDuration: (ms: number) => string;
}

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
}> = ({ title, value, icon, color = "primary.main", subtitle }) => (
  <Paper
    sx={{
      padding: 1.5,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      border: 1,
      borderColor: "divider",
      backgroundColor: "background.paper"
    }}
  >
    <Box sx={{ color, mb: 0.5 }}>{icon}</Box>
    <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {title}
    </Typography>
    {subtitle && (
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
        {subtitle}
      </Typography>
    )}
  </Paper>
);

const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({
  summary,
  formatDuration
}) => {
  const {
    totalNodes,
    completedNodes,
    errorNodes,
    totalDuration,
    parallelDuration,
    bottleneckNode,
    fastestNode,
    averageDuration,
    completionPercentage
  } = summary;

  if (totalNodes === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: "text.secondary"
        }}
      >
        <SpeedIcon sx={{ fontSize: 48, opacity: 0.5, mb: 1 }} />
        <Typography variant="body2">
          No workflow data. Open a workflow to see performance metrics.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography variant="subtitle2">
            Execution Progress
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {completedNodes}/{totalNodes} nodes completed
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={completionPercentage}
            sx={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: "action.hover",
              "& .MuiLinearProgress-bar": {
                borderRadius: 4,
                transition: "width 0.3s"
              }
            }}
          />
          <Typography variant="caption" sx={{ minWidth: 45, textAlign: "right" }}>
            {Math.round(completionPercentage)}%
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 1.5,
          mb: 2
        }}
      >
        <StatCard
          title="Parallel Time"
          value={formatDuration(parallelDuration)}
          icon={<AccessTimeIcon />}
          color="info.main"
          subtitle="wall-clock time"
        />
        <StatCard
          title="Total CPU Time"
          value={formatDuration(totalDuration)}
          icon={<ScheduleIcon />}
          color="warning.main"
          subtitle="sum of all nodes"
        />
        <StatCard
          title="Average Node"
          value={formatDuration(averageDuration)}
          icon={<TrendingUpIcon />}
          color="success.main"
        />
        <StatCard
          title="Completion"
          value={`${completedNodes}/${totalNodes}`}
          icon={<CheckCircleIcon />}
          color="primary.main"
          subtitle={`${errorNodes > 0 ? `${errorNodes} errors` : "all good"}`}
        />
      </Box>

      {bottleneckNode && (
        <Paper
          sx={{
            p: 1.5,
            mb: 1.5,
            border: 1,
            borderColor: "error.light",
            backgroundColor: "error.lighter"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <WarningAmberIcon sx={{ color: "error.main", fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ color: "error.dark" }}>
              Bottleneck Detected
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {bottleneckNode.nodeLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {bottleneckNode.nodeType}
              </Typography>
            </Box>
            <Chip
              label={formatDuration(bottleneckNode.duration as number)}
              color="error"
              size="small"
              icon={<ErrorIcon />}
            />
          </Box>
        </Paper>
      )}

      {fastestNode && (
        <Paper
          sx={{
            p: 1.5,
            border: 1,
            borderColor: "success.light",
            backgroundColor: "success.lighter"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <SpeedIcon sx={{ color: "success.main", fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ color: "success.dark" }}>
              Fastest Node
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {fastestNode.nodeLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fastestNode.nodeType}
              </Typography>
            </Box>
            <Chip
              label={formatDuration(fastestNode.duration as number)}
              color="success"
              size="small"
              icon={<CheckCircleIcon />}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default memo(PerformanceSummary, isEqual);
