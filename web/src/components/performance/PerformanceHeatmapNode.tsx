import React, { useMemo } from "react";
import {
  Handle,
  Position,
  NodeProps,
  Connection,
  useReactFlow,
  Node
} from "@xyflow/react";
import { Box, Typography, useTheme } from "@mui/material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

interface PerformanceHeatmapNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  duration?: number;
  status?: string;
  hasError?: boolean;
}

type HeatmapNode = Node<PerformanceHeatmapNodeData, "performance-heatmap">;

const formatDuration = (ms: number | undefined): string => {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const getHeatmapColor = (
  duration: number | undefined,
  maxDuration: number,
  hasError: boolean
): string => {
  if (hasError) return "#ef4444";
  if (duration === undefined || maxDuration === 0) return "#6b7280";

  const ratio = duration / maxDuration;

  if (ratio < 0.1) return "#22c55e";
  if (ratio < 0.3) return "#84cc16";
  if (ratio < 0.5) return "#eab308";
  if (ratio < 0.7) return "#f97316";
  return "#ef4444";
};

export const PerformanceHeatmapNode: React.FC<NodeProps<HeatmapNode>> = ({
  data,
  isConnectable,
  selected
}) => {
  const theme = useTheme();
  const { getNodes } = useReactFlow();
  const workflowId = usePerformanceProfilerStore((state) => state.currentProfile?.workflowId || "");

  const { maxDuration, color, displayDuration } = useMemo(() => {
    if (!workflowId) {
      return { maxDuration: 1, color: "#6b7280", displayDuration: data.duration };
    }

    const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
    if (!profile) {
      return { maxDuration: 1, color: "#6b7280", displayDuration: data.duration };
    }

    const durations = profile.nodes
      .filter((n) => n.duration !== undefined)
      .map((n) => n.duration as number);
    const maxDur = Math.max(...durations, 1);

    const errorColor = theme.palette.error.main;
    const completedColor = theme.palette.success.main;
    const runningColor = theme.palette.info.main;
    const pendingColor = theme.palette.grey[500];
    const defaultColor = theme.palette.grey[600];

    const getColorForRatio = (ratio: number): string => {
      if (ratio < 0.1) return theme.palette.success.main;
      if (ratio < 0.3) return "#84cc16";
      if (ratio < 0.5) return theme.palette.warning.main;
      if (ratio < 0.7) return "#f97316";
      return errorColor;
    };

    if (data.hasError) {
      return {
        maxDuration: maxDur,
        color: errorColor,
        displayDuration: data.duration
      };
    }

    if (data.duration === undefined || maxDur === 0) {
      return {
        maxDuration: maxDur,
        color: pendingColor,
        displayDuration: data.duration
      };
    }

    const ratio = data.duration / maxDur;
    const statusColor = data.status === "running" ? runningColor : completedColor;

    return {
      maxDuration: maxDur,
      color: ratio > 0.1 ? getColorForRatio(ratio) : statusColor,
      displayDuration: data.duration
    };
  }, [workflowId, data.duration, data.hasError, data.status, theme]);

  return (
    <Box
      sx={{
        minWidth: 120,
        padding: "8px 12px",
        borderRadius: 1,
        backgroundColor: color,
        color: "#fff",
        border: selected ? "2px solid #fff" : "none",
        boxShadow: selected
          ? "0 0 0 2px rgba(255,255,255,0.5), 0 4px 8px rgba(0,0,0,0.3)"
          : "0 2px 4px rgba(0,0,0,0.2)",
        transition: "all 0.2s ease",
        "&:hover": {
          transform: "scale(1.02)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{
          backgroundColor: "#fff",
          width: 8,
          height: 8,
          border: `2px solid ${color}`
        }}
      />
      <Box sx={{ textAlign: "center" }}>
        <Typography
          variant="caption"
          fontWeight={600}
          sx={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {data.label}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            opacity: 0.9,
            fontSize: "0.65rem"
          }}
        >
          {data.nodeType}
        </Typography>
        {displayDuration !== undefined && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              fontWeight: 700,
              fontSize: "0.75rem"
            }}
          >
            {formatDuration(displayDuration)}
          </Typography>
        )}
        {data.hasError && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              fontSize: "0.65rem",
              fontWeight: 500
            }}
          >
            ERROR
          </Typography>
        )}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{
          backgroundColor: "#fff",
          width: 8,
          height: 8,
          border: `2px solid ${color}`
        }}
      />
    </Box>
  );
};

export default PerformanceHeatmapNode;
