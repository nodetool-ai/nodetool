/** @jsxImportSource @emotion/react */
import React, { useMemo, memo } from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  WarningAmber as WarningIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
} from "@mui/icons-material";
import isEqual from "lodash/isEqual";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";
import { useNodes } from "../../contexts/NodeContext";

interface WorkflowProfilerProps {
  workflowId: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const getDurationColor = (duration: number, maxDuration: number): string => {
  if (maxDuration === 0) {
    return "success.main";
  }
  const ratio = duration / maxDuration;
  if (ratio > 0.8) {
    return "error.main";
  }
  if (ratio > 0.5) {
    return "warning.main";
  }
  if (ratio > 0.2) {
    return "info.main";
  }
  return "success.main";
};

const DurationBar: React.FC<{ duration: number; maxDuration: number; color: string }> = ({
  duration,
  maxDuration,
  color,
}) => {
  const percentage = maxDuration > 0 ? (duration / maxDuration) * 100 : 0;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, percentage)}
        sx={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          backgroundColor: "action.hover",
          "& .MuiLinearProgress-bar": {
            borderRadius: 4,
            backgroundColor: color,
          },
        }}
      />
      <Typography variant="caption" sx={{ minWidth: 60, textAlign: "right", fontFamily: "monospace" }}>
        {formatDuration(duration)}
      </Typography>
    </Box>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, icon, color = "primary.main" }) => (
  <Paper
    elevation={0}
    sx={{
      p: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      border: 1,
      borderColor: "divider",
      borderRadius: 2,
      backgroundColor: "background.default",
    }}
  >
    <Box sx={{ color, display: "flex" }}>{icon}</Box>
    <Typography variant="h5" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
      {value}
    </Typography>
    <Typography variant="caption" color="text.secondary">
      {title}
    </Typography>
  </Paper>
);

const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({ workflowId }) => {
  const profile = useWorkflowProfilerStore((state) => state.profile);
  const isProfiling = useWorkflowProfilerStore((state) => state.isProfiling);
  const nodes = useNodes((state) => state.nodes);
  const analyzeWorkflow = useWorkflowProfilerStore((state) => state.analyzeWorkflow);
  const clearProfile = useWorkflowProfilerStore((state) => state.clearProfile);
  const isProfileStale = useMemo(() => {
    if (!profile) {
      return true;
    }
    return Date.now() - profile.timestamp > 30000;
  }, [profile]);

  const handleAnalyze = React.useCallback(() => {
    const nodeList = nodes.map((n) => ({
      id: n.id,
      data: { label: n.data.title, nodeType: n.data.originalType },
    }));
    analyzeWorkflow(workflowId, nodeList);
  }, [workflowId, nodes, analyzeWorkflow]);

  const handleClear = React.useCallback(() => {
    clearProfile();
  }, [clearProfile]);

  const maxDuration = useMemo(() => profile?.maxDuration || 0, [profile]);

  if (!profile && !isProfiling) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <SpeedIcon sx={{ fontSize: 48, color: "action.disabled", mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Profile Data
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Run a workflow execution to see performance metrics
        </Typography>
        <Chip
          icon={<RefreshIcon />}
          label="Analyze Current Execution"
          onClick={handleAnalyze}
          color="primary"
          variant="outlined"
        />
      </Box>
    );
  }

  if (isProfiling) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Analyzing Performance...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          Performance Profile
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          {isProfileStale && (
            <Tooltip title="Data may be outdated">
              <Chip label="Stale" size="small" color="warning" />
            </Tooltip>
          )}
          <Tooltip title="Re-analyze">
            <IconButton size="small" onClick={handleAnalyze}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear">
            <IconButton size="small" onClick={handleClear}>
              <TimerIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <StatCard
          title="Total Time"
          value={formatDuration(profile.totalDuration)}
          icon={<TimerIcon />}
          color="primary.main"
        />
        <StatCard
          title="Avg Node Time"
          value={formatDuration(profile.avgDuration)}
          icon={<TrendingUpIcon />}
          color="info.main"
        />
        <StatCard
          title="Nodes Executed"
          value={`${profile.completedCount}/${profile.nodeCount}`}
          icon={<SpeedIcon />}
          color="success.main"
        />
        <StatCard
          title="Max Node Time"
          value={formatDuration(profile.maxDuration)}
          icon={<WarningIcon />}
          color="warning.main"
        />
      </Box>

      {profile.bottlenecks.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <WarningIcon fontSize="small" color="warning" />
            Top Bottlenecks
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Node</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell sx={{ width: "40%" }}>Impact</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {profile.bottlenecks.map((node, index) => (
                  <TableRow key={node.nodeId} sx={{ backgroundColor: index === 0 ? "warning.lighter" : "inherit" }}>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {index === 0 && <WarningIcon fontSize="small" color="error" />}
                        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                          {node.nodeLabel}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 500 }}>
                        {formatDuration(node.duration)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <DurationBar
                        duration={node.duration}
                        maxDuration={maxDuration}
                        color={getDurationColor(node.duration, maxDuration)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Execution Timeline
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, maxHeight: 300, overflow: "auto" }}>
          {profile.nodes.map((node) => (
            <Box
              key={node.nodeId}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                py: 0.5,
                borderBottom: 1,
                borderColor: "divider",
                "&:last-child": { borderBottom: 0 },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  minWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.nodeLabel}
              </Typography>
              <Box sx={{ flex: 1 }}>
                <DurationBar
                  duration={node.duration}
                  maxDuration={maxDuration}
                  color={getDurationColor(node.duration, maxDuration)}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>
                {((node.duration / profile.totalDuration) * 100).toFixed(1)}%
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
};

export default memo(WorkflowProfiler, isEqual);
