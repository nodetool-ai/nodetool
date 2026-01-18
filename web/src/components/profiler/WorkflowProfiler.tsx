import React, { useState } from "react";
import { Box, Paper, Typography, Tab, Tabs, IconButton, Tooltip, Chip } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import { useTheme } from "@mui/material/styles";
import useProfilingStore from "../../stores/ProfilingStore";
import PerformanceSummary from "./PerformanceSummary";
import PerformanceTimeline from "./PerformanceTimeline";
import PerformanceBottlenecks from "./PerformanceBottlenecks";

interface WorkflowProfilerProps {
  workflowId: string;
  onClose?: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ height: "calc(100% - 48px)", overflow: "auto" }}>
    {value === index && children}
  </Box>
);

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({ workflowId, onClose }) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  const { profiles, clearProfile, getProfile } = useProfilingStore();
  const profile = profiles[workflowId];

  const handleExport = () => {
    if (!profile) return;

    const dataStr = JSON.stringify(profile, null, 2);
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = `profile-${profile.workflowName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  };

  if (!profile) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No profiling data available for this workflow
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Run the workflow to generate performance data
        </Typography>
      </Paper>
    );
  }

  const completedNodes = Object.values(profile.nodes).filter(
    n => n.status === "completed" || n.status === "error"
  );
  const progress = profile.nodeCount > 0 ? (completedNodes.length / profile.nodeCount) * 100 : 0;

  return (
    <Paper
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: theme.palette.grey[50]
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Performance Profile
          </Typography>
          <Chip
            label={profile.jobId ? "Completed" : "Running"}
            size="small"
            color={profile.jobId ? "success" : "warning"}
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Export Profile">
            <IconButton size="small" onClick={handleExport}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear Profile">
            <IconButton size="small" onClick={() => clearProfile(workflowId)}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {profile.workflowName}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Total: {formatDuration(profile.totalDuration)}
          </Typography>
        </Box>
        <Box
          sx={{
            height: 4,
            bgcolor: theme.palette.grey[200],
            borderRadius: 2,
            overflow: "hidden"
          }}
        >
          <Box
            sx={{
              width: `${progress}%`,
              height: "100%",
              bgcolor: progress === 100 ? theme.palette.success.main : theme.palette.primary.main,
              transition: "width 0.3s ease"
            }}
          />
        </Box>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        sx={{
          borderBottom: `1px solid ${theme.palette.divider}`,
          minHeight: 40,
          "& .MuiTab-root": {
            minHeight: 40,
            py: 0,
            textTransform: "none",
            fontWeight: 500,
            fontSize: "0.8rem"
          }
        }}
      >
        <Tab label="Summary" />
        <Tab label="Timeline" />
        <Tab label="Bottlenecks" />
      </Tabs>

      <Box sx={{ flex: 1, overflow: "hidden", p: 2 }}>
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}>
            <PerformanceSummary profile={profile} />
          </Box>
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Box sx={{ height: "100%" }}>
            <PerformanceTimeline profile={profile} />
          </Box>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Box sx={{ height: "100%" }}>
            <PerformanceBottlenecks profile={profile} />
          </Box>
        </TabPanel>
      </Box>
    </Paper>
  );
};

export default WorkflowProfiler;
