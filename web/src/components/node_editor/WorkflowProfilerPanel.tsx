import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  Timeline as TimelineIcon,
  Analytics as AnalyticsIcon,
  Lightbulb as LightbulbIcon,
} from "@mui/icons-material";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { useWorkflowProfiler } from "../../hooks/useWorkflowProfiler";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  onNodeFocus?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) { return `${Math.round(ms)}ms`; }
  if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s`; }
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const SeverityChip: React.FC<{ severity: "high" | "medium" | "low" }> = ({
  severity,
}) => {
  const colors = {
    high: { bg: "#ffebee", text: "#c62828" },
    medium: { bg: "#fff3e0", text: "#ef6c00" },
    low: { bg: "#e8f5e9", text: "#2e7d32" },
  };

  return (
    <Chip
      label={severity.toUpperCase()}
      size="small"
      sx={{
        backgroundColor: colors[severity].bg,
        color: colors[severity].text,
        fontWeight: 600,
        fontSize: "0.7rem",
      }}
    />
  );
};

const MetricsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, icon, color = "primary.main" }) => (
  <Paper
    elevation={0}
    sx={{
      p: 1.5,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      backgroundColor: "action.hover",
      borderRadius: 1,
      minWidth: 80,
    }}
  >
    <Box sx={{ color, mb: 0.5 }}>{icon}</Box>
    <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1 }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {title}
    </Typography>
  </Paper>
);

export const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  nodes,
  edges,
  onNodeFocus,
}) => {
  const { profile, isAnalyzing, analyze, getExecutionTimeStats } =
    useWorkflowProfiler({
      workflowId,
      nodes,
      edges,
    });

  const executionStats = useMemo(
    () => getExecutionTimeStats(),
    [getExecutionTimeStats]
  );

  const handleAnalyze = () => {
    analyze();
  };

  const issueCount = useMemo(
    () =>
      (profile?.structuralIssues.filter((i) => i.severity === "high").length ||
        0) +
      (profile?.bottlenecks.filter((b) => b.impactScore > 0.7).length || 0),
    [profile]
  );

  if (isAnalyzing) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <CircularProgress size={32} sx={{ mb: 2 }} />
        <Typography color="text.secondary">Analyzing workflow...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AnalyticsIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Workflow Profiler
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<SpeedIcon />}
          onClick={handleAnalyze}
        >
          Analyze
        </Button>
      </Box>

      {!profile ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            textAlign: "center",
            backgroundColor: "action.hover",
            borderRadius: 1,
          }}
        >
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Run the workflow at least once to see performance insights
          </Typography>
          <Button variant="outlined" onClick={handleAnalyze}>
            Analyze Structure
          </Button>
        </Paper>
      ) : (
        <>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Last analyzed: {new Date(profile.lastAnalyzed).toLocaleString()}
          </Typography>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Structure Metrics
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <MetricsCard
              title="Nodes"
              value={profile.metrics.nodeCount}
              icon={<TimelineIcon />}
            />
            <MetricsCard
              title="Connections"
              value={profile.metrics.edgeCount}
              icon={<TrendingUpIcon />}
            />
            <MetricsCard
              title="Depth"
              value={profile.metrics.depth}
              icon={<TimelineIcon />}
            />
            <MetricsCard
              title="Max Width"
              value={profile.metrics.width}
              icon={<TrendingUpIcon />}
            />
          </Box>

          {executionStats.totalTime > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                Execution Summary
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  flexWrap: "wrap",
                  mb: 2,
                }}
              >
                <MetricsCard
                  title="Total Time"
                  value={formatDuration(executionStats.totalTime)}
                  icon={<SpeedIcon />}
                  color="primary.main"
                />
                <MetricsCard
                  title="Avg per Node"
                  value={formatDuration(executionStats.avgNodeTime)}
                  icon={<SpeedIcon />}
                  color="text.secondary"
                />
              </Box>
            </>
          )}

          {profile.bottlenecks.length > 0 && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <WarningIcon color="warning" fontSize="small" />
                  <Typography variant="subtitle2">
                    Bottlenecks ({profile.bottlenecks.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {profile.bottlenecks.map((bottleneck) => (
                    <ListItem
                      key={bottleneck.nodeId}
                      sx={{
                        backgroundColor: "action.hover",
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      <ListItemIcon>
                        <Tooltip title="Click to focus node">
                          <Box
                            sx={{
                              cursor: onNodeFocus ? "pointer" : "default",
                              color: "warning.main",
                            }}
                            onClick={() =>
                              onNodeFocus?.(bottleneck.nodeId)
                            }
                          >
                            <SpeedIcon fontSize="small" />
                          </Box>
                        </Tooltip>
                      </ListItemIcon>
                      <ListItemText
                        primary={bottleneck.nodeLabel}
                        secondary={
                          <Box component="span">
                            <Typography variant="caption" component="span">
                              Time: {formatDuration(bottleneck.avgExecutionTime)}
                              {" | "}
                              Impact:{" "}
                              {(bottleneck.impactScore * 100).toFixed(0)}%
                            </Typography>
                            <br />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              component="span"
                            >
                              {bottleneck.recommendation}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {profile.parallelOpportunities.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircleIcon color="success" fontSize="small" />
                  <Typography variant="subtitle2">
                    Parallel Opportunities ({profile.parallelOpportunities.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {profile.parallelOpportunities.map((opp, index) => (
                    <ListItem
                      key={index}
                      sx={{
                        backgroundColor: "action.hover",
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      <ListItemIcon>
                        <CheckCircleIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={`Layer ${opp.layerIndex}: ${opp.nodeIds.length} nodes`}
                        secondary={`Potential speedup: ${opp.potentialSpeedup}x`}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {profile.structuralIssues.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LightbulbIcon color="info" fontSize="small" />
                  <Typography variant="subtitle2">
                    Structural Issues ({profile.structuralIssues.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {profile.structuralIssues.map((issue, index) => (
                    <ListItem
                      key={index}
                      sx={{
                        backgroundColor: "action.hover",
                        borderRadius: 1,
                        mb: 1,
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          width: "100%",
                        }}
                      >
                        <SeverityChip severity={issue.severity} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {issue.type.replace("_", " ").toUpperCase()}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5, mb: 0.5 }}
                      >
                        {issue.description}
                      </Typography>
                      <Typography variant="caption" color="primary">
                        {issue.recommendation}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {issueCount === 0 &&
            profile.bottlenecks.length === 0 &&
            profile.structuralIssues.length === 0 && (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  textAlign: "center",
                  backgroundColor: "success.lighter",
                  borderRadius: 1,
                }}
              >
                <CheckCircleIcon
                  color="success"
                  sx={{ fontSize: 40, mb: 1 }}
                />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  No Issues Found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your workflow structure looks good!
                </Typography>
              </Paper>
            )}
        </>
      )}
    </Box>
  );
};

export default WorkflowProfilerPanel;
