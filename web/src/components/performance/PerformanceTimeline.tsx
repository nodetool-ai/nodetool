import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  IconButton,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import {
  ZoomIn,
  ZoomOut,
  Refresh
} from "@mui/icons-material";
import usePerformanceProfilerStore, {
  WorkflowPerformanceProfile
} from "../../stores/PerformanceProfilerStore";

interface PerformanceTimelineProps {
  workflowId: string;
  nodes: { id: string; type: string; data: Record<string, any> }[];
  width?: number;
  height?: number;
}

interface TimelineNode {
  id: string;
  label: string;
  type: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: string;
  hasError: boolean;
}

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const getStatusColor = (status: string, hasError: boolean): string => {
  if (hasError) return "#ef4444";
  if (status === "completed" || status === "success") return "#22c55e";
  if (status === "running") return "#3b82f6";
  if (status === "pending") return "#9ca3af";
  return "#6b7280";
};

const getBarColor = (status: string, hasError: boolean): string => {
  if (hasError) return "error.main";
  if (status === "completed" || status === "success") return "success.main";
  if (status === "running") return "info.main";
  return "action.disabledBackground";
};

export const PerformanceTimeline: React.FC<PerformanceTimelineProps> = ({
  workflowId,
  nodes,
  width = 600,
  height = 200
}) => {
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  const profile = usePerformanceProfilerStore((state) =>
    state.analyzeWorkflow(workflowId, nodes)
  );

  const timelineData = useMemo((): TimelineNode[] => {
    if (!profile || profile.nodes.length === 0) return [];

    return profile.nodes
      .filter((n) => n.duration !== undefined)
      .map((n) => {
        const timing = usePerformanceProfilerStore.getState()
          .profiles[workflowId]?.nodes.find((node) => node.nodeId === n.nodeId);
        return {
          id: n.nodeId,
          label: n.nodeLabel,
          type: n.nodeType,
          startTime: 0,
          endTime: n.duration || 0,
          duration: n.duration || 0,
          status: n.status,
          hasError: n.hasError
        };
      })
      .sort((a, b) => a.startTime - b.startTime);
  }, [profile, workflowId]);

  const maxDuration = useMemo(() => {
    if (timelineData.length === 0) return 1000;
    return Math.max(...timelineData.map((n) => n.endTime), 1);
  }, [timelineData]);

  const chartWidth = Math.max(width - 80, 200) * zoom;
  const chartHeight = Math.max(height, timelineData.length * 28 + 40);

  const timeScale = chartWidth / maxDuration;

  const gridLines = useMemo(() => {
    if (!showGrid || maxDuration === 0) return [];

    const lines: { position: number; label: string }[] = [];
    const step = maxDuration / 10;

    for (let i = 0; i <= 10; i++) {
      const time = step * i;
      lines.push({
        position: time * timeScale,
        label: formatTime(time)
      });
    }

    return lines;
  }, [maxDuration, timeScale, showGrid]);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.5));
  const handleReset = () => {
    setZoom(1);
    setShowGrid(true);
  };

  if (timelineData.length === 0) {
    return (
      <Paper
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.paper"
        }}
      >
        <Typography color="text.secondary">
          Run the workflow to see the execution timeline
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ backgroundColor: "background.paper", overflow: "hidden" }}>
      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Execution Timeline
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={handleZoomOut}>
            <ZoomOut fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ mx: 1 }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={handleZoomIn}>
            <ZoomIn fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleReset}>
            <Refresh fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ overflow: "auto", p: 1 }}>
        <Box sx={{ position: "relative", width: chartWidth + 80, minHeight: chartHeight }}>
          <Box sx={{ display: "flex" }}>
            <Box
              sx={{
                width: 80,
                flexShrink: 0,
                borderRight: 1,
                borderColor: "divider"
              }}
            >
              <Box sx={{ height: 28 }} />
              {timelineData.map((node) => (
                <Box
                  key={node.id}
                  sx={{
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    px: 1,
                    borderBottom: 1,
                    borderColor: "divider"
                  }}
                >
                  <Tooltip title={`${node.label} (${node.type})`} arrow>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        fontWeight: 500
                      }}
                    >
                      {node.label}
                    </Typography>
                  </Tooltip>
                </Box>
              ))}
            </Box>

            <Box sx={{ flex: 1, overflow: "hidden" }}>
              <Box sx={{ height: 28, position: "relative", borderBottom: 1, borderColor: "divider" }}>
                {gridLines.map((line, index) => (
                  <Box
                    key={index}
                    sx={{
                      position: "absolute",
                      left: line.position,
                      top: 0,
                      bottom: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end"
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.6rem",
                        color: "text.secondary",
                        transform: "translateX(-50%)"
                      }}
                    >
                      {line.label}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {timelineData.map((node) => {
                const left = node.startTime * timeScale;
                const barWidth = node.duration * timeScale;

                return (
                  <Box
                    key={node.id}
                    sx={{
                      height: 28,
                      position: "relative",
                      borderBottom: 1,
                      borderColor: "divider",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute",
                        left,
                        width: barWidth,
                        height: 16,
                        borderRadius: 1,
                        backgroundColor: getBarColor(node.status, node.hasError),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        px: 0.5,
                        overflow: "hidden"
                      }}
                    >
                      {barWidth > 40 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "white",
                            fontSize: "0.65rem",
                            fontWeight: 500,
                            whiteSpace: "nowrap"
                          }}
                        >
                          {formatTime(node.duration)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ p: 1, borderTop: 1, borderColor: "divider", display: "flex", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: "action.disabledBackground" }} />
          <Typography variant="caption" color="text.secondary">
            Pending
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: "info.main" }} />
          <Typography variant="caption" color="text.secondary">
            Running
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: "success.main" }} />
          <Typography variant="caption" color="text.secondary">
            Completed
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, backgroundColor: "error.main" }} />
          <Typography variant="caption" color="text.secondary">
            Error
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default PerformanceTimeline;
