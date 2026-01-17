/**
 * WorkflowProfiler Component
 *
 * Displays workflow execution performance metrics including:
 * - Overall execution time
 * - Node-by-node timing breakdown
 * - Parallelism analysis
 * - Performance bottlenecks
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
  Collapse
} from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import useProfilerStore, { NodeProfile } from "../../stores/ProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useStatusStore from "../../stores/StatusStore";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import RefreshIcon from "@mui/icons-material/Refresh";
import TimerIcon from "@mui/icons-material/Timer";
import SpeedIcon from "@mui/icons-material/Speed";

interface WorkflowProfilerProps {
  workflowId?: string;
  compact?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const getStatusColor = (status: string, theme: any) => {
  switch (status) {
    case "completed": return theme.palette.success.main;
    case "failed": return theme.palette.error.main;
    case "running": return theme.palette.warning.main;
    default: return theme.palette.grey[500];
  }
};

const NodeTimingRow: React.FC<{
  node: NodeProfile;
  rank: number;
  maxDuration: number;
}> = ({ node, rank, maxDuration }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  const percentage = maxDuration > 0 ? ((node.duration || 0) / maxDuration) * 100 : 0;

  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox" width={40}>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell width={40}>
          <Typography variant="caption" color="text.secondary">#{rank}</Typography>
        </TableCell>
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: getStatusColor(node.status, theme)
              }}
            />
            <Typography variant="body2" noWrap title={node.nodeName}>
              {node.nodeName || node.nodeType.split(".").pop()}
            </Typography>
          </Box>
        </TableCell>
        <TableCell align="right" width={100}>
          <Typography variant="body2" fontWeight="medium">
            {node.duration ? formatDuration(node.duration) : "-"}
          </Typography>
        </TableCell>
        <TableCell width={120}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={percentage}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: theme.palette.action.hover,
                  "& .MuiLinearProgress-bar": {
                    bgcolor: getStatusColor(node.status, theme)
                  }
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" width={40}>
              {percentage.toFixed(0)}%
            </Typography>
          </Box>
        </TableCell>
        <TableCell width={80}>
          <Chip
            label={node.status}
            size="small"
            sx={{
              bgcolor: `${getStatusColor(node.status, theme)}20`,
              color: getStatusColor(node.status, theme),
              fontWeight: "medium"
            }}
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} padding="none">
          <Collapse in={expanded}>
            <Box sx={{ p: 2, bgcolor: theme.palette.action.hover, borderRadius: 1, m: 1 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                <strong>Node ID:</strong> {node.nodeId}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                <strong>Type:</strong> {node.nodeType}
              </Typography>
              {node.memoryEstimate && (
                <Typography variant="caption" color="text.secondary" display="block">
                  <strong>Memory Estimate:</strong> {(node.memoryEstimate / 1024 / 1024).toFixed(2)} MB
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block">
                <strong>Start Time:</strong> {new Date(node.startTime).toISOString()}
              </Typography>
              {node.endTime && (
                <Typography variant="caption" color="text.secondary" display="block">
                  <strong>End Time:</strong> {new Date(node.endTime).toISOString()}
                </Typography>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  workflowId,
  compact = false
}) => {
  const theme = useTheme();
  const { currentProfile, isProfiling, clearCurrentProfile } = useProfilerStore();
  const workflowManager = useWorkflowManager((state) => state);
  const _executionTimeStore = useExecutionTimeStore();
  const _statusStore = useStatusStore();
  const _activeWorkflowId = workflowId || workflowManager.currentWorkflowId;

  const nodeDurations = useMemo(() => {
    if (currentProfile) {
      return Object.values(currentProfile.nodes)
        .filter(n => n.duration !== undefined)
        .sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return [];
  }, [currentProfile]);

  const maxDuration = useMemo(() => {
    return Math.max(0, ...nodeDurations.map(n => n.duration || 0));
  }, [nodeDurations]);

  const chartData = useMemo(() => {
    return nodeDurations.slice(0, 10).map((node, index) => ({
      name: (node.nodeName || node.nodeType.split(".").pop() || `Node ${index + 1}`).substring(0, 15),
      duration: node.duration || 0,
      fill: getStatusColor(node.status, theme)
    }));
  }, [nodeDurations, theme]);

  const progress = useMemo(() => {
    if (!currentProfile) return 0;
    return ((currentProfile.completedNodes + currentProfile.failedNodes) / currentProfile.totalNodes) * 100;
  }, [currentProfile]);

  if (compact) {
    return (
      <Box sx={{ p: 2 }}>
        {currentProfile ? (
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <TimerIcon color={isProfiling ? "warning" : "action"} />
              <Typography variant="h6">
                {currentProfile.duration ? formatDuration(currentProfile.duration) : "Running..."}
              </Typography>
              {isProfiling && <LinearProgress sx={{ flex: 1 }} />}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {currentProfile.completedNodes}/{currentProfile.totalNodes} nodes completed
              {currentProfile.failedNodes > 0 && ` (${currentProfile.failedNodes} failed)`}
            </Typography>
          </Box>
        ) : (
          <Typography color="text.secondary">No profiling data available</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Workflow Profiler</Typography>
        </Box>
        {currentProfile && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Tooltip title="Clear profile">
              <IconButton size="small" onClick={clearCurrentProfile}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {!currentProfile ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography color="text.secondary">
            Run a workflow to see profiling data
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, mb: 2 }}>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h5" color="primary">
                {currentProfile.duration ? formatDuration(currentProfile.duration) : "-"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Total Duration
              </Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h5">
                {currentProfile.completedNodes}/{currentProfile.totalNodes}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Nodes Completed
              </Typography>
            </Paper>
            <Paper sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="h5" color={currentProfile.failedNodes > 0 ? "error" : "success.main"}>
                {currentProfile.failedNodes}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Failed Nodes
              </Typography>
            </Paper>
          </Box>

          {isProfiling && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Progress</Typography>
                <Typography variant="body2" color="text.secondary">{progress.toFixed(0)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={progress} />
            </Box>
          )}

          {chartData.length > 0 && (
            <Paper sx={{ p: 2, mb: 2, height: 200 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Slowest Nodes
              </Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatDuration(v)} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    formatter={(value: number | undefined) => [value !== undefined ? formatDuration(value) : "0ms", "Duration"]}
                    labelFormatter={(label) => label}
                  />
                  <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}

          <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell width={40}></TableCell>
                  <TableCell width={40}>#</TableCell>
                  <TableCell>Node</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell>Time Share</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodeDurations.map((node, index) => (
                  <NodeTimingRow
                    key={node.nodeId}
                    node={node}
                    rank={index + 1}
                    maxDuration={maxDuration}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

export default WorkflowProfiler;
