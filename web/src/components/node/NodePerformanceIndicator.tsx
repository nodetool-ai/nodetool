/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { Speed as SpeedIcon, TrendingUp as TrendingUpIcon } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface NodePerformanceIndicatorProps {
  nodeId: string;
  workflowId: string;
  currentDuration?: number;
}

interface PerformanceStats {
  averageDuration: number;
  runCount: number;
  trend: "up" | "down" | "stable";
  percentile: number;
}

const NodePerformanceIndicator: React.FC<NodePerformanceIndicatorProps> = ({
  nodeId,
  workflowId,
  currentDuration
}) => {
  const theme = useTheme();
  const nodeHistory = useExecutionTimeStore((state) => state.getNodeHistory(nodeId));

  const stats = useMemo<PerformanceStats>(() => {
    if (nodeHistory.length === 0) {
      return {
        averageDuration: 0,
        runCount: 0,
        trend: "stable",
        percentile: 0
      };
    }

    const completedRuns = nodeHistory.filter((r) => r.status === "completed");
    if (completedRuns.length === 0) {
      return {
        averageDuration: 0,
        runCount: nodeHistory.length,
        trend: "stable",
        percentile: 0
      };
    }

    const durations = completedRuns.map((r) => r.duration).sort((a, b) => a - b);
    const sum = durations.reduce((acc, d) => acc + d, 0);
    const averageDuration = sum / durations.length;

    let trend: "up" | "down" | "stable" = "stable";
    if (durations.length >= 3) {
      const recentAvg =
        durations.slice(-3).reduce((acc, d) => acc + d, 0) / 3;
      const olderAvg =
        durations.slice(0, -3).reduce((acc, d) => acc + d, 0) /
        Math.max(durations.length - 3, 1);

      if (recentAvg > olderAvg * 1.2) {
        trend = "up";
      } else if (recentAvg < olderAvg * 0.8) {
        trend = "down";
      }
    }

    let percentile = 50;
    if (currentDuration !== undefined && durations.length > 0) {
      const belowCount = durations.filter((d) => d < currentDuration).length;
      percentile = Math.round((belowCount / durations.length) * 100);
    }

    return {
      averageDuration,
      runCount: completedRuns.length,
      trend,
      percentile
    };
  }, [nodeHistory, currentDuration]);

  const isSlow = stats.averageDuration > 5000;
  const isModerate = stats.averageDuration > 1000 && stats.averageDuration <= 5000;
  const hasData = stats.runCount > 0;

  if (!hasData) {
    return null;
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    return `${minutes}m ${remainderSeconds}s`;
  };

  const getStatusColor = (): string => {
    if (isSlow) {
      return theme.palette.error.main;
    }
    if (isModerate) {
      return theme.palette.warning.main;
    }
    return theme.palette.success.main;
  };

  const getTrendIcon = (): React.ReactNode => {
    if (stats.trend === "up") {
      return (
        <TrendingUpIcon
          sx={{
            fontSize: "0.7rem",
            color: theme.palette.error.main,
            transform: "rotate(45deg)"
          }}
        />
      );
    }
    if (stats.trend === "down") {
      return (
        <TrendingUpIcon
          sx={{
            fontSize: "0.7rem",
            color: theme.palette.success.main,
            transform: "rotate(-45deg)"
          }}
        />
      );
    }
    return null;
  };

  const tooltipContent = (
    <Box>
      <Box sx={{ fontWeight: 600, mb: 0.5 }}>Performance Stats</Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Box>
          Runs: <strong>{stats.runCount}</strong>
        </Box>
        <Box>
          Avg: <strong>{formatDuration(stats.averageDuration)}</strong>
        </Box>
        {currentDuration !== undefined && (
          <Box>
            Current:{" "}
            <strong style={{ color: getStatusColor() }}>
              {formatDuration(currentDuration)}
            </strong>
          </Box>
        )}
        {stats.trend !== "stable" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            Trend:{" "}
            <strong style={{ color: getStatusColor() }}>
              {stats.trend === "up" ? "Slower" : "Faster"}
            </strong>
            {getTrendIcon()}
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" arrow>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "2px",
          padding: "2px 6px",
          borderRadius: "4px",
          backgroundColor: `${getStatusColor()}15`,
          border: `1px solid ${getStatusColor()}44`
        }}
      >
        <SpeedIcon
          sx={{
            fontSize: "0.75rem",
            color: getStatusColor()
          }}
        />
        <Typography
          sx={{
            fontSize: "0.65rem",
            fontWeight: 500,
            color: getStatusColor(),
            fontFamily: "monospace"
          }}
        >
          {formatDuration(stats.averageDuration)}
        </Typography>
        {getTrendIcon()}
      </Box>
    </Tooltip>
  );
};

export default memo(NodePerformanceIndicator);
