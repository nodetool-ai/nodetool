/**
 * PerformanceProfiler Component
 *
 * Visual workflow performance analysis tool.
 * Provides browser dev tools-like profiling for workflows including:
 * - Execution timeline visualization
 * - Bottleneck identification
 * - Optimization suggestions
 * - Node performance rankings
 *
 * @example
 * ```typescript
 * <PerformanceProfiler
 *   workflowId="workflow-123"
 *   onNodeClick={(nodeId) => focusNode(nodeId)}
 * />
 * ```
 */

import React, { useState, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Card,
  CardContent,
  useTheme,
  useMediaQuery
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Lightbulb as LightbulbIcon,
  TrendingUp as TrendingUpIcon
} from "@mui/icons-material";
import { useWorkflowProfiler } from "../../hooks/useWorkflowProfiler";
import { NodeProfile, BottleneckInfo } from "../../stores/PerformanceProfilerStore";

interface PerformanceProfilerProps {
  workflowId: string;
  onNodeClick?: (nodeId: string) => void;
  onStartProfiling?: () => void;
  onEndProfiling?: () => void;
}

const EfficiencyChip: React.FC<{ efficiency: string }> = ({ efficiency }) => {
  const theme = useTheme();
  const colors = {
    excellent: theme.palette.success.main,
    good: theme.palette.info.main,
    "needs-improvement": theme.palette.warning.main,
    poor: theme.palette.error.main
  };
  const labels = {
    excellent: "Excellent",
    good: "Good",
    "needs-improvement": "Needs Improvement",
    poor: "Poor"
  };

  return (
    <Chip
      label={labels[efficiency as keyof typeof labels] || efficiency}
      sx={{
        bgcolor: colors[efficiency as keyof typeof colors] || theme.palette.grey[500],
        color: "white",
        fontWeight: "bold"
      }}
      size="small"
    />
  );
};

