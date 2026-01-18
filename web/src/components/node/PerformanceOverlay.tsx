import React, { useMemo } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { Circle, TrendingUp, TrendingDown } from "@mui/icons-material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";
import { useTheme } from "@mui/material/styles";

interface PerformanceOverlayProps {
  workflowId: string;
  nodeId: string;
  _nodeType: string;
  nodeName: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
};

export const PerformanceOverlay: React.FC<PerformanceOverlayProps> = ({
  workflowId,
  nodeId,
  _nodeType,
  nodeName
}) => {
  const theme = useTheme();
  
  const profile = usePerformanceProfilerStore((state) =>
    state.profiles[workflowId]
  );
  const isProfiling = usePerformanceProfilerStore((state) => state.isProfiling);
  const currentWorkflowId = usePerformanceProfilerStore(
    (state) => state.currentWorkflowId
  );

  const metrics = useMemo(() => {
    if (!profile) {
      return null;
    }
    return profile.nodeMetrics[nodeId] || null;
  }, [profile, nodeId]);

  const allDurations = useMemo(() => {
    if (!profile) {
      return [];
    }
    return Object.values(profile.nodeMetrics).map((m) => m.duration);
  }, [profile]);

  const avgDuration = useMemo(() => {
    if (allDurations.length === 0) {
      return 0;
    }
    return allDurations.reduce((sum, d) => sum + d, 0) / allDurations.length;
  }, [allDurations]);

  const percentile = useMemo(() => {
    if (!metrics || allDurations.length === 0) {
      return null;
    }
    const sorted = [...allDurations].sort((a, b) => a - b);
    const index = sorted.indexOf(metrics.duration);
    return Math.round((index / sorted.length) * 100);
  }, [metrics, allDurations]);

  const performanceLevel = useMemo(() => {
    if (!metrics || avgDuration === 0) {
      return "unknown";
    }
    if (metrics.duration < avgDuration * 0.5) {
      return "good";
    }
    if (metrics.duration > avgDuration * 1.5) {
      return "poor";
    }
    return "medium";
  }, [metrics, avgDuration]);

  const isActive = isProfiling && currentWorkflowId === workflowId;

  if (!metrics && !isActive) {
    return null;
  }

  const colors = {
    good: theme.palette.success.main,
    medium: theme.palette.warning.main,
    poor: theme.palette.error.main,
    unknown: theme.palette.text.secondary
  };

  const icon = performanceLevel === "good" ? (
    <TrendingDown fontSize="small" sx={{ color: colors.good }} />
  ) : performanceLevel === "poor" ? (
    <TrendingUp fontSize="small" sx={{ color: colors.poor }} />
  ) : null;

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="subtitle2">{nodeName}</Typography>
          {metrics && (
            <>
              <Typography variant="caption" display="block">
                Duration: {formatDuration(metrics.duration)}
              </Typography>
              <Typography variant="caption" display="block">
                Calls: {metrics.calls}
              </Typography>
              <Typography variant="caption" display="block">
                Average: {formatDuration(metrics.avgDuration)}
              </Typography>
              {percentile !== null && (
                <Typography variant="caption" display="block">
                  Slower than {100 - percentile}% of nodes
                </Typography>
              )}
            </>
          )}
          {isActive && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Recording...
            </Typography>
          )}
        </Box>
      }
      arrow
    >
      <Box
        sx={{
          position: "absolute",
          top: -8,
          right: -8,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          bgcolor: "background.paper",
          borderRadius: 2,
          px: 0.5,
          py: 0.25,
          boxShadow: 1,
          zIndex: 10
        }}
      >
        <Circle
          sx={{
            fontSize: 8,
            color: isActive
              ? theme.palette.warning.main
              : colors[performanceLevel]
          }}
        />
        {metrics && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: colors[performanceLevel],
              fontSize: "0.65rem"
            }}
          >
            {formatDuration(metrics.duration)}
          </Typography>
        )}
        {icon}
      </Box>
    </Tooltip>
  );
};

export default PerformanceOverlay;
