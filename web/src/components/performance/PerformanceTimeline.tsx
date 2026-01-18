/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  useTheme,
  Tooltip
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import isEqual from "lodash/isEqual";

interface PerformanceTimelineProps {
  timeline: Array<{
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
    startTime: number;
    endTime: number | undefined;
    duration: number | undefined;
    status: string;
    rowIndex: number;
  }>;
  formatDuration: (ms: number) => string;
  maxDuration: number;
  parallelDuration: number;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case "completed":
      return "success.main";
    case "error":
      return "error.main";
    case "running":
      return "info.main";
    default:
      return "text.disabled";
  }
};

const getStatusIcon = (status: string): React.ReactNode => {
  switch (status) {
    case "completed":
      return <CheckCircleIcon sx={{ fontSize: 14 }} />;
    case "error":
      return <ErrorIcon sx={{ fontSize: 14 }} />;
    case "running":
      return <HourglassEmptyIcon sx={{ fontSize: 14 }} />;
    default:
      return null;
  }
};

const PerformanceTimeline: React.FC<PerformanceTimelineProps> = ({
  timeline,
  formatDuration,
  maxDuration: _maxDuration,
  parallelDuration
}) => {
  const _theme = useTheme();

  const timeRange = useMemo((): { start: number; end: number } => {
    if (timeline.length === 0) {
      return { start: 0, end: 1000 };
    }

    const allTimes = timeline.flatMap((t) =>
      t.endTime !== undefined ? [t.startTime, t.endTime] : [t.startTime]
    );
    return {
      start: Math.min(...allTimes),
      end: Math.max(...allTimes)
    };
  }, [timeline]);

  const timeSpan = timeRange.end - timeRange.start;

  const toPixelPosition = (time: number): number => {
    if (timeSpan === 0) {
      return 0;
    }
    return ((time - timeRange.start) / timeSpan) * 100;
  };

  if (timeline.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: "text.secondary"
        }}
      >
        <AccessTimeIcon sx={{ fontSize: 48, opacity: 0.5, mb: 1 }} />
        <Typography variant="body2">
          No execution data yet. Run the workflow to see the timeline.
        </Typography>
      </Box>
    );
  }

  const rowCount = Math.max(...timeline.map((t) => t.rowIndex)) + 1;
  const rowHeight = 36;
  const headerHeight = 32;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AccessTimeIcon fontSize="small" />
          Execution Timeline
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Parallel time: {formatDuration(parallelDuration)}
        </Typography>
      </Box>

      <Box
        sx={{
          position: "relative",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: "background.default"
        }}
      >
        <Box
          sx={{
            height: headerHeight,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "flex-end",
            position: "relative"
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const time = timeRange.start + timeSpan * ratio;
            return (
              <Box
                key={ratio}
                sx={{
                  position: "absolute",
                  left: `${ratio * 100}%`,
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center"
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.65rem"
                  }}
                >
                  {formatDuration(time - timeRange.start)}
                </Typography>
                <Box
                  sx={{
                    width: 1,
                    height: 4,
                    backgroundColor: "divider"
                  }}
                />
              </Box>
            );
          })}
        </Box>

        <Box sx={{ position: "relative" }}>
          {Array.from({ length: rowCount }).map((_, rowIndex) => (
            <Box
              key={rowIndex}
              sx={{
                height: rowHeight,
                borderBottom: rowIndex < rowCount - 1 ? 1 : 0,
                borderColor: "divider",
                position: "relative",
                display: "flex",
                alignItems: "center"
              }}
            >
              {timeline
                .filter((t) => t.rowIndex === rowIndex)
                .map((event) => {
                  const left = toPixelPosition(event.startTime);
                  const width =
                    event.endTime !== undefined
                      ? toPixelPosition(event.endTime) - left
                      : 5;
                  const statusColor = getStatusColor(event.status);

                  return (
                    <Tooltip
                      key={event.nodeId}
                      title={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {event.nodeLabel}
                          </Typography>
                          <Typography variant="caption">
                            {event.nodeType}
                          </Typography>
                          <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                            <Chip
                              size="small"
                              label={event.status}
                              sx={{
                                height: 18,
                                fontSize: "0.65rem",
                                backgroundColor: statusColor,
                                color: "white"
                              }}
                            />
                            {event.duration && (
                              <Chip
                                size="small"
                                label={formatDuration(event.duration)}
                                sx={{
                                  height: 18,
                                  fontSize: "0.65rem"
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                      }
                      arrow
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${Math.max(width, 2)}%`,
                          height: 24,
                          backgroundColor: statusColor,
                          borderRadius: 0.5,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 8px",
                          overflow: "hidden",
                          cursor: "pointer",
                          opacity: event.status === "running" ? 0.7 : 1,
                          transition: "opacity 0.2s",
                          "&:hover": {
                            opacity: 0.9
                          }
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: "white",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "0.7rem"
                          }}
                        >
                          {event.nodeLabel}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          mt: 2,
          flexWrap: "wrap"
        }}
      >
        {["completed", "error", "running", "pending"].map((status) => {
          const count = timeline.filter((t) => t.status === status).length;
          if (count === 0) {return null;}

          return (
            <Box
              key={status}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5
              }}
            >
              {getStatusIcon(status)}
              <Typography variant="caption" color="text.secondary">
                {status}: {count}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default memo(PerformanceTimeline, isEqual);
