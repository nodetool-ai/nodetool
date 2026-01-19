/**
 * Workflow Performance Profiler Panel.
 *
 * Displays real-time performance metrics for workflow execution including:
 * - Overall execution time and node statistics
 * - Bottleneck identification with visual highlighting
 * - Timeline visualization of node execution
 * - Optimization suggestions
 *
 * @example
 * ```typescript
 * <WorkflowProfilerPanel
 *   workflowId={workflowId}
 *   nodes={nodes}
 *   isRunning={isRunning}
 *   onClose={() => setShowProfiler(false)}
 * />
 * ```
 */
import React, { useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Collapse
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Speed,
  Memory,
  Timeline,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  TrendingUp
} from "@mui/icons-material";
import { alpha } from "@mui/material/styles";
import usePerformanceStore, {
  NodePerformanceMetrics
} from "../../stores/PerformanceStore";
import useWorkflowProfiler from "../../hooks/useWorkflowProfiler";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  nodes: { id: string; type: string; data: { label?: string; bypassed?: boolean } }[];
  isRunning: boolean;
  onClose: () => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(2);
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

const formatMemory = (mb: number): string => {
  if (mb < 1024) {
    return `${Math.round(mb)}MB`;
  }
  return `${(mb / 1024).toFixed(2)}GB`;
};

