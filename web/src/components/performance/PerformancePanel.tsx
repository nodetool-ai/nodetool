/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import {
  Analytics,
  Delete,
  Download,
  MoreVert
} from "@mui/icons-material";
import PerformanceProfiler from "./PerformanceProfiler";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

interface PerformancePanelProps {
  workflowId: string;
  workflowName: string;
  isRunning?: boolean;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({
  workflowId,
  workflowName,
  isRunning = false
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const clearProfile = usePerformanceProfilerStore((state) => state.clearProfile);
  const clearAllProfiles = usePerformanceProfilerStore((state) => state.clearAllProfiles);
  const getAllProfiles = usePerformanceProfilerStore((state) => state.getAllProfiles);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleClearCurrent = () => {
    clearProfile(workflowId);
    handleMenuClose();
  };

  const handleClearAll = () => {
    clearAllProfiles();
    handleMenuClose();
  };

  const handleExport = () => {
    const profile = usePerformanceProfilerStore.getState().getProfile(workflowId);
    if (profile) {
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `performance-profile-${workflowId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    handleMenuClose();
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Analytics color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Performance Profiler
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Clear current profile">
            <IconButton size="small" onClick={handleClearCurrent}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={handleMenuClick}>
            <MoreVert fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleExport}>
              <ListItemIcon>
                <Download fontSize="small" />
              </ListItemIcon>
              <ListItemText>Export Profile</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleClearAll}>
              <ListItemIcon>
                <Delete fontSize="small" />
              </ListItemIcon>
              <ListItemText>Clear All Profiles</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        <PerformanceProfiler
          workflowId={workflowId}
          workflowName={workflowName}
          isRunning={isRunning}
        />
      </Box>
    </Box>
  );
};

export default PerformancePanel;
