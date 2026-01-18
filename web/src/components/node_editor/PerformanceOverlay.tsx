/**
 * Performance Overlay Component
 *
 * Shows performance metrics directly on the workflow graph
 * with color-coded node borders and execution time indicators.
 */

import React, { useMemo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface PerformanceOverlayProps {
  workflowId: string;
}

export const PerformanceOverlay: React.FC<PerformanceOverlayProps> = ({ workflowId }) => {
  const theme = useTheme();

  const { currentMetrics } = usePerformanceProfilerStore();
  const { getDuration } = useExecutionTimeStore();

  const maxAverageDuration = useMemo(() => {
    if (!currentMetrics) return 1;
    const metrics = Object.values(currentMetrics.nodeMetrics);
    return Math.max(...metrics.map(m => m.averageDuration), 1);
  }, [currentMetrics]);

  if (!currentMetrics) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 16,
        left: 16,
        bgcolor: "rgba(0, 0, 0, 0.8)",
        color: "white",
        p: 1.5,
        borderRadius: 1,
        fontSize: "0.75rem",
        maxWidth: 200
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: theme.palette.success.main,
            animation: "pulse 2s infinite"
          }}
        />
        <Typography variant="caption" fontWeight="bold">
          Performance Active
        </Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.success.main }} />
          <Typography variant="caption">&lt;50% of slowest</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.warning.main }} />
          <Typography variant="caption">50-80% of slowest</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.error.main }} />
          <Typography variant="caption">&gt;80% of slowest (bottleneck)</Typography>
        </Box>
      </Box>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Box>
  );
};

export default PerformanceOverlay;
