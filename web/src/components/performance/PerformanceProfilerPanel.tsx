import React, { memo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Tab,
  Tabs,
  IconButton,
  Tooltip,
  Chip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SpeedIcon from "@mui/icons-material/Speed";
import TimelineIcon from "@mui/icons-material/Timeline";
import AssessmentIcon from "@mui/icons-material/Assessment";
import RefreshIcon from "@mui/icons-material/Refresh";
import usePerformanceProfiler from "../../hooks/usePerformanceProfiler";
import PerformanceSummary from "./PerformanceSummary";
import PerformanceTimeline from "./PerformanceTimeline";
import PerformanceHeatmapOverlay from "./PerformanceHeatmapOverlay";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  onClose?: () => void;
  defaultTab?: number;
  isOpen?: boolean;
  onToggle?: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({
  children,
  index,
  value
}) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`performance-tabpanel-${index}`}
      aria-labelledby={`performance-tab-${index}`}
      style={{ height: "100%" }}
    >
      {value === index && <Box sx={{ height: "100%" }}>{children}</Box>}
    </div>
  );
};

const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  onClose,
  defaultTab = 0,
  isOpen = true,
  onToggle
}) => {
  const [tabValue, setTabValue] = useState(defaultTab);

  const {
    nodePerformanceData,
    maxDuration,
    summary,
    timeline,
    formatDuration,
    getNodeHeatmapColor,
    isNodeBottleneck
  } = usePerformanceProfiler({
    workflowId,
    enabled: isOpen
  });

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const hasData = nodePerformanceData.some(
    (n) => n.duration !== undefined
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: 400,
        maxHeight: 500,
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        borderRadius: 2,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "primary.dark"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon sx={{ color: "white", fontSize: 20 }} />
          <Typography
            variant="subtitle2"
            sx={{ color: "white", fontWeight: 600 }}
          >
            Performance Profiler
          </Typography>
          {hasData && (
            <Chip
              label={`${summary.completedNodes}/${summary.totalNodes}`}
              size="small"
              sx={{
                height: 20,
                fontSize: "0.65rem",
                backgroundColor: "rgba(255,255,255,0.2)",
                color: "white"
              }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {onToggle && (
            <Tooltip title="Toggle profiler">
              <IconButton
                size="small"
                onClick={onToggle}
                sx={{ color: "rgba(255,255,255,0.8)" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onClose && (
            <Tooltip title="Close">
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ color: "rgba(255,255,255,0.8)" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="performance profiler tabs"
          variant="fullWidth"
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              minWidth: 0,
              padding: "8px 12px",
              fontSize: "0.75rem",
              textTransform: "none"
            }
          }}
        >
          <Tab
            icon={<AssessmentIcon fontSize="small" />}
            iconPosition="start"
            label="Summary"
            id="performance-tab-0"
            aria-controls="performance-tabpanel-0"
          />
          <Tab
            icon={<TimelineIcon fontSize="small" />}
            iconPosition="start"
            label="Timeline"
            id="performance-tab-1"
            aria-controls="performance-tabpanel-1"
          />
        </Tabs>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          padding: 2,
          backgroundColor: "background.default"
        }}
      >
        <TabPanel value={tabValue} index={0}>
          <PerformanceSummary
            summary={summary}
            formatDuration={formatDuration}
          />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <PerformanceTimeline
            timeline={timeline}
            formatDuration={formatDuration}
            maxDuration={maxDuration}
            parallelDuration={summary.parallelDuration}
          />
        </TabPanel>
      </Box>

      <Box
        sx={{
          padding: "8px 12px",
          borderTop: 1,
          borderColor: "divider",
          backgroundColor: "background.paper"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <PerformanceHeatmapOverlay
            workflowId={workflowId}
            formatDuration={formatDuration}
            getNodeHeatmapColor={getNodeHeatmapColor}
            isNodeBottleneck={isNodeBottleneck}
            nodePerformanceData={nodePerformanceData}
          />
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {hasData && summary.parallelDuration > 0 && (
              <Typography variant="caption" color="text.secondary">
                Total: {formatDuration(summary.parallelDuration)}
              </Typography>
            )}
            <Tooltip title="Refresh data">
              <IconButton
                size="small"
                onClick={() => {
                  window.location.reload();
                }}
                sx={{ color: "text.secondary" }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default memo(PerformanceProfilerPanel);
