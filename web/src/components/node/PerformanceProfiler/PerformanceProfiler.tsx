import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Button,
  LinearProgress,
  List,
  ListItem,
  Chip,
  Tooltip,
  Card,
  CardContent,
  Grid,
  Alert,
  Collapse,
  useTheme
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Timer as TimerIcon,
  Memory as MemoryIcon,
  Analytics as AnalyticsIcon
} from "@mui/icons-material";
import { useWorkflowPerformance } from "../../../hooks/useWorkflowPerformance";
import { NodePerformance } from "../../../stores/PerformanceStore";

interface PerformanceProfilerProps {
  workflowId: string;
  nodeCount: number;
  onAnalyze: () => void;
  onClose: () => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const PerformanceBar: React.FC<{
  value: number;
  max: number;
  color: string;
  label: string;
}> = ({ value, max, color, label }) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="caption">{percentage.toFixed(1)}%</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": {
            bgcolor: color,
            borderRadius: 4
          }
        }}
      />
    </Box>
  );
};

const NodePerformanceItem: React.FC<{
  node: NodePerformance;
  maxDuration: number;
}> = ({ node, maxDuration }) => {
  const theme = useTheme();
  const percentage = (node.duration / maxDuration) * 100;

  return (
    <ListItem
      sx={{
        bgcolor: node.isBottleneck ? "rgba(211, 47, 47, 0.08)" : "transparent",
        borderRadius: 1,
        mb: 0.5
      }}
    >
      <Box sx={{ width: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          {node.isBottleneck && (
            <Tooltip title="Performance bottleneck">
              <WarningIcon color="error" fontSize="small" />
            </Tooltip>
          )}
          <Typography variant="body2" sx={{ flex: 1 }}>
            {node.nodeType?.split(".").pop() || "Node"}
          </Typography>
          <Chip
            label={formatDuration(node.duration)}
            size="small"
            sx={{
              bgcolor: node.isBottleneck ? "error.main" : "action.selected",
              color: node.isBottleneck ? "error.contrastText" : "text.secondary"
            }}
          />
        </Box>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 4,
            borderRadius: 2,
            bgcolor: "action.hover",
            "& .MuiLinearProgress-bar": {
              bgcolor: node.isBottleneck
                ? theme.palette.error.main
                : theme.palette.primary.main,
              borderRadius: 2
            }
          }}
        />
      </Box>
    </ListItem>
  );
};

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  nodeCount,
  onAnalyze,
  onClose
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [showRecommendations, setShowRecommendations] = useState(true);

  const { analysis, latestSnapshot, recordExecution, clearSnapshots } = useWorkflowPerformance(workflowId);

  const handleAnalyze = useCallback(() => {
    recordExecution(nodeCount);
    onAnalyze();
  }, [recordExecution, nodeCount, onAnalyze]);

  const handleClear = useCallback(() => {
    clearSnapshots();
  }, [clearSnapshots]);

  const maxDuration = useMemo(() => {
    if (!latestSnapshot) {
      return 1;
    }
    return Math.max(...latestSnapshot.nodePerformances.map((n: { duration: number }) => n.duration), 1);
  }, [latestSnapshot]);

  if (!latestSnapshot) {
    return (
      <Paper
        elevation={3}
        sx={{
          width: 320,
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profile</Typography>
        </Box>

        <Box sx={{ textAlign: "center", py: 2 }}>
          <AnalyticsIcon sx={{ fontSize: 48, color: "action.disabled", mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            Run your workflow to see performance metrics
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={handleAnalyze}
          fullWidth
        >
          Analyze Performance
        </Button>

        <Button variant="outlined" size="small" onClick={onClose}>
          Close
        </Button>
      </Paper>
    );
  }

  const { metrics, bottleneckNodes, fastNodes, recommendations, performanceScore, isSlow } = analysis;

  const scoreColor = performanceScore >= 80
    ? theme.palette.success.main
    : performanceScore >= 50
      ? theme.palette.warning.main
      : theme.palette.error.main;

  return (
    <Paper
      elevation={3}
      sx={{
        width: 340,
        maxHeight: 500,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Box
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: isSlow ? "rgba(211, 47, 47, 0.04)" : "background.paper"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color={isSlow ? "error" : "primary"} />
          <Typography variant="h6">Performance</Typography>
          {isSlow && (
            <Chip
              label="Slow"
              size="small"
              color="error"
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
          )}
        </Box>
        <Box>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          <IconButton size="small" onClick={onClose}>
            <ExpandMoreIcon sx={{ transform: "rotate(45deg)" }} />
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        {!metrics ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography color="text.secondary">No performance data available</Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={6}>
                <Card variant="outlined" sx={{ textAlign: "center" }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <TimerIcon sx={{ fontSize: 24, color: "text.secondary", mb: 0.5 }} />
                    <Typography variant="h6">{formatDuration(metrics.totalDuration)}</Typography>
                    <Typography variant="caption" color="text.secondary">Total Time</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={6}>
                <Card variant="outlined" sx={{ textAlign: "center" }}>
                  <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <MemoryIcon sx={{ fontSize: 24, color: "text.secondary", mb: 0.5 }} />
                    <Typography variant="h6">{metrics.completedNodes}</Typography>
                    <Typography variant="caption" color="text.secondary">Nodes Run</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="subtitle2">Performance Score</Typography>
                <Typography variant="subtitle2" sx={{ color: scoreColor }}>
                  {performanceScore}/100
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={performanceScore}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: "action.hover",
                  "& .MuiLinearProgress-bar": {
                    bgcolor: scoreColor,
                    borderRadius: 4
                  }
                }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Timing Distribution</Typography>
              <PerformanceBar
                value={metrics.averageNodeDuration}
                max={metrics.p95NodeDuration * 1.2 || 1000}
                color={theme.palette.primary.main}
                label="Average"
              />
              <PerformanceBar
                value={metrics.medianNodeDuration}
                max={metrics.p95NodeDuration * 1.2 || 1000}
                color={theme.palette.secondary.main}
                label="Median"
              />
              <PerformanceBar
                value={metrics.p95NodeDuration}
                max={metrics.p95NodeDuration * 1.2 || 1000}
                color={theme.palette.warning.main}
                label="P95"
              />
            </Box>

            {bottleneckNodes.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                  <WarningIcon color="error" fontSize="small" />
                  <Typography variant="subtitle2" color="error.main">
                    Bottlenecks ({bottleneckNodes.length})
                  </Typography>
                </Box>
                <List dense disablePadding>
                  {bottleneckNodes.slice(0, 5).map((node: { nodeId: string }) => (
                    <NodePerformanceItem key={node.nodeId} node={node as import("../../../stores/PerformanceStore").NodePerformance} maxDuration={maxDuration} />
                  ))}
                </List>
              </Box>
            )}

            {recommendations.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Button
                  size="small"
                  onClick={() => setShowRecommendations(!showRecommendations)}
                  endIcon={showRecommendations ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ mb: 1 }}
                >
                  Recommendations ({recommendations.length})
                </Button>
                <Collapse in={showRecommendations}>
                  {recommendations.map((rec: string, index: number) => (
                    <Alert
                      key={index}
                      severity="info"
                      sx={{ mb: 0.5, py: 0 }}
                    >
                      <Typography variant="caption">{rec}</Typography>
                    </Alert>
                  ))}
                </Collapse>
              </Box>
            )}

            {fastNodes.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Fastest Nodes</Typography>
                <List dense disablePadding>
                  {fastNodes.map((node: { nodeId: string }) => (
                    <NodePerformanceItem key={node.nodeId} node={node as import("../../../stores/PerformanceStore").NodePerformance} maxDuration={maxDuration} />
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </Collapse>

      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          gap: 1
        }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleAnalyze}
          sx={{ flex: 1 }}
        >
          Re-analyze
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={handleClear}
        >
          Clear
        </Button>
      </Box>
    </Paper>
  );
};

export default PerformanceProfiler;
