/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Collapse,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Alert
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  Clear as ClearIcon
} from "@mui/icons-material";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useTheme } from "@mui/material/styles";
import type { NodePerformanceMetrics, WorkflowPerformanceProfile } from "../../stores/PerformanceAnalysisStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useStatusStore from "../../stores/StatusStore";
import { useNodeFocusStore } from "../../stores/NodeFocusStore";
import type { Node } from "@xyflow/react";

interface PerformancePanelProps {
  workflowId: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return milliseconds > 0 
      ? `${seconds}s ${milliseconds}ms` 
      : `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
};

const getPerformanceColor = (percentage: number, theme: any): string => {
  if (percentage >= 50) {
    return theme.palette.error.main;
  }
  if (percentage >= 30) {
    return theme.palette.warning.main;
  }
  if (percentage >= 20) {
    return theme.palette.warning.light;
  }
  return theme.palette.success.main;
};

const PerformancePanel: React.FC<PerformancePanelProps> = ({ workflowId }) => {
  const theme = useTheme();
  const [showDetails, setShowDetails] = useState(false);
  
  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId === workflowId && state.nodeStores[workflowId]
      ? state.nodeStores[workflowId]
      : undefined
  );

  const getTiming = useExecutionTimeStore((state) => state.getTiming);
  const getStatus = useStatusStore((state) => state.getStatus);
  const setFocusedNode = useNodeFocusStore((state) => state.setFocusedNode);

  const getCurrentProfile = useCallback(() => {
    if (!activeNodeStore) {
      return null;
    }
    
    const storeState = activeNodeStore.getState();
    const nodes = storeState.nodes;
    const workflow = storeState.getWorkflow?.();
    
    if (!nodes || nodes.length === 0) {
      return null;
    }

    return {
      workflowId,
      workflowName: workflow?.name || "Unknown Workflow",
      nodes,
      workflow
    };
  }, [workflowId, activeNodeStore]);

  const [profile, setProfile] = useState<WorkflowPerformanceProfile | null>(null);

  const analyzePerformance = useCallback(() => {
    const data = getCurrentProfile();
    if (!data) {
      return;
    }

    const timings: Record<string, { startTime: number; endTime?: number }> = {};
    const statuses: Record<string, string> = {};
    
    for (const node of data.nodes) {
      const timing = getTiming(workflowId, node.id);
      if (timing) {
        timings[node.id] = timing;
      }
      const status = getStatus(workflowId, node.id);
      if (status) {
        statuses[node.id] = typeof status === "string" ? status : "unknown";
      }
    }

    let totalDuration = 0;
    let completedNodes = 0;
    let failedNodes = 0;

    const getNodeLabel = (node: Node): string => {
      if (typeof node.data === "object" && node.data !== null && "title" in node.data) {
        return (node.data as any).title || node.id;
      }
      return node.id;
    };

    const getNodeType = (node: Node): string => {
      const originalType = typeof node.data === "object" && node.data !== null && "originalType" in node.data
        ? (node.data as any).originalType
        : null;
      return originalType || node.type || "unknown";
    };

    const perfNodes: NodePerformanceMetrics[] = data.nodes.map((node) => {
      const timing = timings[node.id] || { startTime: 0, endTime: undefined };
      const duration = timing.endTime ? timing.endTime - timing.startTime : 0;
      const status = statuses[node.id] || "unknown";
      
      if (duration > 0) {
        totalDuration = Math.max(totalDuration, duration);
      }
      
      if (status === "completed") {
        completedNodes++;
      } else if (status === "error") {
        failedNodes++;
      }

      return {
        nodeId: node.id,
        nodeName: getNodeLabel(node),
        nodeType: getNodeType(node),
        duration,
        status,
        startTime: timing.startTime,
        endTime: timing.endTime || 0,
        isBottleneck: false,
        percentageOfTotal: 0
      };
    });

    const nodesWithDuration = perfNodes.filter(n => n.duration > 0);
    const sortedNodes = [...nodesWithDuration].sort((a, b) => b.duration - a.duration);

    const bottlenecks: NodePerformanceMetrics[] = [];

    for (const node of perfNodes) {
      if (node.duration > 0) {
        node.percentageOfTotal = (node.duration / totalDuration) * 100;
        
        const rankIndex = sortedNodes.findIndex(n => n.nodeId === node.nodeId);
        if (rankIndex >= 0 && rankIndex < 3) {
          node.isBottleneck = true;
          bottlenecks.push(node);
        }
      }
    }

    const newProfile: WorkflowPerformanceProfile = {
      workflowId,
      workflowName: data.workflowName,
      totalDuration,
      nodeCount: data.nodes.length,
      completedNodes,
      failedNodes,
      nodes: perfNodes,
      bottlenecks: bottlenecks.slice(0, 5),
      timestamp: Date.now()
    };

    setProfile(newProfile);
  }, [workflowId, getCurrentProfile, getTiming, getStatus]);

  const clearAnalysis = useCallback(() => {
    setProfile(null);
  }, []);

  const handleFocusNode = useCallback((nodeId: string) => {
    setFocusedNode(nodeId);
  }, [setFocusedNode]);

  const bottlenecks = useMemo(() => {
    return profile?.bottlenecks || [];
  }, [profile]);

  const isAnalyzed = useMemo(() => {
    return profile !== null;
  }, [profile]);

  if (!activeNodeStore) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading...
        </Typography>
      </Box>
    );
  }

  if (!isAnalyzed) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <SpeedIcon sx={{ mr: 1, color: "primary.main" }} />
          <Typography variant="h6">Performance Analysis</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Run your workflow to analyze performance and identify bottlenecks.
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<RefreshIcon />}
          onClick={analyzePerformance}
          fullWidth
        >
          Analyze Performance
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <SpeedIcon sx={{ mr: 1, color: "primary.main" }} />
          <Typography variant="h6">Performance Analysis</Typography>
        </Box>
        <Box>
          <Tooltip title="Re-analyze">
            <IconButton size="small" onClick={analyzePerformance}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear">
            <IconButton size="small" onClick={clearAnalysis}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {profile && (
        <>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Runtime
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {formatDuration(profile.totalDuration)}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Nodes Executed
                </Typography>
                <Typography variant="body2">
                  {profile.completedNodes} / {profile.nodeCount}
                </Typography>
              </Box>
              {profile.failedNodes > 0 && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {profile.failedNodes} node(s) failed
                </Alert>
              )}
            </CardContent>
          </Card>

          {bottlenecks.length > 0 && (
            <Alert 
              severity="warning" 
              icon={<WarningIcon />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body2" fontWeight="bold">
                Performance Bottlenecks Detected
              </Typography>
              <Typography variant="caption">
                Top {bottlenecks.length} slowest nodes are consuming {bottlenecks.reduce((sum: number, n) => sum + n.percentageOfTotal, 0).toFixed(0)}% of total runtime
              </Typography>
            </Alert>
          )}

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle2">
              Node Performance
            </Typography>
            <IconButton 
              size="small" 
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showDetails}>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableCell>Node</TableCell>
                    <TableCell align="right">Duration</TableCell>
                    <TableCell align="right">%</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {profile.nodes
                    .filter((n) => n.duration > 0)
                    .sort((a: NodePerformanceMetrics, b: NodePerformanceMetrics) => b.duration - a.duration)
                    .map((node) => (
                      <TableRow 
                        key={node.nodeId}
                        hover
                        onClick={() => handleFocusNode(node.nodeId)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>
                          <Box sx={{ display: "flex", alignItems: "center" }}>
                            {node.isBottleneck && (
                              <TrendingUpIcon 
                                fontSize="small" 
                                sx={{ mr: 0.5, color: "warning.main" }} 
                              />
                            )}
                            <Box>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                                {node.nodeName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {node.nodeType}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatDuration(node.duration)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(node.percentageOfTotal, 100)}
                              sx={{ 
                                width: 40, 
                                mr: 1,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: theme.palette.grey[200],
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: getPerformanceColor(node.percentageOfTotal, theme)
                                }
                              }}
                            />
                            <Typography 
                              variant="body2" 
                              sx={{ color: getPerformanceColor(node.percentageOfTotal, theme) }}
                            >
                              {node.percentageOfTotal.toFixed(0)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={node.status}
                            color={node.status === "completed" ? "success" : 
                                   node.status === "error" ? "error" : "default"}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </>
      )}
    </Box>
  );
};

export default PerformancePanel;
