/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Divider,
  TextField,
  Switch,
  FormControlLabel
} from "@mui/material";
import { memo } from "react";
import isEqual from "lodash/isEqual";

// Icons
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import StopIcon from "@mui/icons-material/Stop";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import HistoryIcon from "@mui/icons-material/History";
import SpeedIcon from "@mui/icons-material/Speed";
import BugReportIcon from "@mui/icons-material/BugReport";
import CircleIcon from "@mui/icons-material/Circle";

import { useDebugPanelStore, ExecutionEvent } from "../../stores/DebugPanelStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useMemo } from "react";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    ".debug-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      backgroundColor: theme.vars.palette.background.default
    },
    ".debug-controls": {
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    ".debug-content": {
      flex: 1,
      overflow: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "12px"
    },
    ".section": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".section-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "& .title": {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontWeight: 600,
        fontSize: "14px"
      }
    },
    ".section-content": {
      padding: "8px 12px"
    },
    ".timeline": {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    ".timeline-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 8px",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".timeline-time": {
      fontFamily: "monospace",
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      minWidth: "60px"
    },
    ".timeline-status": {
      minWidth: "20px"
    },
    ".timeline-node": {
      flex: 1,
      fontFamily: "monospace",
      fontSize: "12px"
    },
    ".breakpoint-list": {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    ".breakpoint-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 8px",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".breakpoint-node": {
      fontFamily: "monospace",
      fontSize: "12px"
    },
    ".metrics-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "8px"
    },
    ".metric-card": {
      backgroundColor: theme.vars.palette.background.default,
      borderRadius: "6px",
      padding: "8px",
      textAlign: "center"
    },
    ".metric-value": {
      fontSize: "20px",
      fontWeight: 600,
      fontFamily: "monospace"
    },
    ".metric-label": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    }
  });

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
};

const getStatusColor = (eventType: ExecutionEvent["eventType"]): string => {
  switch (eventType) {
    case "started":
      return "#2196f3";
    case "completed":
      return "#4caf50";
    case "error":
      return "#f44336";
    case "progress":
      return "#ff9800";
    default:
      return "#9e9e9e";
  }
};

