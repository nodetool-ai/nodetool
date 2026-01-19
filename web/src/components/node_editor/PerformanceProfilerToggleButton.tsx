/**
 * Performance Profiler Toggle Button
 *
 * Button to show/hide the Performance Profiler panel in the node editor.
 *
 * @example
 * ```typescript
 * <PerformanceProfilerToggleButton onToggle={toggleProfiler} active={showProfiler} />
 * ```
 */
import React from "react";
import { IconButton, Tooltip, Badge } from "@mui/material";
import { Speed as SpeedIcon } from "@mui/icons-material";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

interface PerformanceProfilerToggleButtonProps {
  onToggle: () => void;
  active: boolean;
  workflowId: string;
}

export const PerformanceProfilerToggleButton: React.FC<PerformanceProfilerToggleButtonProps> = ({
  onToggle,
  active,
  workflowId
}) => {
  const bottlenecks = usePerformanceProfilerStore((state) => {
    const metrics = state.getAllMetrics(workflowId);
    if (metrics.length === 0) {return 0;}

    const durations = metrics.map((m) => {
      const end = m.endTime || Date.now();
      return end - m.startTime;
    });
    const maxDuration = Math.max(...durations);

    let count = 0;
    for (const m of metrics) {
      const duration = (m.endTime || Date.now()) - m.startTime;
      if (duration > maxDuration * 0.5 && duration > 1000) {
        count++;
      }
    }
    return count;
  });

  return (
    <Tooltip title="Performance Profiler">
      <IconButton
        onClick={onToggle}
        color={active ? "primary" : "default"}
        sx={{
          backgroundColor: active
            ? "var(--mt-color-primary, #1976d2)"
            : "transparent",
          color: active
            ? "#fff"
            : "var(--mt-color-text-primary, rgba(0, 0, 0, 0.87))",
          "&:hover": {
            backgroundColor: active
              ? "var(--mt-color-primary-dark, #1565c0)"
              : "var(--mt-color-action-hover, rgba(0, 0, 0, 0.04))"
          }
        }}
      >
        <Badge badgeContent={bottlenecks} color="warning" max={9}>
          <SpeedIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};

export default PerformanceProfilerToggleButton;