const TimelineView: React.FC<{ events: NodeProfile[]; onNodeClick?: (nodeId: string) => void }> = ({
  events,
  onNodeClick
}) => {
  const theme = useTheme();
  const totalDuration = useMemo(
    () => Math.max(...events.map(e => e.endTime)) - Math.min(...events.map(e => e.startTime)),
    [events]
  );

  if (events.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No execution data available
        </Typography>
      </Box>
    );
  }

  const startTime = Math.min(...events.map(e => e.startTime));

  return (
    <Box sx={{ position: "relative", py: 2 }}>
      {events.map((event, index) => {
        const startOffset = ((event.startTime - startTime) / totalDuration) * 100;
        const width = Math.max((event.duration / totalDuration) * 100, 2);

        return (
          <Tooltip
            key={event.nodeId}
            title={
              <Box>
                <Typography variant="caption" fontWeight="bold">
                  {event.nodeType.split(".").pop()}
                </Typography>
                <br />
                <Typography variant="caption">
                  Duration: {event.duration.toFixed(0)}ms
                </Typography>
                <br />
                <Typography variant="caption">
                  Status: {event.status}
                </Typography>
              </Box>
            }
            arrow
          >
            <Box
              onClick={() => onNodeClick?.(event.nodeId)}
              sx={{
                position: "relative",
                height: 32,
                mb: 0.5,
                cursor: onNodeClick ? "pointer" : "default",
                "&:hover": {
                  "& .timeline-bar": {
                    filter: onNodeClick ? "brightness(1.1)" : "none"
                  }
                }
              }}
            >
              <Box
                className="timeline-bar"
                sx={{
                  position: "absolute",
                  left: `${startOffset}%`,
                  width: `${width}%`,
                  height: 24,
                  bgcolor:
                    event.status === "completed"
                      ? theme.palette.success.main
                      : event.status === "failed"
                      ? theme.palette.error.main
                      : theme.palette.info.main,
                  borderRadius: 1,
                  display: "flex",
                  alignItems: "center",
                  px: 1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  transition: "filter 0.2s"
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: "white",
                    fontSize: "0.65rem",
                    fontWeight: "bold"
                  }}
                >
                  {event.nodeType.split(".").pop()}
                </Typography>
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
};

const BottleneckPanel: React.FC<{ bottlenecks: BottleneckInfo[] }> = ({ bottlenecks }) => {
  const theme = useTheme();

  if (bottlenecks.length === 0) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        No significant bottlenecks detected. Great job optimizing your workflow!
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {bottlenecks.map((bottleneck, index) => (
        <Alert
          key={bottleneck.nodeId}
          severity={
            bottleneck.severity === "high"
              ? "error"
              : bottleneck.severity === "medium"
              ? "warning"
              : "info"
          }
          sx={{ mb: 1 }}
          icon={
            bottleneck.severity === "high" ? (
              <WarningIcon />
            ) : (
              <LightbulbIcon />
            )
          }
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography variant="body2" fontWeight="bold">
              {bottleneck.nodeType.split(".").pop()}
            </Typography>
            <Chip
              label={`${(bottleneck.percentageOfTotal * 100).toFixed(1)}% of total`}
              size="small"
              color={
                bottleneck.severity === "high"
                  ? "error"
                  : bottleneck.severity === "medium"
                  ? "warning"
                  : "default"
              }
            />
          </Box>
          <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
            Duration: {bottleneck.duration.toFixed(0)}ms
          </Typography>
          <Typography variant="caption" color="text.secondary">
            💡 {bottleneck.suggestion}
          </Typography>
        </Alert>
      ))}
    </Box>
  );
};

const NodeRankingsTable: React.FC<{
  rankings: NodeProfile[];
  onNodeClick?: (nodeId: string) => void;
}> = ({ rankings, onNodeClick }) => {
  const theme = useTheme();

  if (rankings.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
        No node execution data available
      </Typography>
    );
  }

  const totalDuration = rankings.reduce((sum, n) => sum + (n.duration || 0), 0);

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Node</TableCell>
            <TableCell align="right">Duration</TableCell>
            <TableCell align="right">% of Total</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rankings.slice(0, 10).map((node, index) => {
            const percentage = totalDuration > 0 ? (node.duration / totalDuration) * 100 : 0;
            return (
              <TableRow
                key={node.nodeId}
                hover
                onClick={() => onNodeClick?.(node.nodeId)}
                sx={{ cursor: onNodeClick ? "pointer" : "default" }}
              >
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        bgcolor:
                          index === 0
                            ? theme.palette.error.main
                            : index < 3
                            ? theme.palette.warning.main
                            : theme.palette.grey[400],
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.6rem",
                        fontWeight: "bold"
                      }}
                    >
                      {index + 1}
                    </Typography>
                    <Typography variant="body2">
                      {node.nodeType.split(".").pop()}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">
                    {node.duration < 1000
                      ? `${node.duration.toFixed(0)}ms`
                      : `${(node.duration / 1000).toFixed(2)}s`}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(percentage, 100)}
                      sx={{
                        width: 60,
                        height: 6,
                        borderRadius: 3,
                        bgcolor: theme.palette.action.hover,
                        "& .MuiLinearProgress-bar": {
                          bgcolor:
                            percentage > 30
                              ? theme.palette.error.main
                              : percentage > 10
                              ? theme.palette.warning.main
                              : theme.palette.success.main
                        }
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {percentage.toFixed(1)}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  {node.status === "completed" ? (
                    <CheckIcon sx={{ color: theme.palette.success.main, fontSize: 18 }} />
                  ) : node.status === "failed" ? (
                    <ErrorIcon sx={{ color: theme.palette.error.main, fontSize: 18 }} />
                  ) : (
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: theme.palette.info.main
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  onNodeClick,
  onStartProfiling,
  onEndProfiling
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [expanded, setExpanded] = useState<string | false>("summary");

  const {
    isProfiling,
    latestProfile,
    bottlenecks,
    nodeRankings,
    startProfiling,
    endProfiling,
    clearProfiles,
    getExecutionSummary
  } = useWorkflowProfiler(workflowId);

  const summary = useMemo(() => getExecutionSummary(), [getExecutionSummary]);

  const handleStartProfiling = () => {
    startProfiling();
    onStartProfiling?.();
  };

  const handleEndProfiling = () => {
    endProfiling();
    onEndProfiling?.();
  };

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
          p: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: theme.palette.background.default
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="bold">
            Performance Profiler
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {isProfiling ? (
            <Tooltip title="Stop Profiling">
              <IconButton
                color="error"
                onClick={handleEndProfiling}
                size="small"
              >
                <StopIcon />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Start Profiling">
              <IconButton
                color="primary"
                onClick={handleStartProfiling}
                size="small"
              >
                <PlayIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Clear Profiles">
            <IconButton onClick={clearProfiles} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        <Accordion
          expanded={expanded === "summary"}
          onChange={(_, e) => setExpanded(e ? "summary" : false)}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TrendingUpIcon fontSize="small" />
              <Typography variant="subtitle2">Execution Summary</Typography>
              {latestProfile && <EfficiencyChip efficiency={summary.efficiency} />}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                    gap: 2
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Total Duration
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {summary.totalDuration}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Nodes Executed
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {summary.completedCount}/{summary.nodeCount}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Avg per Node
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {summary.averageNodeDuration}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Failed Nodes
                    </Typography>
                    <Typography
                      variant="h6"
                      fontWeight="bold"
                      color={summary.failedCount > 0 ? "error.main" : "text.primary"}
                    >
                      {summary.failedCount}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {summary.slowestNode && (
              <Alert severity="info" icon={<TimelineIcon />}>
                <Typography variant="body2">
                  Slowest node:{" "}
                  <strong>
                    {summary.slowestNode.type.split(".").pop()}
                  </strong>{" "}
                  ({summary.slowestNode.duration})
                </Typography>
              </Alert>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expanded === "timeline"}
          onChange={(_, e) => setExpanded(e ? "timeline" : false)}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <TimelineIcon fontSize="small" />
              <Typography variant="subtitle2">Execution Timeline</Typography>
              {nodeRankings.length > 0 && (
                <Chip label={`${nodeRankings.length} nodes`} size="small" />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ px: 1 }}>
              <TimelineView
                events={nodeRankings}
                onNodeClick={onNodeClick}
              />
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expanded === "bottlenecks"}
          onChange={(_, e) => setExpanded(e ? "bottlenecks" : false)}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <WarningIcon
                fontSize="small"
                sx={{
                  color: bottlenecks.length > 0
                    ? theme.palette.warning.main
                    : theme.palette.success.main
                }}
              />
              <Typography variant="subtitle2">Bottlenecks & Suggestions</Typography>
              {bottlenecks.length > 0 && (
                <Chip
                  label={bottlenecks.length}
                  size="small"
                  color="warning"
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <BottleneckPanel bottlenecks={bottlenecks} />
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expanded === "rankings"}
          onChange={(_, e) => setExpanded(e ? "rankings" : false)}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <SpeedIcon fontSize="small" />
              <Typography variant="subtitle2">Node Rankings</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <NodeRankingsTable
              rankings={nodeRankings}
              onNodeClick={onNodeClick}
            />
          </AccordionDetails>
        </Accordion>
      </Box>

      {isProfiling && (
        <Box
          sx={{
            p: 1,
            borderTop: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.warning.light,
            display: "flex",
            alignItems: "center",
            gap: 1
          }}
        >
          <LinearProgress sx={{ flex: 1 }} />
          <Typography variant="caption" color="warning.dark">
            Profiling...
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default PerformanceProfiler;
