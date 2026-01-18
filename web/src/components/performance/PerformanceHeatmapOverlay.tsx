import React, { memo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import isEqual from "lodash/isEqual";

interface PerformanceHeatmapLegendProps {
  maxDuration: number;
  formatDuration: (ms: number) => string;
}

export const PerformanceHeatmapLegend: React.FC<PerformanceHeatmapLegendProps> = ({
  maxDuration,
  formatDuration
}) => {
  const thresholds = [0.25, 0.5, 0.75, 1];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        padding: "8px 12px",
        backgroundColor: "background.paper",
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        fontSize: "0.75rem"
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 500 }}>
        Performance:
      </Typography>
      {thresholds.map((threshold, index) => {
        const duration = maxDuration * threshold;
        const nextDuration = maxDuration * thresholds[index + 1];
        const label =
          index === 0
            ? `0 - ${formatDuration(duration)}`
            : index === thresholds.length - 1
            ? `> ${formatDuration(duration)}`
            : `${formatDuration(duration)} - ${formatDuration(nextDuration)}`;

        let color: string;
        if (threshold < 0.25) {color = "rgba(76, 175, 80, 0.3)";}
        else if (threshold < 0.5) {color = "rgba(255, 193, 7, 0.35)";}
        else if (threshold < 0.75) {color = "rgba(255, 152, 0, 0.4)";}
        else {color = "rgba(244, 67, 54, 0.45)";}

        return (
          <Box
            key={threshold}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: 0.5,
                backgroundColor: color,
                border: 1,
                borderColor: "divider"
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

interface PerformanceHeatmapOverlayProps {
  workflowId: string;
  formatDuration: (ms: number) => string;
  getNodeHeatmapColor: (nodeId: string) => string;
  isNodeBottleneck: (nodeId: string) => boolean;
  nodePerformanceData: Array<{
    nodeId: string;
    nodeLabel: string;
    duration: number | undefined;
    status: string;
  }>;
}

const PerformanceHeatmapOverlay: React.FC<PerformanceHeatmapOverlayProps> = ({
  workflowId: _workflowId,
  formatDuration,
  getNodeHeatmapColor,
  isNodeBottleneck,
  nodePerformanceData
}) => {
  const hasData = nodePerformanceData.some(
    (n) => n.duration !== undefined
  );

  if (!hasData) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        gap: 1
      }}
    >
      {nodePerformanceData
        .filter((n) => n.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, 5)
        .map((node) => {
          const color = getNodeHeatmapColor(node.nodeId);
          const isBottleneck = isNodeBottleneck(node.nodeId);

          return (
            <Tooltip
              key={node.nodeId}
              title={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {node.nodeLabel}
                  </Typography>
                  <Typography variant="caption">
                    Duration: {formatDuration(node.duration as number)}
                  </Typography>
                  {isBottleneck && (
                    <Typography
                      variant="caption"
                      sx={{ display: "block", color: "error.light" }}
                    >
                      ⚠️ Bottleneck
                    </Typography>
                  )}
                </Box>
              }
              arrow
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  padding: "4px 8px",
                  backgroundColor: "rgba(0, 0, 0, 0.75)",
                  borderRadius: 1,
                  border: isBottleneck ? 1 : 0,
                  borderColor: "error.main",
                  maxWidth: 200
                }}
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: 0.25,
                    backgroundColor: color,
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: "white",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {node.nodeLabel}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "rgba(255,255,255,0.7)", flexShrink: 0 }}
                >
                  {formatDuration(node.duration as number)}
                </Typography>
                {isBottleneck && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.6rem",
                      color: "error.light",
                      fontWeight: 600
                    }}
                  >
                   !
                  </Box>
                )}
              </Box>
            </Tooltip>
          );
        })}
    </Box>
  );
};

export default memo(PerformanceHeatmapOverlay, isEqual);
