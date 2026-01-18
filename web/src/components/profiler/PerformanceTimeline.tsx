import React, { useMemo } from "react";
import { Box, Typography, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useProfilingStore, { WorkflowProfile } from "../../stores/ProfilingStore";

interface PerformanceTimelineProps {
  profile: WorkflowProfile;
}

export const PerformanceTimeline: React.FC<PerformanceTimelineProps> = ({ profile }) => {
  const theme = useTheme();

  const { maxDuration, layerData } = useMemo(() => {
    const nodesWithTiming = Object.values(profile.nodes).filter(n => n.startTime > 0);
    const maxDur = nodesWithTiming.length > 0
      ? Math.max(...nodesWithTiming.map(n => n.endTime)) - profile.startedAt
      : profile.totalDuration;

    const layers: Record<number, { name: string; start: number; end: number; nodes: string[] }> = {};
    nodesWithTiming.forEach(node => {
      if (!layers[node.layer]) {
        layers[node.layer] = { name: `Layer ${node.layer}`, start: node.startTime, end: node.endTime, nodes: [] };
      }
      layers[node.layer].start = Math.min(layers[node.layer].start, node.startTime);
      layers[node.layer].end = Math.max(layers[node.layer].end, node.endTime);
      layers[node.layer].nodes.push(node.nodeId);
    });

    return { maxDuration: maxDur, layerData: Object.values(layers).sort((a, b) => a.start - b.start) };
  }, [profile]);

  const formatTime = (ms: number): string => {
    const offset = ms - profile.startedAt;
    if (offset < 1000) return `${offset}ms`;
    if (offset < 60000) return `${(offset / 1000).toFixed(1)}s`;
    const minutes = Math.floor(offset / 60000);
    const seconds = ((offset % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  const timeMarkers = useMemo(() => {
    if (maxDuration === 0) return [];
    const markers: number[] = [];
    const step = maxDuration / 5;
    for (let i = 0; i <= 5; i++) {
      markers.push(Math.floor(step * i));
    }
    return markers;
  }, [maxDuration]);

  const getLayerColor = (layerIndex: number): string => {
    const colors = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.success.main,
      theme.palette.warning.main,
      theme.palette.info.main,
      theme.palette.error.main
    ];
    return colors[layerIndex % colors.length];
  };

  if (Object.values(profile.nodes).every(n => n.startTime === 0)) {
    return (
      <Paper sx={{ p: 2, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Workflow execution data will appear here after running
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
        Execution Timeline
      </Typography>

      <Box sx={{ flex: 1, overflow: "auto", position: "relative" }}>
        <Box sx={{ position: "relative", minHeight: layerData.length * 40 + 40 }}>
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 60,
              right: 0,
              bottom: 0
            }}
          >
            {timeMarkers.map((marker, i) => (
              <Box
                key={i}
                sx={{
                  position: "absolute",
                  left: `${(marker / maxDuration) * 100}%`,
                  top: 0,
                  bottom: 0,
                  borderLeft: i === 0 ? `2px solid ${theme.palette.divider}` : `1px dashed ${theme.palette.divider}`,
                  zIndex: 0
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    top: -20,
                    left: 4,
                    transform: "translateX(-50%)",
                    color: "text.secondary",
                    whiteSpace: "nowrap"
                  }}
                >
                  {formatTime(profile.startedAt + marker)}
                </Typography>
              </Box>
            ))}

            {layerData.map((layer, layerIndex) => {
              const left = ((layer.start - profile.startedAt) / maxDuration) * 100;
              const width = Math.max(((layer.end - layer.start) / maxDuration) * 100, 2);

              return (
                <Box
                  key={layer.name}
                  sx={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: layerIndex * 40 + 20,
                    height: 24,
                    bgcolor: `${getLayerColor(layerIndex)}40`,
                    border: `2px solid ${getLayerColor(layerIndex)}`,
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    px: 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      bgcolor: `${getLayerColor(layerIndex)}60`,
                      zIndex: 10
                    }
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 500,
                      color: getLayerColor(layerIndex),
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {layer.nodes.length > 1
                      ? `${layer.nodes.length} nodes`
                      : profile.nodes[layer.nodes[0]]?.nodeName || layer.name}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 50,
              borderRight: `1px solid ${theme.palette.divider}`
            }}
          >
            {layerData.map((layer, layerIndex) => (
              <Typography
                key={layer.name}
                variant="caption"
                sx={{
                  position: "absolute",
                  left: 4,
                  top: layerIndex * 40 + 22,
                  color: "text.secondary",
                  fontWeight: 500
                }}
              >
                L{layerIndex}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mt: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: theme.palette.primary.main }} />
          <Typography variant="caption" color="text.secondary">Sequential</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: theme.palette.success.main }} />
          <Typography variant="caption" color="text.secondary">Parallel</Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default PerformanceTimeline;
