/**
 * PerformanceProfilerPanel Component
 *
 * Side panel for analyzing workflow performance and identifying bottlenecks.
 * Provides visual timeline, statistics, and optimization suggestions.
 */

import React, { useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  List,
  ListItemText,
  Chip,
  ListItemButton,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  useTheme
} from "@mui/material";
import {
  Speed as SpeedIcon,
  ExpandMore as ExpandMoreIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  PlayArrow as PlayIcon,
  Timer as TimerIcon
} from "@mui/icons-material";
import PerformanceTimeline from "./PerformanceTimeline";
import { useWorkflowPerformance, formatDuration, formatDurationLong } from "../../hooks/useWorkflowPerformance";
import usePerformanceProfilerStore from "../../stores/PerformanceProfilerStore";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  workflowName: string;
  nodes: Array<{
    id: string;
    type: string;
    data?: Record<string, unknown>;
  }>;
  onNodeClick?: (nodeId: string) => void;
}

const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  workflowName,
  nodes,
  onNodeClick
}) => {
  const theme = useTheme();
  const {
    profile,
    isAnalyzing,
    analyzePerformance,
    getSuggestions
  } = useWorkflowPerformance({ workflowId, nodes });

  const potentialSavings = usePerformanceProfilerStore(state => state.getTotalPotentialSavings());

  useEffect(() => {
    if (profile) {
      analyzePerformance();
    }
  }, [profile, analyzePerformance]);

  const suggestions = useMemo(() => getSuggestions(), [getSuggestions]);

  const stats = useMemo(() => {
    if (!profile) {
      return null;
    }

    const parallelismStatus = profile.parallelismScore >= 80
      ? "Excellent"
      : profile.parallelismScore >= 60
        ? "Good"
        : profile.parallelismScore >= 40
          ? "Fair"
          : "Poor";

    return {
      totalDuration: formatDurationLong(profile.totalDuration),
      nodeCount: profile.nodeCount,
      completedNodes: profile.completedNodes,
      failedNodes: profile.failedNodes,
      parallelismScore: profile.parallelismScore,
      parallelismStatus,
      bottleneckCount: profile.bottlenecks.length,
      potentialSavings: formatDuration(potentialSavings)
    };
  }, [profile, potentialSavings]);

  const getSuggestionIcon = (severity: "info" | "warning" | "error") => {
    switch (severity) {
      case "error": return <ErrorIcon color="error" fontSize="small" />;
      case "warning": return <WarningIcon color="warning" fontSize="small" />;
      default: return <InfoIcon color="info" fontSize="small" />;
    }
  };

  if (isAnalyzing && !profile) {
    return (
      <Paper
        elevation={3}
        sx={{
          width: 320,
          height: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3
        }}
      >
        <CircularProgress size={32} sx={{ mb: 2 }} />
        <Typography color="text.secondary">Analyzing performance...</Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        width: 320,
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
          borderColor: "divider",
          bgcolor: theme.palette.primary.main,
          color: "primary.contrastText"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon />
          <Typography variant="h6">Performance</Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={isAnalyzing ? <CircularProgress size={16} color="inherit" /> : <PlayIcon />}
          onClick={analyzePerformance}
          disabled={isAnalyzing}
          sx={{
            bgcolor: "white",
            color: "primary.main",
            "&:hover": {
              bgcolor: "rgba(255,255,255,0.9)"
            }
          }}
        >
          {isAnalyzing ? "Analyzing" : "Analyze"}
        </Button>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {!profile || profile.completedNodes === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <TimelineIcon sx={{ fontSize: 48, color: theme.palette.action.disabled, mb: 2 }} />
            <Typography color="text.secondary" gutterBottom>
              No execution data yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Run your workflow to collect performance data
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
              <Chip
                icon={<TimerIcon />}
                label={stats?.totalDuration || "0ms"}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`${stats?.completedNodes}/${stats?.nodeCount} nodes`}
                size="small"
                variant="outlined"
              />
              {stats?.failedNodes && stats.failedNodes > 0 && (
                <Chip
                  label={`${stats.failedNodes} failed`}
                  size="small"
                  color="error"
                  variant="outlined"
                />
              )}
            </Box>

            {stats && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Parallelism Score
                  </Typography>
                  <Typography variant="caption" fontWeight="bold">
                    {stats.parallelismScore}%
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: theme.palette.action.hover,
                    overflow: "hidden"
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${stats.parallelismScore}%`,
                      bgcolor: stats.parallelismScore >= 80
                        ? theme.palette.success.main
                        : stats.parallelismScore >= 60
                          ? theme.palette.info.main
                          : stats.parallelismScore >= 40
                            ? theme.palette.warning.main
                            : theme.palette.error.main,
                      transition: "width 0.3s ease"
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {stats.parallelismStatus} parallel execution
                </Typography>
              </Box>
            )}

            <PerformanceTimeline
              nodes={profile.nodes}
              totalDuration={profile.totalDuration}
              width={280}
              height={180}
            />

            {profile.bottlenecks.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <WarningIcon
                    fontSize="small"
                    sx={{ verticalAlign: "text-bottom", mr: 0.5, color: theme.palette.warning.main }}
                  />
                  Bottlenecks ({profile.bottlenecks.length})
                </Typography>
                <List dense sx={{ bgcolor: "rgba(255,152,0,0.1)", borderRadius: 1 }}>
                  {profile.bottlenecks.slice(0, 5).map((node) => (
                    <ListItemButton
                      key={node.nodeId}
                      sx={{ py: 0.5 }}
                      onClick={() => onNodeClick?.(node.nodeId)}
                    >
                      <ListItemText
                        primary={node.nodeName}
                        secondary={formatDuration(node.duration)}
                        primaryTypographyProps={{ variant: "body2", noWrap: true }}
                        secondaryTypographyProps={{ variant: "caption" }}
                      />
                      <Chip
                        label={node.isParallelizable ? "Parallel" : "Sequential"}
                        size="small"
                        color={node.isParallelizable ? "info" : "default"}
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}

            {suggestions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <LightbulbIcon
                    fontSize="small"
                    sx={{ verticalAlign: "text-bottom", mr: 0.5, color: theme.palette.info.main }}
                  />
                  Suggestions
                </Typography>
                {suggestions.map((suggestion, index) => (
                  <Alert
                    key={index}
                    severity={suggestion.severity}
                    icon={getSuggestionIcon(suggestion.severity)}
                    sx={{ mb: 1, py: 0 }}
                  >
                    <Typography variant="body2" fontWeight="medium">
                      {suggestion.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {suggestion.description}
                    </Typography>
                    {suggestion.potentialSavings && (
                      <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 0.5 }}>
                        Potential savings: {suggestion.potentialSavings}ms
                      </Typography>
                    )}
                  </Alert>
                ))}
              </Box>
            )}

            {potentialSavings > 0 && (
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">
                    <TimerIcon fontSize="small" sx={{ verticalAlign: "text-bottom", mr: 0.5 }} />
                    Optimization Opportunities
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    By parallelizing independent nodes and optimizing slow operations, you could save up to:
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {formatDuration(potentialSavings)}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    {workflowName}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            )}
          </>
        )}
      </Box>

      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: theme.palette.action.hover
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Last analyzed: {profile ? new Date(profile.timestamp).toLocaleTimeString() : "Never"}
        </Typography>
      </Box>
    </Paper>
  );
};

export default PerformanceProfilerPanel;
