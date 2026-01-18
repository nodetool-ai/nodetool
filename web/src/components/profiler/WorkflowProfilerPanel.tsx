/**
 * WorkflowProfilerPanel - Main profiling dashboard panel
 *
 * Provides a comprehensive view of workflow performance including:
 * - Session history and comparison
 * - Statistics overview
 * - Bottleneck analysis
 * - Heatmap toggle
 * - Export functionality
 */

import React, { useState, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  List,
  ListItemButton,
  ListItemText,
  Collapse,
  IconButton,
  Tooltip,
  Divider,
  Chip
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  TrendingDown as TrendingDownIcon
} from "@mui/icons-material";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";
import { useWorkflowRunnerState } from "../../hooks/useWorkflowRunnerState";
import BottleneckAnalysis from "./BottleneckAnalysis";
import PerformanceHeatmap from "./PerformanceHeatmap";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  onNodeFocus?: (nodeId: string) => void;
}

const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  onNodeFocus
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  const {
    isProfiling,
    showHeatmap,
    heatmapMode,
    startProfiling,
    endProfiling,
    setHeatmapVisible,
    setHeatmapMode,
    getAllSessions,
    getLatestSession,
    clearSessions
  } = useWorkflowProfilerStore();

  const runnerState = useWorkflowRunnerState(workflowId);

  const sessions = getAllSessions(workflowId);
  const latestSession = getLatestSession(workflowId);
  const displaySessionId = selectedSessionId || latestSession?.id || null;

  const handleStopProfiling = useCallback(() => {
    endProfiling(workflowId);
  }, [workflowId, endProfiling]);

  const handleRunAndProfile = useCallback(async () => {
    startProfiling(workflowId);
    endProfiling(workflowId);
  }, [workflowId, startProfiling, endProfiling]);

  const toggleExpanded = (sessionId: string) => {
    setExpandedSessions(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }));
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const handleExport = useCallback(() => {
    const data = {
      workflowId,
      sessions: sessions.map(s => ({
        timestamp: s.timestamp,
        totalDuration: s.totalDuration,
        nodeCount: s.nodeCount,
        nodeTimings: s.nodeTimings,
        bottlenecks: s.bottlenecks
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${workflowId}-profile-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflowId, sessions]);

  const handleClearHistory = useCallback(() => {
    if (window.confirm("Clear all profiling history for this workflow?")) {
      clearSessions(workflowId);
      setSelectedSessionId(null);
    }
  }, [workflowId, clearSessions]);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <SpeedIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Performance Profiler
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {!isProfiling ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayIcon />}
            onClick={handleRunAndProfile}
            disabled={runnerState !== "idle"}
          >
            Run & Profile
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<StopIcon />}
            onClick={handleStopProfiling}
          >
            Stop Profiling
          </Button>
        )}

        <Tooltip title={showHeatmap ? "Hide heatmap" : "Show heatmap"}>
          <IconButton
            size="small"
            onClick={() => setHeatmapVisible(!showHeatmap)}
            color={showHeatmap ? "primary" : "default"}
          >
            <TimelineIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Export profiling data">
          <IconButton size="small" onClick={handleExport} disabled={sessions.length === 0}>
            <DownloadIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Clear history">
          <IconButton size="small" onClick={handleClearHistory} disabled={sessions.length === 0}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {showHeatmap && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
            Heatmap Mode
          </Typography>
          <ToggleButtonGroup
            value={heatmapMode}
            exclusive
            onChange={(_, value) => value && setHeatmapMode(value)}
            size="small"
          >
            <ToggleButton value="duration">Duration</ToggleButton>
            <ToggleButton value="relative">Relative</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {showHeatmap && (
        <PerformanceHeatmap workflowId={workflowId} />
      )}

      <Divider sx={{ my: 1 }} />

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {sessions.length === 0 ? (
          <Paper sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No profiling data yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click &quot;Run &amp; Profile&quot; to analyze workflow performance
            </Typography>
          </Paper>
        ) : (
          <>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Session History ({sessions.length})
              </Typography>
              <Chip
                label={displaySessionId === latestSession?.id ? "Latest" : "Historical"}
                size="small"
                color={displaySessionId === latestSession?.id ? "primary" : "default"}
              />
            </Box>

            <List dense sx={{ py: 0 }}>
              {sessions.slice().reverse().map((session) => (
                <Box key={session.id}>
                  <ListItemButton
                    selected={displaySessionId === session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    sx={{ px: 1, py: 0.5 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {formatDuration(session.totalDuration)}
                          </Typography>
                          {session.bottlenecks.length > 0 && (
                            <Chip
                              icon={<TrendingDownIcon />}
                              label={session.bottlenecks.length}
                              size="small"
                              color="warning"
                              sx={{ height: 20, fontSize: "0.65rem" }}
                            />
                          )}
                        </Box>
                      }
                      secondary={formatDate(session.timestamp)}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(session.id);
                      }}
                    >
                      {expandedSessions[session.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </ListItemButton>

                  <Collapse in={expandedSessions[session.id]}>
                    <Box sx={{ pl: 3, pr: 1, py: 1 }}>
                      <BottleneckAnalysis
                        workflowId={workflowId}
                        sessionId={session.id}
                        onNodeSelect={onNodeFocus}
                      />
                    </Box>
                  </Collapse>
                </Box>
              ))}
            </List>
          </>
        )}
      </Box>

      {displaySessionId && (
        <>
          <Divider sx={{ my: 1 }} />
          <BottleneckAnalysis
            workflowId={workflowId}
            sessionId={displaySessionId}
            onNodeSelect={onNodeFocus}
          />
        </>
      )}
    </Box>
  );
};

export default WorkflowProfilerPanel;
