/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";
import { useNodes } from "../../contexts/NodeContext";

interface PerformanceHeatmapProps {
  workflowId: string;
}

const PerformanceHeatmap: React.FC<PerformanceHeatmapProps> = ({ workflowId }) => {
  const profile = usePerformanceProfilerStore((state) => state.getProfile(workflowId));
  const bottlenecks = usePerformanceProfilerStore((state) => state.getBottlenecks(workflowId));
  const nodes = useNodes((state) => state.nodes);

  const sortedNodes = useMemo(() => {
    if (!profile) {
      return [];
    }
    return Object.entries(profile.nodeData)
      .map(([id, data]) => ({
        ...data,
        isBottleneck: bottlenecks.includes(id)
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 5);
  }, [profile, bottlenecks]);

  const maxDuration = useMemo(() => {
    if (!profile || sortedNodes.length === 0) {
      return 1;
    }
    return Math.max(...sortedNodes.map((n) => n.avgDuration), 1);
  }, [profile, sortedNodes]);

  if (!profile || sortedNodes.length === 0) {
    return null;
  }

  const getColor = (duration: number): string => {
    const ratio = duration / maxDuration;
    if (ratio >= 0.5) {
      return "error.main";
    }
    if (ratio >= 0.2) {
      return "warning.main";
    }
    return "success.main";
  };

  const getNodeLabel = (nodeId: string): string => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      return node.data?.title || node.id;
    }
    return nodeId;
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 1000,
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: 2,
        p: 1.5,
        maxWidth: 200
      }}
    >
      <Typography variant="caption" fontWeight={600} sx={{ display: "block", mb: 1 }}>
        Performance Heatmap
      </Typography>

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", mb: 1 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "success.main"
          }}
        />
        <Typography variant="caption" sx={{ flex: 1 }}>Fast (&lt;20%)</Typography>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "warning.main"
          }}
        />
        <Typography variant="caption" sx={{ flex: 1 }}>Medium (20-50%)</Typography>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "error.main"
          }}
        />
        <Typography variant="caption" sx={{ flex: 1 }}>Slow (&gt;50%)</Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {sortedNodes.map((nodeData) => {
          const label = getNodeLabel(nodeData.nodeId);

          return (
            <Tooltip key={nodeData.nodeId} title={`${label}: ${nodeData.avgDuration.toFixed(0)}ms avg`}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: getColor(nodeData.avgDuration),
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ flex: 1, fontWeight: nodeData.isBottleneck ? 600 : 400 }}
                >
                  {label}
                </Typography>
                {nodeData.isBottleneck && (
                  <Typography variant="caption" color="error" fontWeight={600}>
                    ⚠
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
};

export default PerformanceHeatmap;
