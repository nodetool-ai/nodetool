/**
 * Workflow Profiler Component
 *
 * Displays performance analysis results for workflows including:
 * - Estimated runtime
 * - Bottleneck identification
 * - Parallelization opportunities
 * - Optimization suggestions
 *
 * This is an EXPERIMENTAL research feature for analyzing workflow performance.
 */

import React, { useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  Sync as SyncIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import {
  useWorkflowProfiler,
  formatDuration,
  getComplexityColor,
  getComplexityLabel,
  NodePerformanceProfile,
} from "../../hooks/useWorkflowProfiler";

interface WorkflowProfilerProps {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  onAnalyze?: () => void;
  compact?: boolean;
}

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  workflowId,
  nodes,
  edges,
  onAnalyze,
  compact = false,
}) => {
  const theme = useTheme();
  const { profile, analyzeWorkflow, clearProfile } = useWorkflowProfiler(
    workflowId
  );

  useEffect(() => {
    if (nodes.length > 0 && edges.length >= 0) {
      analyzeWorkflow(nodes, edges);
    }
  }, [nodes.length, edges.length, analyzeWorkflow]);

  const handleReanalyze = () => {
    clearProfile();
    setTimeout(() => {
      analyzeWorkflow(nodes, edges);
      onAnalyze?.();
    }, 50);
  };

  const nodeCount = nodes.length;
  const layerCount = useMemo(() => {
    if (!profile) return 0;
    const uniqueLayers = new Set(
      profile.nodeProfiles.map((p: { nodeId: string }) => {
        const node = nodes.find((n) => n.id === p.nodeId);
        return node?.position.y || 0;
      })
    );
    return Math.ceil(Math.sqrt(uniqueLayers.size)) || 1;
  }, [profile, nodes]);

  if (compact) {
    return (
      <Box sx={{ p: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SpeedIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2">Performance Profile</Typography>
          </Box>
          <Tooltip title="Re-analyze">
            <IconButton size="small" onClick={handleReanalyze}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        {profile ? (
          <Box>
            <Typography variant="body2" color="text.secondary">
              {profile.totalNodes} nodes • Est.{" "}
              {formatDuration(profile.estimatedTotalRuntime)}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <LinearProgress
                variant="determinate"
                value={
                  Math.min(
                    100,
                    (profile.estimatedTotalRuntime / 10000) * 100
                  ) || 0
                }
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Click refresh to analyze
          </Typography>
        )}
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
          <SpeedIcon color="primary" />
          <Typography variant="h6">Workflow Performance Analyzer</Typography>
        </Box>
        <Tooltip title="Re-analyze workflow">
          <IconButton onClick={handleReanalyze} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {!profile || profile.totalNodes === 0 ? (
        <Paper
          sx={{
            p: 3,
            textAlign: "center",
            bgcolor: "action.hover",
          }}
        >
          <InfoIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            Add nodes to your workflow to see performance analysis
          </Typography>
        </Paper>
      ) : (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Overview
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Total Nodes
                </Typography>
                <Typography variant="h5">{profile.totalNodes}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Estimated Runtime
                </Typography>
                <Typography variant="h5">
                  {formatDuration(profile.estimatedTotalRuntime)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Parallel Layers
                </Typography>
                <Typography variant="h5">
                  {profile.parallelizableLayers} / {layerCount}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LightbulbIcon color="warning" />
                <Typography>Optimization Suggestions</Typography>
                {profile.suggestions.length > 0 && (
                  <Chip
                    label={profile.suggestions.length}
                    size="small"
                    color="warning"
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {profile.suggestions.length === 0 ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2" color="text.secondary">
                    No major issues detected. Your workflow looks well-structured!
                  </Typography>
                </Box>
              ) : (
                <List dense>
                  {profile.suggestions.map((suggestion: string, index: number) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <LightbulbIcon color="warning" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={suggestion} />
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <WarningIcon color="error" />
                <Typography>Potential Bottlenecks</Typography>
                {profile.bottlenecks.length > 0 && (
                  <Chip
                    label={profile.bottlenecks.length}
                    size="small"
                    color="error"
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {profile.bottlenecks.length === 0 ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2" color="text.secondary">
                    No significant bottlenecks identified
                  </Typography>
                </Box>
              ) : (
                <List dense>
                  {profile.bottlenecks.map((nodeProfile: NodePerformanceProfile, index: number) => (
                    <ListItem key={nodeProfile.nodeId}>
                      <ListItemIcon>
                        <WarningIcon color="error" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={nodeProfile.nodeName}
                        secondary={
                          <Box component="span">
                            {nodeProfile.bottlenecks.map((b: string, i: number) => (
                              <Typography
                                key={i}
                                variant="body2"
                                component="span"
                                sx={{ display: "block" }}
                              >
                                • {b}
                              </Typography>
                            ))}
                          </Box>
                        }
                      />
                      <Chip
                        label={getComplexityLabel(nodeProfile.complexity)}
                        size="small"
                        sx={{
                          bgcolor: theme.palette[nodeProfile.complexity === 'high' ? 'error' : nodeProfile.complexity === 'medium' ? 'warning' : 'success']?.main,
                          color: 'white',
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TrendingUpIcon color="primary" />
                <Typography>Critical Path</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                These nodes form the longest execution chain and determine
                minimum workflow runtime:
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {profile.criticalPath.map((nodeId: string, index: number) => {
                  const nodeProfile = profile.nodeProfiles.find(
                    (p: NodePerformanceProfile) => p.nodeId === nodeId
                  );
                  return (
                    <React.Fragment key={nodeId}>
                      {index > 0 && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ alignSelf: "center" }}
                        >
                          →
                        </Typography>
                      )}
                      <Chip
                        label={
                          nodeProfile?.nodeName ||
                          nodes.find((n) => n.id === nodeId)?.type ||
                          nodeId
                        }
                        size="small"
                        icon={
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: getComplexityColor(
                                nodeProfile?.complexity || "low"
                              ),
                            }}
                          />
                        }
                      />
                    </React.Fragment>
                  );
                })}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TimelineIcon color="action" />
                <Typography>All Nodes Analysis</Typography>
                <Chip
                  label={profile.nodeProfiles.length}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List dense sx={{ maxHeight: 400, overflow: "auto" }}>
                {profile.nodeProfiles
                  .sort(
                    (a: NodePerformanceProfile, b: NodePerformanceProfile) =>
                      b.estimatedRuntime - a.estimatedRuntime
                  )
                  .map((nodeProfile: NodePerformanceProfile) => {
                    const node = nodes.find((n) => n.id === nodeProfile.nodeId);
                    return (
                      <ListItem key={nodeProfile.nodeId}>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <Typography variant="body2">
                                {nodeProfile.nodeName}
                              </Typography>
                              <Chip
                                label={getComplexityLabel(
                                  nodeProfile.complexity
                                )}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: "0.7rem",
                                  bgcolor:
                                    theme.palette[
                                      nodeProfile.complexity === "high"
                                        ? "error"
                                        : nodeProfile.complexity === "medium"
                                        ? "warning"
                                        : "success"
                                    ]?.main,
                                  color: "white",
                                }}
                              />
                              {nodeProfile.parallelizable && (
                                <Tooltip title="Can run in parallel">
                                  <SyncIcon
                                    fontSize="small"
                                    color="action"
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          }
                          secondary={
                            <Box
                              component="span"
                              sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}
                            >
                              <Typography
                                variant="caption"
                                component="span"
                                sx={{ color: "text.secondary" }}
                              >
                                Est. {formatDuration(nodeProfile.estimatedRuntime)}
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(
                                  100,
                                  (nodeProfile.estimatedRuntime / 5000) * 100
                                )}
                                sx={{
                                  flex: 1,
                                  height: 4,
                                  borderRadius: 2,
                                  bgcolor: "action.hover",
                                }}
                              />
                            </Box>
                          }
                        />
                      </ListItem>
                    );
                  })}
              </List>
            </AccordionDetails>
          </Accordion>

          <Divider sx={{ my: 2 }} />

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center" }}
          >
            Analysis generated at{" "}
            {new Date(profile.timestamp).toLocaleTimeString()} • Runtime
            estimates are approximate and may vary based on hardware and model
            loading times.
          </Typography>
        </>
      )}
    </Box>
  );
};

export default WorkflowProfiler;
