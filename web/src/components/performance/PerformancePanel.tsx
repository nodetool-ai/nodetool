/**
 * PerformancePanel Component
 *
 * Side panel for workflow performance monitoring and analysis.
 */

import React, { useState, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Button,
  Tooltip
} from "@mui/material";
import {
  Close as CloseIcon,
  Speed as SpeedIcon,
  PlayArrow as PlayIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon
} from "@mui/icons-material";
import { PerformanceDashboard } from "./PerformanceDashboard";
import usePerformanceProfileStore from "../../stores/PerformanceProfileStore";

interface PerformancePanelProps {
  workflowId: string;
  workflowName?: string;
  isRunning?: boolean;
  onRunComplete?: (runId: string) => void;
  onClose: () => void;
}

export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  workflowId,
  workflowName,
  isRunning = false,
  onRunComplete,
  onClose
}) => {
  const [view, setView] = useState<"dashboard" | "realtime">("dashboard");
  const {
    isRecording,
    startRecording,
    endRecording,
    currentRunId
  } = usePerformanceProfileStore();

  const handleStartRecording = useCallback(() => {
    const runId = startRecording(workflowId, workflowName || "Untitled");
    onRunComplete?.(runId);
  }, [workflowId, workflowName, startRecording, onRunComplete]);

  const handleStopRecording = useCallback(() => {
    if (currentRunId) {
      endRecording(currentRunId, isRunning ? "cancelled" : "completed");
    }
  }, [currentRunId, isRunning, endRecording]);

  const handleViewChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, newView: "dashboard" | "realtime" | null) => {
      if (newView !== null) {
        setView(newView);
      }
    },
    []
  );

  const isCurrentlyRecording = isRecording && currentRunId;

  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance</Typography>
          {isCurrentlyRecording && (
            <Tooltip title="Recording performance data">
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <CircularProgress size={14} color="success" />
                <Typography variant="caption" color="success.main">
                  Recording
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={handleViewChange}
          size="small"
          fullWidth
        >
          <ToggleButton value="dashboard">
            <AssessmentIcon fontSize="small" sx={{ mr: 0.5 }} />
            Dashboard
          </ToggleButton>
          <ToggleButton value="realtime">
            <TimelineIcon fontSize="small" sx={{ mr: 0.5 }} />
            Real-time
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {isCurrentlyRecording ? (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<CloseIcon />}
              onClick={handleStopRecording}
              fullWidth
            >
              Stop Recording
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<PlayIcon />}
              onClick={handleStartRecording}
              fullWidth
            >
              Start Recording
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        <PerformanceDashboard workflowId={workflowId} workflowName={workflowName} />
      </Box>
    </Paper>
  );
};

export default PerformancePanel;
