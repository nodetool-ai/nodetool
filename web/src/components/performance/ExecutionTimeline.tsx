/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface ExecutionTimelineProps {
  timings: Array<{
    nodeId: string;
    nodeName: string;
    duration: number;
    startTime: number;
    endTime: number;
  }>;
  totalDuration: number;
  height?: number;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {return `${Math.round(ms / 1000)}s`;}
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const getColorForDuration = (duration: number, maxDuration: number): string => {
  const ratio = duration / maxDuration;
  if (ratio > 0.7) {return "var(--color-error, #f44336)";}
  if (ratio > 0.4) {return "var(--color-warning, #ff9800)";}
  if (ratio > 0.2) {return "var(--color-info, #2196f3)";}
  return "var(--color-success, #4caf50)";
};

const ExecutionTimeline: React.FC<ExecutionTimelineProps> = memo(
  ({ timings, totalDuration, height = 200 }) => {
    const maxDuration = Math.max(...timings.map((t) => t.duration), 1);

    return (
      <Box sx={{ width: "100%", p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Execution Timeline
        </Typography>

        <Box
          sx={{
            position: "relative",
            height: height,
            borderLeft: 2,
            borderColor: "divider",
            pl: 2
          }}
        >
          {timings.map((timing, index) => {
            const top = (index / timings.length) * (height - 40);
            const barWidth = (timing.duration / maxDuration) * 100;

            return (
              <Box
                key={timing.nodeId}
                sx={{
                  position: "absolute",
                  top,
                  left: 0,
                  right: 0,
                  display: "flex",
                  alignItems: "center",
                  height: 32
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    width: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {timing.nodeName}
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    height: "100%",
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    overflow: "hidden",
                    ml: 1
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${barWidth}%`,
                      bgcolor: getColorForDuration(timing.duration, maxDuration),
                      borderRadius: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      pr: 1,
                      transition: "width 0.3s ease-in-out"
                    }}
                  >
                    <Typography variant="caption" color="white" fontWeight="medium">
                      {formatDuration(timing.duration)}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, minWidth: 50 }}>
                  {Math.round((timing.duration / totalDuration) * 100)}%
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-success, #4caf50)", borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Fast (&lt;20%)
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-info, #2196f3)", borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Medium (20-40%)
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-warning, #ff9800)", borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Slow (40-70%)
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: "var(--color-error, #f44336)", borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Bottleneck (&gt;70%)
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  },
  isEqual
);

ExecutionTimeline.displayName = "ExecutionTimeline";

export default ExecutionTimeline;
