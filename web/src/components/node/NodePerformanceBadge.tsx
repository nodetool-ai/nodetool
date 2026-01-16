/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useState } from "react";
import {
  Typography,
  Box,
  Tooltip,
  Chip,
  Fade
} from "@mui/material";
import {
  Speed,
  Timer,
  TimerOutlined,
  AccessTime
} from "@mui/icons-material";
import isEqual from "lodash/isEqual";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface NodePerformanceBadgeProps {
  nodeId: string;
  workflowId: string;
  status: string;
}

type PerformanceLevel = "fast" | "medium" | "slow" | "error" | "unknown";

interface PerformanceConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  thresholdMs: number;
}

const PERFORMANCE_CONFIGS: Record<PerformanceLevel, PerformanceConfig> = {
  fast: {
    icon: <Speed fontSize="small" />,
    color: "success.main",
    bgColor: "rgba(46, 125, 50, 0.1)",
    label: "Fast",
    thresholdMs: 1000
  },
  medium: {
    icon: <TimerOutlined fontSize="small" />,
    color: "warning.main",
    bgColor: "rgba(237, 108, 2, 0.1)",
    label: "Medium",
    thresholdMs: 5000
  },
  slow: {
    icon: <Timer fontSize="small" />,
    color: "error.main",
    bgColor: "rgba(211, 47, 47, 0.1)",
    label: "Slow",
    thresholdMs: Infinity
  },
  error: {
    icon: <Timer fontSize="small" />,
    color: "error.main",
    bgColor: "rgba(211, 47, 47, 0.1)",
    label: "Failed",
    thresholdMs: 0
  },
  unknown: {
    icon: <AccessTime fontSize="small" />,
    color: "text.secondary",
    bgColor: "rgba(0, 0, 0, 0.05)",
    label: "Pending",
    thresholdMs: 0
  }
};

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
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

const getPerformanceLevel = (
  duration: number | undefined,
  status: string
): PerformanceLevel => {
  if (status === "error" || status === "failed") {
    return "error";
  }
  if (status === "completed" && duration !== undefined) {
    if (duration < 1000) {
      return "fast";
    } else if (duration < 5000) {
      return "medium";
    } else {
      return "slow";
    }
  }
  return "unknown";
};

const NodePerformanceBadge: React.FC<NodePerformanceBadgeProps> = ({
  nodeId,
  workflowId,
  status
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const duration = useExecutionTimeStore((state) =>
    state.getDuration(workflowId, nodeId)
  );

  const performanceLevel = useMemo(
    () => getPerformanceLevel(duration, status),
    [duration, status]
  );

  const config = PERFORMANCE_CONFIGS[performanceLevel];

  const shouldShow = useMemo(
    () =>
      status === "completed" ||
      status === "error" ||
      status === "failed" ||
      status === "running",
    [status]
  );

  if (!shouldShow) {
    return null;
  }

  const isRunning = status === "running";

  return (
    <Tooltip
      title={
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography variant="caption" fontWeight={600}>
            Performance
          </Typography>
          {isRunning ? (
            <Typography variant="caption">Running...</Typography>
          ) : duration !== undefined ? (
            <>
              <Typography variant="caption">
                Duration: {formatDuration(duration)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {config.label} execution
              </Typography>
            </>
          ) : (
            <Typography variant="caption">No timing data</Typography>
          )}
        </Box>
      }
      arrow
      placement="top"
      open={showTooltip}
      onOpen={() => setShowTooltip(true)}
      onClose={() => setShowTooltip(false)}
    >
      <Chip
        size="small"
        icon={
          <Box
            component="span"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18
            }}
          >
            {config.icon}
          </Box>
        }
        label={
          isRunning ? (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5
              }}
            >
              <Fade in={true} style={{ transitionDelay: "0ms" }}>
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "warning.main",
                    animation: "pulse 1s infinite"
                  }}
                />
              </Fade>
              <Fade in={true} style={{ transitionDelay: "200ms" }}>
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "warning.main",
                    animation: "pulse 1s infinite 0.2s"
                  }}
                />
              </Fade>
              <Fade in={true} style={{ transitionDelay: "400ms" }}>
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "warning.main",
                    animation: "pulse 1s infinite 0.4s"
                  }}
                />
              </Fade>
            </Box>
          ) : duration !== undefined ? (
            formatDuration(duration)
          ) : (
            "--"
          )
        }
        sx={{
          height: 22,
          minHeight: 22,
          fontSize: "0.7rem",
          fontWeight: 500,
          bgcolor: config.bgColor,
          color: config.color,
          border: `1px solid ${config.color}30`,
          "& .MuiChip-icon": {
            color: config.color,
            marginLeft: "4px"
          },
          "&:hover": {
            bgcolor: config.color,
            color: "#fff",
            "& .MuiChip-icon": {
              color: "#fff"
            }
          },
          transition: "all 0.2s ease-in-out",
          cursor: "pointer"
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
    </Tooltip>
  );
};

export default memo(NodePerformanceBadge, isEqual);
