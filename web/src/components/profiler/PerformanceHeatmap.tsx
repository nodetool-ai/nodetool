/**
 * PerformanceHeatmap - Visual overlay showing node execution performance
 *
 * Displays execution times as color-coded overlays on nodes:
 * - Green: Fast (< 1s)
 * - Yellow: Medium (1-5s)
 * - Orange: Slow (5-10s)
 * - Red: Very slow (> 10s)
 */

import React, { useMemo } from "react";
import { Box, Typography, Paper, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";
import { useNodes } from "@xyflow/react";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface PerformanceHeatmapProps {
  workflowId: string;
}

const PerformanceHeatmap: React.FC<PerformanceHeatmapProps> = ({ workflowId }) => {
  const theme = useTheme();
  const { showHeatmap, heatmapMode, setHeatmapMode } = useWorkflowProfilerStore();
  const nodes = useNodes();
  const getDuration = useExecutionTimeStore((state) => state.getDuration);

  const nodeTimings = useMemo(() => {
    const timings: Record<string, number> = {};
    for (const node of nodes) {
      const duration = getDuration(workflowId, node.id);
      if (duration !== undefined) {
        timings[node.id] = duration;
      }
    }
    return timings;
  }, [nodes, workflowId, getDuration]);

  const maxDuration = useMemo(() => {
    const durations = Object.values(nodeTimings);
    return durations.length > 0 ? Math.max(...durations) : 1000;
  }, [nodeTimings]);

  const getHeatmapColor = (nodeId: string): string => {
    const duration = nodeTimings[nodeId];
    if (duration === undefined) {return "transparent";}

    if (heatmapMode === "relative") {
      const ratio = duration / maxDuration;
      if (ratio < 0.2) {return theme.vars?.palette?.success?.light || "#4caf50";}
      if (ratio < 0.4) {return theme.vars?.palette?.warning?.light || "#ffeb3b";}
      if (ratio < 0.6) {return theme.vars?.palette?.warning?.main || "#ff9800";}
      if (ratio < 0.8) {return theme.vars?.palette?.error?.light || "#f44336";}
      return theme.vars?.palette?.error?.main || "#d32f2f";
    }

    if (duration < 1000) {return theme.vars?.palette?.success?.light || "#4caf50";}
    if (duration < 5000) {return theme.vars?.palette?.warning?.light || "#ffeb3b";}
    if (duration < 10000) {return theme.vars?.palette?.warning?.main || "#ff9800";}
    return theme.vars?.palette?.error?.main || "#d32f2f";
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {return `${Math.round(ms)}ms`;}
    if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  if (!showHeatmap) {return null;}

  const timedNodes = Object.entries(nodeTimings).filter(([_, t]) => t > 0);

  return (
    <Paper
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 1000,
        p: 1.5,
        minWidth: 200,
        backdropFilter: "blur(8px)"
      }}
      elevation={3}
    >
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Performance Heatmap
      </Typography>

      <ToggleButtonGroup
        value={heatmapMode}
        exclusive
        onChange={(_, value) => value && setHeatmapMode(value)}
        size="small"
        sx={{ mb: 1.5, width: "100%" }}
      >
        <ToggleButton value="duration" sx={{ flex: 1, fontSize: "0.7rem" }}>
          Duration
        </ToggleButton>
        <ToggleButton value="relative" sx={{ flex: 1, fontSize: "0.7rem" }}>
          Relative
        </ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {timedNodes.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No execution data available
          </Typography>
        ) : (
          timedNodes
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([nodeId, duration]) => {
              const node = nodes.find((n: { id: string }) => n.id === nodeId);
              const label = node?.data?.label;
              const title = node?.data?.title;
              const nodeLabel: string = (typeof label === "string" ? label : null)
                || (typeof title === "string" ? title : null)
                || nodeId
                || "Unknown";
              const color = getHeatmapColor(nodeId);

              return (
                <Box
                  key={nodeId}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    p: 0.5,
                    borderRadius: 0.5,
                    backgroundColor: color,
                    opacity: 0.8
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "white",
                      opacity: 0.9
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: duration > 5000 ? "white" : "text.primary"
                    }}
                  >
                    {nodeLabel}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: duration > 5000 ? "white" : "text.primary"
                    }}
                  >
                    {formatDuration(duration)}
                  </Typography>
                </Box>
              );
            })
        )}
      </Box>

      <Box sx={{ mt: 1.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {["<1s", "1-5s", "5-10s", ">10s"].map((label, i) => {
          const colors = [
            theme.vars?.palette?.success?.light || "#4caf50",
            theme.vars?.palette?.warning?.light || "#ffeb3b",
            theme.vars?.palette?.warning?.main || "#ff9800",
            theme.vars?.palette?.error?.main || "#d32f2f"
          ];
          return (
            <Box
              key={label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25
              }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 0.5,
                  backgroundColor: colors[i]
                }}
              />
              <Typography variant="caption" sx={{ fontSize: "0.65rem" }}>
                {label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

export default PerformanceHeatmap;
