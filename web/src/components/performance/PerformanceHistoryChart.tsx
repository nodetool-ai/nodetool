/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface PerformanceHistoryProps {
  history: Array<{
    timestamp: number;
    totalDuration: number;
    nodeCount: number;
    performanceScore: number;
  }>;
  width?: number;
  height?: number;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {return `${Math.round(ms / 1000)}s`;}
  return `${Math.round(ms / 60000)}m`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const PerformanceHistoryChart: React.FC<PerformanceHistoryProps> = memo(
  ({ history, width = 300, height = 150 }) => {
    const chartData = useMemo(() => {
      if (history.length < 2) {return null;}

      const maxDuration = Math.max(...history.map((h) => h.totalDuration));
      const maxScore = 100;

      return history.map((entry, index) => ({
        ...entry,
        durationBarHeight: (entry.totalDuration / maxDuration) * (height - 40),
        scoreBarHeight: (entry.performanceScore / maxScore) * (height - 40),
        x: (index / (history.length - 1)) * (width - 60) + 30
      }));
    }, [history, width, height]);

    if (!chartData || history.length < 2) {
      return (
        <Box sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Run the workflow at least 2 times to see performance history
          </Typography>
        </Box>
      );
    }

    const latestEntry = chartData[chartData.length - 1];
    const previousEntry = chartData[chartData.length - 2];
    const durationChange = latestEntry.totalDuration - previousEntry.totalDuration;
    const scoreChange = latestEntry.performanceScore - previousEntry.performanceScore;

    return (
      <Box sx={{ width: "100%", p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Performance History
        </Typography>

        <Box sx={{ position: "relative", height: height + 20 }}>
          <svg width={width} height={height + 20}>
            {/* Duration bars */}
            {chartData.map((entry, index) => (
              <g key={index}>
                <rect
                  x={entry.x - 8}
                  y={height - entry.durationBarHeight}
                  width={16}
                  height={entry.durationBarHeight}
                  fill="var(--color-primary, #1976d2)"
                  opacity={0.6}
                  rx={2}
                />
                <rect
                  x={entry.x - 8}
                  y={height - entry.scoreBarHeight}
                  width={16}
                  height={entry.scoreBarHeight}
                  fill="var(--color-success, #4caf50)"
                  opacity={0.8}
                  rx={2}
                />
              </g>
            ))}

            {/* Time labels */}
            {chartData.filter((_, i) => i % Math.ceil(history.length / 5) === 0).map((entry, index) => (
              <text
                key={index}
                x={entry.x}
                y={height + 15}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-text-secondary, #666)"
              >
                {formatDate(entry.timestamp)}
              </text>
            ))}
          </svg>

          <Box sx={{ position: "absolute", top: 0, right: 0, display: "flex", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-primary, #1976d2)", opacity: 0.6, borderRadius: 0.5 }} />
              <Typography variant="caption" color="text.secondary">
                Duration
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-success, #4caf50)", opacity: 0.8, borderRadius: 0.5 }} />
              <Typography variant="caption" color="text.secondary">
                Score
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ mt: 2, p: 1, bgcolor: "action.hover", borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Latest Run: {formatDuration(latestEntry.totalDuration)} • Score: {latestEntry.performanceScore}
          </Typography>
          {(durationChange !== 0 || scoreChange !== 0) && (
            <Typography variant="caption" color={durationChange < 0 ? "success.main" : "error.main"}>
              {durationChange < 0 ? "↓" : "↑"} {formatDuration(Math.abs(durationChange))} from previous
              {scoreChange !== 0 && ` • ${scoreChange > 0 ? "↑" : "↓"} ${Math.abs(scoreChange)} points`}
            </Typography>
          )}
        </Box>
      </Box>
    );
  },
  isEqual
);

PerformanceHistoryChart.displayName = "PerformanceHistoryChart";

export default PerformanceHistoryChart;