const DebugPanel: React.FC = () => {
  const theme = useTheme();

  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId) || "";
  const runnerState = useWebsocketRunner((state) => state.state);
  const statusMessage = useWebsocketRunner((state) => state.statusMessage);

  const breakpoints = useDebugPanelStore((state) => state.breakpoints);
  const executionHistory = useDebugPanelStore((state) => state.executionHistory);
  const isDebugMode = useDebugPanelStore((state) => state.isDebugMode);

  const toggleBreakpoint = useDebugPanelStore((state) => state.toggleBreakpoint);
  const clearBreakpoints = useDebugPanelStore((state) => state.clearBreakpoints);
  const clearExecutionHistory = useDebugPanelStore((state) => state.clearExecutionHistory);
  const setDebugMode = useDebugPanelStore((state) => state.setDebugMode);

  const isRunning = runnerState === "running";
  const isPaused = runnerState === "paused";
  const isIdle = runnerState === "idle";

  // Calculate metrics from execution history
  const metrics = useMemo(() => ({
    totalNodes: executionHistory.filter((e) => e.eventType === "started").length,
    completedNodes: executionHistory.filter((e) => e.eventType === "completed").length,
    errorNodes: executionHistory.filter((e) => e.eventType === "error").length,
    totalDuration: executionHistory.length > 0
      ? executionHistory[executionHistory.length - 1].timestamp - executionHistory[0].timestamp
      : 0
  }), [executionHistory]);

  return (
    <Box css={styles(theme)} className="debug-panel">
      <div className="debug-header">
        <div className="debug-controls">
          <Tooltip
            title={
              <div className="tooltip-span">
                <div className="tooltip-title">Run workflow</div>
                <div className="tooltip-key">Start execution</div>
              </div>
            }
            placement="top-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <span>
              <IconButton
                size="small"
                color="success"
                disabled={isRunning}
                onClick={() => {
                  setDebugMode(true);
                  // This would trigger workflow run
                }}
                aria-label="Run workflow"
              >
                <PlayArrowIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              <div className="tooltip-span">
                <div className="tooltip-title">Pause execution</div>
              </div>
            }
            placement="top-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <span>
              <IconButton
                size="small"
                color="warning"
                disabled={!isRunning}
                aria-label="Pause execution"
              >
                <PauseIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              <div className="tooltip-span">
                <div className="tooltip-title">Step to next node</div>
              </div>
            }
            placement="top-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <span>
              <IconButton
                size="small"
                disabled={!isPaused}
                aria-label="Step to next node"
              >
                <SkipNextIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip
            title={
              <div className="tooltip-span">
                <div className="tooltip-title">Stop execution</div>
              </div>
            }
            placement="top-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <span>
              <IconButton
                size="small"
                color="error"
                disabled={isIdle}
                aria-label="Stop execution"
              >
                <StopIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Divider orientation="vertical" flexItem />
          <Tooltip
            title={
              <div className="tooltip-span">
                <div className="tooltip-title">Clear execution history</div>
              </div>
            }
            placement="top-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              size="small"
              onClick={clearExecutionHistory}
              aria-label="Clear execution history"
            >
              <DeleteSweepIcon />
            </IconButton>
          </Tooltip>
        </div>
        <Typography variant="body2" color="text.secondary">
          {statusMessage || (isDebugMode ? "Debug Mode" : "Ready")}
        </Typography>
      </div>

      <div className="debug-content">
        {/* Metrics Section */}
        <div className="section">
          <div className="section-header">
            <div className="title">
              <SpeedIcon fontSize="small" />
              Performance
            </div>
          </div>
          <div className="section-content">
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{metrics.totalNodes}</div>
                <div className="metric-label">Nodes Run</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{metrics.completedNodes}</div>
                <div className="metric-label">Completed</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{metrics.errorNodes}</div>
                <div className="metric-label">Errors</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">
                  {metrics.totalDuration > 0 ? `${(metrics.totalDuration / 1000).toFixed(1)}s` : "-"}
                </div>
                <div className="metric-label">Duration</div>
              </div>
            </div>
          </div>
        </div>

        {/* Breakpoints Section */}
        <div className="section">
          <div className="section-header">
            <div className="title">
              <BugReportIcon fontSize="small" />
              Breakpoints
            </div>
            <Button size="small" onClick={clearBreakpoints}>
              Clear All
            </Button>
          </div>
          <div className="section-content">
            {breakpoints.length === 0 ? (
              <div className="empty-state">
                <Typography variant="body2">
                  No breakpoints set
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Click on a node to add a breakpoint
                </Typography>
              </div>
            ) : (
              <List dense className="breakpoint-list">
                {breakpoints.map((bp) => (
                  <ListItem
                    key={bp.nodeId}
                    className="breakpoint-item"
                    secondaryAction={
                      <Switch
                        size="small"
                        checked={bp.enabled}
                        onChange={() => toggleBreakpoint(bp.nodeId)}
                      />
                    }
                  >
                    <ListItemText
                      primary={bp.nodeId}
                      className="breakpoint-node"
                      primaryTypographyProps={{
                        sx: { fontFamily: "monospace", fontSize: "12px" }
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </div>
        </div>

        {/* Execution Timeline Section */}
        <div className="section" style={{ flex: 1, minHeight: 0 }}>
          <div className="section-header">
            <div className="title">
              <HistoryIcon fontSize="small" />
              Execution History
            </div>
            <Chip
              size="small"
              label={`${executionHistory.length} events`}
              color={executionHistory.some((e) => e.eventType === "error") ? "error" : "default"}
            />
          </div>
          <div className="section-content" style={{ overflow: "auto", maxHeight: "300px" }}>
            {executionHistory.length === 0 ? (
              <div className="empty-state">
                <Typography variant="body2">
                  No execution events yet
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Run the workflow to see the execution timeline
                </Typography>
              </div>
            ) : (
              <Box className="timeline">
                {executionHistory.map((event) => (
                  <div key={event.id} className="timeline-item">
                    <span className="timeline-time">{formatTime(event.timestamp)}</span>
                    <CircleIcon
                      className="timeline-status"
                      sx={{
                        fontSize: "10px",
                        color: getStatusColor(event.eventType)
                      }}
                    />
                    <span className="timeline-node">
                      {event.nodeType} ({event.nodeId})
                    </span>
                    {event.duration !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        {event.duration}ms
                      </Typography>
                    )}
                    {event.eventType === "error" && event.message && (
                      <Tooltip title={event.message}>
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {event.message}
                        </Typography>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </Box>
            )}
          </div>
        </div>
      </div>
    </Box>
  );
};

export default memo(DebugPanel, isEqual);
