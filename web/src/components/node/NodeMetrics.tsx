/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import isEqual from "lodash/isEqual";
import SpeedIcon from "@mui/icons-material/Speed";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import usePerformanceMetricsStore from "../../stores/PerformanceMetricsStore";

interface NodeMetricsProps {
  nodeType: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1);
  return `${minutes}m ${remainingSeconds}s`;
};

const MIN_EXECUTIONS_FOR_DISPLAY = 2;

export const NodeMetrics: React.FC<NodeMetricsProps> = ({ nodeType }) => {
  const getNodeTypeMetrics = usePerformanceMetricsStore(
    (state) => state.getNodeTypeMetrics
  );
  const getAverageDuration = usePerformanceMetricsStore(
    (state) => state.getAverageDuration
  );
  const getPerformanceTrend = usePerformanceMetricsStore(
    (state) => state.getPerformanceTrend
  );

  const metrics = getNodeTypeMetrics(nodeType);
  const averageMs = getAverageDuration(nodeType);
  const trend = getPerformanceTrend(nodeType);

  const hasEnoughData = useMemo(
    () => metrics && metrics.executionCount >= MIN_EXECUTIONS_FOR_DISPLAY,
    [metrics]
  );

  const tooltipContent = useMemo(() => {
    if (!metrics) {
      return "No execution data yet";
    }

    const lines = [
      `Executions: ${metrics.executionCount}`,
      `Average: ${formatDuration(metrics.totalDurationMs / metrics.executionCount)}`,
      `Fastest: ${formatDuration(metrics.minDurationMs)}`,
      `Slowest: ${formatDuration(metrics.maxDurationMs)}`
    ];

    return lines.join("\n");
  }, [metrics]);

  const trendIcon = useMemo(() => {
    switch (trend) {
      case "faster":
        return <TrendingDownIcon sx={{ fontSize: "0.9rem", color: "success.main" }} />;
      case "slower":
        return <TrendingUpIcon sx={{ fontSize: "0.9rem", color: "warning.main" }} />;
      case "normal":
        return <TrendingFlatIcon sx={{ fontSize: "0.9rem", color: "grey.500" }} />;
      default:
        return null;
    }
  }, [trend]);

  const trendColor = useMemo(() => {
    switch (trend) {
      case "faster":
        return "success.main";
      case "slower":
        return "warning.main";
      default:
        return "grey.500";
    }
  }, [trend]);

  if (!hasEnoughData || averageMs === null) {
    return null;
  }

  return (
    <Tooltip
      title={
        <Box>
          <Typography
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            Performance Stats
          </Typography>
          <Typography component="span" sx={{ display: "block", whiteSpace: "pre-line" }}>
            {tooltipContent}
          </Typography>
        </Box>
      }
      placement="bottom"
      arrow
    >
      <Box
        className="node-metrics"
        css={css({
          display: "flex",
          alignItems: "center",
          gap: "2px",
          padding: "2px 6px",
          borderRadius: "4px",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          cursor: "help"
        })}
      >
        <SpeedIcon sx={{ fontSize: "0.8rem", color: trendColor }} />
        <Typography
          sx={{
            fontSize: "9px",
            fontFamily: "var(--fontFamily2)",
            color: trendColor,
            fontWeight: 500
          }}
        >
          avg {formatDuration(averageMs)}
        </Typography>
        {trendIcon}
      </Box>
    </Tooltip>
  );
};

export default memo(NodeMetrics, isEqual);
