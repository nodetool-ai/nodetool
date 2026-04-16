import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  LinearProgress,
  Popover
} from "@mui/material";
import { useSystemStatsStore } from "../../stores/systemStatsHandler";
import { FlexColumn, ProgressBar, Tooltip } from "../ui_primitives";

// Memoized inline styles for progress bars
const progressSx = {
  height: 2,
  borderRadius: 2,
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  "& .MuiLinearProgress-bar": {
    borderRadius: 4
  }
} as const;

// ARIA labels for accessibility
const STATS_ARIA_LABELS = {
  cpu: "CPU usage",
  memory: "Memory usage",
  gpu: "GPU Memory usage",
  statsTrigger: "View detailed system stats",
  statsPopover: "Detailed system statistics"
} as const;

const SystemStatsDisplay: React.FC = React.memo(function SystemStatsDisplay() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const systemStats = useSystemStatsStore((state) => state.stats);

  const stats = useMemo(
    () => [
      {
        label: "CPU",
        value: systemStats?.cpu_percent ?? 0,
        ariaLabel: STATS_ARIA_LABELS.cpu
      },
      {
        label: "Memory",
        value: systemStats?.memory_percent ?? 0,
        ariaLabel: STATS_ARIA_LABELS.memory
      },
      {
        label: "GPU Memory",
        value: systemStats?.vram_percent ?? 0,
        ariaLabel: STATS_ARIA_LABELS.gpu
      }
    ],
    [systemStats]
  );

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setAnchorEl(event.currentTarget);
    }
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!systemStats) {return null;}

  const popoverId = "system-stats-popover";
  const triggerId = "system-stats-trigger";

  return (
    <Box
      className="system-stats"
      sx={{ mr: 2 }}
      role="region"
      aria-label="System resource usage"
    >
      <Tooltip title="System Stats">
        <FlexColumn
          id={triggerId}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          gap={1}
          sx={{ padding: "2px", minWidth: 60, cursor: "pointer" }}
          tabIndex={0}
          role="button"
          aria-label={STATS_ARIA_LABELS.statsTrigger}
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchorEl)}
          aria-controls={popoverId}
        >
          {stats.map((stat) => (
            <LinearProgress
              key={stat.label}
              variant="determinate"
              value={stat.value}
              sx={progressSx}
              aria-label={stat.ariaLabel}
              aria-valuenow={stat.value}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          ))}
        </FlexColumn>
      </Tooltip>
      <Popover
        id={popoverId}
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": STATS_ARIA_LABELS.statsPopover
          }
        }}
      >
        <Box sx={{ p: 2, minWidth: 150 }} role="region" aria-live="polite">
          {stats.map((stat) => (
            <StatItem key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </Box>
      </Popover>
    </Box>
  );
});

const StatItem: React.FC<{ label: string; value: number }> = React.memo(function StatItem({
  label,
  value
}) {
  return (
    <Box
      className="system-stats-popover"
      role="group"
      aria-label={`${label}: ${value.toFixed(0)}%`}
    >
      <ProgressBar
        value={value}
        label={label}
        showValue
        formatValue={(v) => `${v.toFixed(0)}%`}
        barHeight={4}
      />
    </Box>
  );
});

export default SystemStatsDisplay;
