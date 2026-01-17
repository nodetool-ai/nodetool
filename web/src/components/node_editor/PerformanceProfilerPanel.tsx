import React from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { Node } from "@xyflow/react";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  nodes: Node[];
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

export const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  nodes,
}) => {

  const handleAnalyze = () => {
    analyzePerformance(workflowId, nodes as any);
  };

  const handleClear = () => {
    clearMetrics();
  };

  if (!metrics && !isAnalyzing) {
    return (
      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
        }}
      >
        <SpeedIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: "center" }}>
          Run a workflow execution first, then analyze performance.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleAnalyze}
          disabled={nodes.length === 0}
        >
          Analyze Performance
        </Button>
      </Box>
    );
  }

  if (isAnalyzing) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Analyzing workflow performance...</Typography>
        <LinearProgress sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (!metrics) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Failed to analyze performance.</Typography>
        <Button onClick={handleAnalyze} sx={{ mt: 1 }}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxHeight: 400, overflow: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6">Performance Profile</Typography>
        <Box>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleAnalyze}
            sx={{ mr: 1 }}
          >
            Re-analyze
          </Button>
          <Button size="small" onClick={handleClear}>
            Clear
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, mb: 3 }}>
        <Paper sx={{ p: 2, textAlign: "center" }}>
          <TimerIcon color="primary" />
          <Typography variant="h6">{formatDuration(metrics.totalDuration)}</Typography>
          <Typography variant="caption" color="text.secondary">
            Total Duration
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, textAlign: "center" }}>
          <TrendingUpIcon color="success" />
          <Typography variant="h6">
            {metrics.estimatedSpeedup.toFixed(1)}x
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Potential Speedup
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, textAlign: "center" }}>
          <SpeedIcon color="info" />
          <Typography variant="h6">{metrics.nodeCount}</Typography>
          <Typography variant="caption" color="text.secondary">
            Nodes Executed
          </Typography>
        </Paper>
      </Box>

      {metrics.bottlenecks.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, display: "flex", alignItems: "center" }}>
            <WarningIcon sx={{ mr: 1, color: "warning.main" }} />
            Bottlenecks
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Node</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">Share</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metrics.bottlenecks.slice(0, 5).map((bottleneck: any) => (
                  <TableRow key={bottleneck.nodeId}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {bottleneck.label}
                        </Typography>
                        <Chip
                          label={bottleneck.nodeType.split(".").pop()}
                          size="small"
                          sx={{ ml: 1, fontSize: "0.7rem" }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right">{formatDuration(bottleneck.duration)}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <LinearProgress
                          variant="determinate"
                          value={bottleneck.percentage}
                          sx={{ width: 50, mr: 1 }}
                        />
                        <Typography variant="caption">
                          {bottleneck.percentage.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {metrics.bottlenecks.length === 0 && metrics.totalDuration > 0 && (
        <Box sx={{ textAlign: "center", py: 2 }}>
          <Typography color="success.main">
            No significant bottlenecks detected.
          </Typography>
        </Box>
      )}

      {metrics.parallelizableChains.length > 0 && (
        <Box>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Execution Paths ({metrics.parallelizableChains.length})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Showing execution paths that could potentially run in parallel.
          </Typography>
          {metrics.parallelizableChains.slice(0, 3).map((chain: any, index: number) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.5,
                mt: 1,
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              {chain.map((nodeId: string, i: number) => (
                <React.Fragment key={nodeId}>
                  <Chip
                    label={String(nodes.find((n: any) => n.id === nodeId)?.data?.label || nodeId || "")}
                    size="small"
                    variant="outlined"
                  />
                  {i < chain.length - 1 && (
                    <Typography variant="caption" sx={{ alignSelf: "center" }}>
                      →
                    </Typography>
                  )}
                </React.Fragment>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default PerformanceProfilerPanel;
