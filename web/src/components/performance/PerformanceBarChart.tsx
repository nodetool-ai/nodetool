/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Typography, Paper, LinearProgress } from "@mui/material";
import { styled } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import type { PerformanceProfile, NodePerformanceData } from "../../stores/PerformanceProfilerStore";

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.vars.palette.background.default,
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: theme.shape.borderRadius
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
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

interface PerformanceBarChartProps {
  profile: PerformanceProfile | null;
  maxItems?: number;
  showLabels?: boolean;
}

const NodeBar: React.FC<{
  node: NodePerformanceData;
  maxDuration: number;
  showLabel: boolean;
}> = ({ node, maxDuration, showLabel }) => {
  const percentage = maxDuration > 0 ? (node.duration / maxDuration) * 100 : 0;
  const isBottleneck = percentage > 50;

  const statusColor = useMemo(() => {
    switch (node.status) {
      case "completed":
        return isBottleneck ? "warning.main" : "success.main";
      case "error":
        return "error.main";
      default:
        return "grey.500";
    }
  }, [node.status, isBottleneck]);

  return (
    <Box sx={{ mb: 1 }}>
      {showLabel && (
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" noWrap sx={{ maxWidth: "60%", fontWeight: 500 }}>
            {node.nodeName || node.nodeId}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDuration(node.duration)} ({Math.round(percentage)}%)
          </Typography>
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={percentage}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: "action.hover",
              "& .MuiLinearProgress-bar": {
                backgroundColor: statusColor,
                borderRadius: 4,
                transition: "transform 0.3s ease"
              }
            }}
          />
        </Box>
        {!showLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: "right" }}>
            {formatDuration(node.duration)}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const PerformanceBarChart: React.FC<PerformanceBarChartProps> = ({
  profile,
  maxItems = 10,
  showLabels = true
}) => {
  const sortedNodes = useMemo(() => {
    if (!profile) { return []; }
    return [...profile.nodes].sort((a, b) => b.duration - a.duration).slice(0, maxItems);
  }, [profile, maxItems]);

  const maxDuration = useMemo(() => {
    if (!profile || sortedNodes.length === 0) { return 1; }
    return sortedNodes[0].duration;
  }, [profile, sortedNodes]);

  if (!profile || sortedNodes.length === 0) {
    return (
      <StyledPaper>
        <Typography variant="body2" color="text.secondary">
          No performance data to display.
        </Typography>
      </StyledPaper>
    );
  }

  return (
    <StyledPaper>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Execution Time by Node
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Showing top {Math.min(sortedNodes.length, maxItems)} slowest nodes
        </Typography>
      </Box>

      {sortedNodes.map((node) => (
        <NodeBar
          key={node.nodeId}
          node={node}
          maxDuration={maxDuration}
          showLabel={showLabels}
        />
      ))}

      {profile.nodes.length > maxItems && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          +{profile.nodes.length - maxItems} more nodes
        </Typography>
      )}

      <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: "success.main" }} />
            <Typography variant="caption">Normal</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: "warning.main" }} />
            <Typography variant="caption">Bottleneck (&gt;50%)</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: "error.main" }} />
            <Typography variant="caption">Failed</Typography>
          </Box>
        </Box>
      </Box>
    </StyledPaper>
  );
};

export default memo(PerformanceBarChart, isEqual);