export const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  nodes,
  isRunning,
  onClose
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const [showSuggestions, setShowSuggestions] = React.useState(true);

  const {
    startTracking,
    analyzePerformance
  } = useWorkflowProfiler();

  const profile = usePerformanceStore((state) =>
    state.profiles[workflowId]
  );
  const currentNodes = usePerformanceStore((state) => state.currentExecutionNodes);

  useEffect(() => {
    if (isRunning && !profile) {
      startTracking(workflowId, nodes);
    }
    return () => {
      if (!isRunning && profile) {
        analyzePerformance(workflowId);
      }
    };
  }, [isRunning, workflowId, nodes, profile, startTracking, analyzePerformance]);

  const nodeMetrics = useMemo(() => {
    const metrics: NodePerformanceMetrics[] = [];
    for (const node of nodes) {
      const key = `${workflowId}:${node.id}`;
      const metric = currentNodes[key];
      if (metric) {
        metrics.push(metric);
      }
    }
    return metrics.sort((a, b) => b.duration - a.duration);
  }, [currentNodes, workflowId, nodes]);

  const maxDuration = useMemo(() => {
    return Math.max(...nodeMetrics.map((m) => m.duration), 1);
  }, [nodeMetrics]);

  const completedNodes = nodeMetrics.filter((m) => m.status === "completed");
  const failedNodes = nodeMetrics.filter((m) => m.status === "failed");

  const progress = useMemo(() => {
    const total = nodeMetrics.length;
    if (total === 0) {
      return 0;
    }
    return ((completedNodes.length + failedNodes.length) / total) * 100;
  }, [nodeMetrics.length, completedNodes.length, failedNodes.length]);

  const handleClose = () => {
    analyzePerformance(workflowId);
    onClose();
  };

  return (
    <Paper
      elevation={0}
      sx={{
        padding: 2,
        backgroundColor: (theme) => theme.vars.palette.background.default,
        borderLeft: (theme) => `4px solid ${theme.vars.palette.primary.main}`,
        maxHeight: "100%",
        overflow: "auto"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
          {isRunning && (
            <Chip
              label="Recording"
              size="small"
              color="info"
              icon={<Timeline />}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
          <IconButton size="small" onClick={handleClose}>
            <ErrorIcon />
          </IconButton>
        </Box>
      </Box>

      {expanded && (
        <>
          {isRunning && (
            <Box sx={{ marginBottom: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 0.5
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Execution Progress
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {completedNodes.length + failedNodes.length} / {nodeMetrics.length}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}

          {profile && (
            <Box sx={{ marginBottom: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  flexWrap: "wrap",
                  marginBottom: 2
                }}
              >
                <Chip
                  icon={<Timeline />}
                  label={`Total: ${formatDuration(profile.totalDuration)}`}
                  color="primary"
                  variant="outlined"
                  sx={{ fontFamily: "monospace" }}
                />
                <Chip
                  icon={<CheckCircle />}
                  label={`${profile.completedCount} completed`}
                  size="small"
                  color="success"
                  variant="outlined"
                />
                {profile.failedCount > 0 && (
                  <Chip
                    icon={<ErrorIcon />}
                    label={`${profile.failedCount} failed`}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                )}
                <Chip
                  icon={<Memory />}
                  label={`~${formatMemory(profile.estimatedMemoryPeak / 1024)}`}
                  size="small"
                  variant="outlined"
                />
              </Box>

              {profile.bottleneckNodes.length > 0 && (
                <Box sx={{ marginBottom: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    <Warning color="warning" fontSize="small" />
                    Bottleneck Nodes
                  </Typography>
                  <List dense>
                    {profile.bottleneckNodes.slice(0, 5).map((node) => (
                      <ListItem
                        key={node.nodeId}
                        sx={{
                          borderRadius: 1,
                          marginBottom: 0.5,
                          backgroundColor: (theme) =>
                            alpha(theme.vars.palette.warning.main, 0.1),
                          "&:hover": {
                            backgroundColor: (theme) =>
                              alpha(theme.vars.palette.warning.main, 0.15)
                          }
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <TrendingUp
                            fontSize="small"
                            sx={{
                              color:
                                node.duration >= maxDuration * 0.8
                                  ? "error.main"
                                  : "warning.main"
                            }}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={node.nodeLabel}
                          secondary={`${formatDuration(node.duration)} (${(
                            (node.duration / profile.totalDuration) *
                            100
                          ).toFixed(1)}%)`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {profile.optimizationSuggestions.length > 0 && (
                <Box sx={{ marginBottom: 2 }}>
                  <Typography
                    variant="subtitle2"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      cursor: "pointer",
                      "&:hover": { opacity: 0.8 }
                    }}
                  >
                    <TrendingUp fontSize="small" />
                    Optimization Suggestions
                    <Chip
                      label={profile.optimizationSuggestions.length}
                      size="small"
                      color="info"
                      sx={{ height: 20, fontSize: "0.7rem" }}
                    />
                  </Typography>
                  <Collapse in={showSuggestions}>
                    <List dense>
                      {profile.optimizationSuggestions.map(
                        (suggestion, index) => (
                          <ListItem key={index}>
                            <ListItemIcon sx={{ minWidth: 24 }}>
                              <TrendingUp fontSize="small" color="action" />
                            </ListItemIcon>
                            <ListItemText
                              primary={suggestion}
                              primaryTypographyProps={{
                                variant: "body2",
                                color: "text.secondary"
                              }}
                            />
                          </ListItem>
                        )
                      )}
                    </List>
                  </Collapse>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
                  Execution Timeline
                </Typography>
                {nodeMetrics.map((node) => (
                  <Box key={node.nodeId} sx={{ marginBottom: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <Tooltip title={`${node.nodeType} (${node.nodeId})`}>
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 150
                          }}
                        >
                          {node.nodeLabel}
                        </Typography>
                      </Tooltip>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {node.status === "completed" && (
                          <CheckCircle
                            fontSize="small"
                            color="success"
                          />
                        )}
                        {node.status === "failed" && (
                          <ErrorIcon fontSize="small" color="error" />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {formatDuration(node.duration)}
                        </Typography>
                      </Box>
                    </Box>
                    <Box
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: (theme) =>
                          theme.vars.palette.action.hover,
                        overflow: "hidden",
                        marginTop: 0.5
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          width: `${Math.min(
                            (node.duration / maxDuration) * 100,
                            100
                          )}%`,
                          borderRadius: 4,
                          transition: "width 0.3s ease",
                          background: (theme) =>
                            `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`
                        }}
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {!profile && !isRunning && nodeMetrics.length === 0 && (
            <Box
              sx={{
                textAlign: "center",
                padding: 3,
                color: "text.secondary"
              }}
            >
              <Timeline sx={{ fontSize: 48, marginBottom: 1, opacity: 0.5 }} />
              <Typography variant="body2">
                No profiling data available
              </Typography>
              <Typography variant="caption">
                Run a workflow to see performance metrics
              </Typography>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};

export default WorkflowProfilerPanel;
