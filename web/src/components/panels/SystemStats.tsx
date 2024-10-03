import React, { useMemo, useState, useCallback } from "react";
import {
  Box,
  Tooltip,
  Typography,
  LinearProgress,
  Popover
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

const SystemStatsDisplay: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const { data: systemStats } = useQuery({
    queryKey: ["systemStats"],
    queryFn: async () => {
      const res = await client.GET("/api/models/system_stats");
      return res.data;
    },
    refetchInterval: anchorEl ? 500 : 5000
  });

  const stats = useMemo(
    () => [
      { label: "CPU", value: systemStats?.cpu_percent ?? 0 },
      { label: "RAM", value: systemStats?.memory_percent ?? 0 },
      { label: "VRAM", value: systemStats?.vram_percent ?? 0 }
    ],
    [systemStats]
  );

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  if (!systemStats) return null;

  return (
    <Box className="system-stats" sx={{ mr: 2 }}>
      <Tooltip title="System Stats">
        <Box
          onClick={handleClick}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            padding: "2px",
            minWidth: 60,
            cursor: "pointer"
          }}
        >
          {stats.map((stat) => (
            <LinearProgress
              key={stat.label}
              variant="determinate"
              value={stat.value}
              sx={{
                height: 2,
                borderRadius: 2,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 4
                }
              }}
            />
          ))}
        </Box>
      </Tooltip>
      <Popover
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
      >
        <Box sx={{ p: 2, minWidth: 150 }}>
          {stats.map((stat) => (
            <StatItem key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </Box>
      </Popover>
    </Box>
  );
};

const StatItem: React.FC<{ label: string; value: number }> = ({
  label,
  value
}) => (
  <Box className="system-stats-popover">
    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
      <Typography variant="caption" sx={{ opacity: 0.7 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: "bold" }}>
        {value.toFixed(0)}%
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={value}
      sx={{
        height: 4,
        borderRadius: 4,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        "& .MuiLinearProgress-bar": {
          borderRadius: 4
        }
      }}
    />
  </Box>
);

export default SystemStatsDisplay;
