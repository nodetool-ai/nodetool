import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Collapse
} from "@mui/material";
import {
  ExpandMore,
  Speed,
  Timer,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Refresh
} from "@mui/icons-material";
import usePerformanceStore, { NodePerformanceMetrics, WorkflowPerformanceSummary } from "../../stores/PerformanceStore";

interface PerformanceProfilerProps {
  workflowId: string;
  compact?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) {return "-";}
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getStatusIcon = (status: NodePerformanceMetrics["status"]) => {
  switch (status) {
    case "completed":
      return <CheckCircle fontSize="small" sx={{ color: "success.main" }} />;
    case "error":
      return <ErrorIcon fontSize="small" sx={{ color: "error.main" }} />;
    case "running":
      return <Speed fontSize="small" sx={{ color: "info.main" }} />;
    default:
      return <Timer fontSize="small" sx={{ color: "action.disabled" }} />;
  }
};

const getStatusColor = (status: NodePerformanceMetrics["status"]): "default" | "primary" | "success" | "error" | "warning" => {
  switch (status) {
    case "completed":
      return "success";
    case "error":
      return "error";
    case "running":
      return "primary";
    default:
      return "default";
  }
};

const PerformanceRow: React.FC<{
  metrics: NodePerformanceMetrics;
  expanded: boolean;
  onToggleExpand: () => void;
}> = ({ metrics, expanded, onToggleExpand }) => {
  const percentage = metrics.averageDuration > 0 ? 100 : 0;

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox">
          <IconButton size="small" onClick={onToggleExpand}>
            <ExpandMore
              sx={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s"
              }}
            />
          </IconButton>
        </TableCell>
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {getStatusIcon(metrics.status)}
            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }} title={metrics.nodeName}>
              {metrics.nodeName}
            </Typography>
          </Box>
        </TableCell>
        <TableCell>
          <Chip
            label={metrics.status}
            size="small"
            color={getStatusColor(metrics.status)}
            variant="outlined"
          />
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{metrics.executionCount}</Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight="medium">
            {formatDuration(metrics.averageDuration)}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end" }}>
            <Box sx={{ width: 60 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(percentage, 100)}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {formatDuration(metrics.maxDuration)}
            </Typography>
          </Box>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">{formatFileSize(metrics.outputSize)}</Typography>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} padding="none" sx={{ border: 0 }}>
          <Collapse in={expanded}>
            <Box
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderRadius: 1,
                m: 1
              }}
            >
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Duration
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {formatDuration(metrics.totalDuration)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Min Duration
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {formatDuration(metrics.minDuration === Infinity ? 0 : metrics.minDuration)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Max Duration
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {formatDuration(metrics.maxDuration)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Last Duration
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {formatDuration(metrics.lastDuration)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Node Type
                  </Typography>
                  <Typography variant="body2" fontWeight="medium" noWrap>
                    {metrics.nodeType}
                  </Typography>
                </Box>
                {metrics.errorMessage && (
                  <Box sx={{ gridColumn: "span 3" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "error.main" }}>
                      <Warning fontSize="small" />
                      <Typography variant="body2" color="error">
                        {metrics.errorMessage}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const PerformanceSummary: React.FC<{ summary: WorkflowPerformanceSummary }> = ({ summary }) => {
  const progress = summary.nodeCount > 0
    ? ((summary.completedNodes + summary.failedNodes) / summary.nodeCount) * 100
    : 0;

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: "background.default",
        borderRadius: 1,
        mb: 2
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">
          Workflow Execution Summary
        </Typography>
        <Chip
          label={`${summary.completedNodes}/${summary.nodeCount} nodes`}
          size="small"
          color={summary.failedNodes > 0 ? "error" : "primary"}
        />
        {summary.failedNodes > 0 && (
          <Chip
            label={`${summary.failedNodes} failed`}
            size="small"
            color="error"
            variant="outlined"
          />
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
          {formatDuration(summary.totalExecutionTime)}
        </Typography>
      </Box>
    </Box>
  );
};

const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId: _workflowId,
  compact = false
}) => {
  const metrics = usePerformanceStore((state) => state.getAllMetrics());
  const workflowSummary = usePerformanceStore((state) => state.workflowSummary);
  const isProfiling = usePerformanceStore((state) => state.isProfiling);
  const clearMetrics = usePerformanceStore((state) => state.clearMetrics);

  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => b.averageDuration - a.averageDuration);
  }, [metrics]);

  const slowestNodes = useMemo(() => {
    return sortedMetrics.filter((m) => m.executionCount > 0).slice(0, 3);
  }, [sortedMetrics]);

  const handleToggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedRows(newExpanded);
  };

  const handleClear = () => {
    clearMetrics();
    setExpandedRows(new Set());
  };

  if (metrics.length === 0 && !isProfiling) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: "center",
          color: "text.secondary"
        }}
      >
        <Speed sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="body1" gutterBottom>
          No profiling data available
        </Typography>
        <Typography variant="body2">
          Run a workflow to see performance metrics
        </Typography>
      </Box>
    );
  }

  if (compact) {
    return (
      <Box sx={{ p: 2 }}>
        {workflowSummary && <PerformanceSummary summary={workflowSummary} />}
        {slowestNodes.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Bottlenecks
            </Typography>
            {slowestNodes.map((node) => (
              <Box
                key={node.nodeId}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 0.5
                }}
              >
                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                  {node.nodeName}
                </Typography>
                <Chip
                  label={formatDuration(node.averageDuration)}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
          {isProfiling && (
            <Chip label="Recording" size="small" color="primary" />
          )}
        </Box>
        <Tooltip title="Clear profiling data">
          <IconButton size="small" onClick={handleClear}>
            <Refresh fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {workflowSummary && <PerformanceSummary summary={workflowSummary} />}

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" width={50} />
                <TableCell>Node</TableCell>
                <TableCell width={100}>Status</TableCell>
                <TableCell align="right" width={80}>Runs</TableCell>
                <TableCell align="right" width={100}>Avg Time</TableCell>
                <TableCell align="right" width={180}>Duration Range</TableCell>
                <TableCell align="right" width={100}>Output</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedMetrics.map((nodeMetrics) => (
                <PerformanceRow
                  key={nodeMetrics.nodeId}
                  metrics={nodeMetrics}
                  expanded={expandedRows.has(nodeMetrics.nodeId)}
                  onToggleExpand={() => handleToggleExpand(nodeMetrics.nodeId)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default PerformanceProfiler;
