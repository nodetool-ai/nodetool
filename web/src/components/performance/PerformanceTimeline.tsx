/**
 * PerformanceTimeline Component
 *
 * Visualizes workflow execution performance as a timeline bar chart.
 * Shows execution duration for each node with color-coded indicators.
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Tooltip,
  useTheme
} from "@mui/material";
import { NodePerformanceMetrics } from "../../stores/PerformanceProfilerStore";
import { formatDuration } from "../../hooks/useWorkflowPerformance";

interface PerformanceTimelineProps {
  nodes: NodePerformanceMetrics[];
  totalDuration: number;
  width?: number;
  height?: number;
}

const PerformanceTimeline: React.FC<PerformanceTimelineProps> = ({
  nodes,
  totalDuration,
  width = 300,
  height = 200
}) => {
  const theme = useTheme();

  const sortedNodes = useMemo(() => {
    return [...nodes]
      .filter(n => n.duration > 0)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }, [nodes]);

  const maxDuration = useMemo(() => {
    return Math.max(...sortedNodes.map(n => n.duration), 1);
  }, [sortedNodes]);

  const getBarColor = (node: NodePerformanceMetrics): string => {
    const ratio = node.duration / maxDuration;
    if (node.isParallelizable) {
      return ratio > 0.7
        ? theme.palette.warning.main
        : theme.palette.info.main;
    }
    return ratio > 0.7
      ? theme.palette.error.main
      : ratio > 0.4
        ? theme.palette.warning.main
        : theme.palette.success.main;
  };

  if (sortedNodes.length === 0) {
    return (
      <Paper
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: theme.palette.action.hover
        }}
      >
        <Typography variant="caption" color="text.secondary">
          No execution data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        width,
        p: 1,
        bgcolor: theme.palette.background.paper
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Top {sortedNodes.length} Slowest Nodes
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {sortedNodes.map((node) => {
          const percentage = (node.duration / maxDuration) * 100;
          const isBottleneck = percentage >= 50;

          return (
            <Tooltip
              key={node.nodeId}
              title={
                <Box>
                  <Typography variant="caption" fontWeight="bold">
                    {node.nodeName}
                  </Typography>
                  <br />
                  <Typography variant="caption">
                    Type: {node.nodeType.split(".").pop()}
                  </Typography>
                  <br />
                  <Typography variant="caption">
                    Duration: {formatDuration(node.duration)}
                  </Typography>
                  {node.isParallelizable && (
                    <>
                      <br />
                      <Typography variant="caption" color="info.main">
                        Parallelizable
                      </Typography>
                    </>
                  )}
                </Box>
              }
              arrow
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    minWidth: 60,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {node.nodeName}
                </Typography>
                <Box sx={{ flex: 1, position: "relative" }}>
                  <LinearProgress
                    variant="determinate"
                    value={percentage}
                    sx={{
                      height: 16,
                      borderRadius: 1,
                      bgcolor: theme.palette.action.hover,
                      "& .MuiLinearProgress-bar": {
                        bgcolor: getBarColor(node),
                        transition: "width 0.3s ease"
                      }
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      position: "absolute",
                      right: 4,
                      top: 0,
                      lineHeight: "16px",
                      color: percentage > 30 ? "white" : "text.secondary",
                      fontSize: "0.6rem",
                      fontWeight: isBottleneck ? "bold" : "normal"
                    }}
                  >
                    {formatDuration(node.duration)}
                  </Typography>
                </Box>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 1,
          pt: 1,
          borderTop: 1,
          borderColor: theme.palette.divider,
          display: "flex",
          justifyContent: "space-between"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Total: {formatDuration(totalDuration)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {sortedNodes.length} nodes shown
        </Typography>
      </Box>
    </Paper>
  );
};

export default PerformanceTimeline;
