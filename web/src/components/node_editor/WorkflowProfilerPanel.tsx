/**
 * WorkflowProfilerPanel Component
 *
 * Displays workflow performance metrics and analysis including:
 * - Execution timeline with node durations
 * - Bottleneck identification
 * - Performance insights and suggestions
 * - Run history comparison
 *
 * This is an experimental feature for research purposes.
 */

import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from "@mui/icons-material";
import useWorkflowProfiler from "../../hooks/useWorkflowProfiler";
import { Graph } from "../../stores/ApiTypes";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  graph: Graph;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
};

const getInsightIcon = (severity: "high" | "medium" | "low") => {
  switch (severity) {
    case "high":
      return <ErrorIcon fontSize="small" color="error" />;
    case "medium":
      return <WarningIcon fontSize="small" color="warning" />;
    case "low":
      return <InfoIcon fontSize="small" color="info" />;
  }
};

export const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  graph
}) => {
  const {
    getLatestProfile,
    getProfiles,
    getBottlenecks,
    getParallelizationAnalysis,
    getPerformanceInsights,
    isRecording
  } = useWorkflowProfiler(workflowId);

  const latestProfile = getLatestProfile();
  const profiles = getProfiles();
  const bottlenecks = getBottlenecks(3);
  const parallelization = getParallelizationAnalysis(graph);
  const insights = getPerformanceInsights(graph);

  const nodeMetrics = useMemo(() => {
    if (!latestProfile) return [];
    return [...latestProfile.nodeMetrics].sort((a, b) => b.duration - a.duration);
  }, [latestProfile]);

  const maxDuration = useMemo(() => {
    if (!latestProfile) return 1;
    return Math.max(...nodeMetrics.map((m) => m.duration), latestProfile.totalDuration);
  }, [latestProfile, nodeMetrics]);

  if (!latestProfile) {
    return (
      <Paper sx={{ p: 2, m: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <SpeedIcon color="action" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Run a workflow execution to see performance metrics.
        </Typography>
        {isRecording && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
              Recording execution...
            </Typography>
            <LinearProgress />
          </Box>
        )}
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, m: 1, maxHeight: "calc(100vh - 100px)", overflow: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="action" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        {latestProfile.status === "running" && (
          <Chip label="Recording" color="primary" size="small" />
        )}
      </Box>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Execution Summary</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Total Duration</Typography>
              <Typography variant="body2" fontWeight="medium">
                {formatDuration(latestProfile.totalDuration)}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Nodes Executed</Typography>
              <Typography variant="body2">
                {latestProfile.nodeMetrics.length} / {latestProfile.nodeCount}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <Chip
                label={latestProfile.status}
                size="small"
                color={
                  latestProfile.status === "completed" ? "success" :
                  latestProfile.status === "failed" ? "error" : "default"
                }
              />
            </Box>
          </Box>

          {profiles.length >= 2 && (
            <Box sx={{ mt: 2, p: 1, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Run History
              </Typography>
              {profiles.slice(-3).map((profile, index) => (
                <Box
                  key={profile.runId}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: index < Math.min(profiles.length - 1, 2) ? 1 : 0
                  }}
                >
                  {index === profiles.length - 1 ? (
                    <TrendingUpIcon fontSize="small" color="primary" />
                  ) : (
                    <TrendingDownIcon fontSize="small" color="disabled" />
                  )}
                  <Typography variant="caption" sx={{ flex: 1 }}>
                    Run {profiles.length - index - 1}
                  </Typography>
                  <Typography variant="caption" fontWeight="medium">
                    {formatDuration(profile.totalDuration)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Node Execution Times</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense>
            {nodeMetrics.map((metric) => {
              const percentage = (metric.duration / maxDuration) * 100;
              return (
                <ListItem key={metric.nodeId} sx={{ px: 0 }}>
                  <Box sx={{ width: "100%" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Tooltip title={metric.nodeType}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {metric.nodeType.split(".").pop() || metric.nodeId}
                        </Typography>
                      </Tooltip>
                      <Typography variant="caption" color="text.secondary">
                        {formatDuration(metric.duration)}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={percentage}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: "action.hover",
                        "& .MuiLinearProgress-bar": {
                          bgcolor: percentage > 50 ? "error.main" :
                                   percentage > 25 ? "warning.main" : "success.main"
                        }
                      }}
                    />
                  </Box>
                </ListItem>
              );
            })}
          </List>
        </AccordionDetails>
      </Accordion>

      {bottlenecks.length > 0 && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Bottlenecks</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List dense>
              {bottlenecks.map((bottleneck, index) => (
                <ListItem key={bottleneck.nodeId} sx={{ px: 0 }}>
                  <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip
                      label={`#${index + 1}`}
                      size="small"
                      color={index === 0 ? "error" : index === 1 ? "warning" : "default"}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        {bottleneck.nodeType.split(".").pop()}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {bottleneck.percentageOfTotal.toFixed(1)}% of total time
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight="medium">
                      {formatDuration(bottleneck.duration)}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2">Parallelization Analysis</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Actual Duration</Typography>
              <Typography variant="body2" fontWeight="medium">
                {formatDuration(parallelization.totalDuration)}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">Theoretical Minimum</Typography>
              <Typography variant="body2" fontWeight="medium">
                {formatDuration(parallelization.theoreticalMinimumDuration)}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Efficiency</Typography>
              <Typography
                variant="body2"
                fontWeight="medium"
                color={
                  parallelization.parallelizationEfficiency > 80 ? "success.main" :
                  parallelization.parallelizationEfficiency > 50 ? "warning.main" : "error.main"
                }
              >
                {parallelization.parallelizationEfficiency.toFixed(1)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(parallelization.parallelizationEfficiency, 100)}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      {insights.length > 0 && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Performance Insights</Typography>
            <Chip
              label={insights.length}
              size="small"
              color="primary"
              sx={{ ml: 1 }}
            />
          </AccordionSummary>
          <AccordionDetails>
            <List dense>
              {insights.map((insight, index) => (
                <ListItem key={index} sx={{ px: 0 }}>
                  <Box sx={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 1 }}>
                    {getInsightIcon(insight.severity)}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">{insight.message}</Typography>
                      {insight.suggestion && (
                        <Typography variant="caption" color="text.secondary">
                          Suggestion: {insight.suggestion}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  );
};

export default WorkflowProfilerPanel;
