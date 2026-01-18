import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Collapse
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Speed,
  Warning,
  Timer,
  TrendingUp
} from "@mui/icons-material";
import usePerformanceProfilerStore, {
  NodePerformanceMetrics
} from "../../stores/PerformanceProfilerStore";
import { useNodes } from "../../contexts/NodeContext";
import { useTheme } from "@mui/material/styles";

interface ProfilerPanelProps {
  workflowId: string;
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

const getPerformanceLevel = (
  duration: number,
  avgDuration: number
): "good" | "medium" | "poor" => {
  if (duration < avgDuration * 0.5) return "good";
  if (duration > avgDuration * 1.5) return "poor";
  return "medium";
};

const PerformanceBadge: React.FC<{ level: "good" | "medium" | "poor" }> = ({
  level
}) => {
  const theme = useTheme();
  const colors = {
    good: theme.palette.success.main,
    medium: theme.palette.warning.main,
    poor: theme.palette.error.main
  };

  return (
    <Box
      sx={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        bgcolor: colors[level]
      }}
    />
  );
};

const NodeMetricsItem: React.FC<{
  metrics: NodePerformanceMetrics;
  avgDuration: number;
}> = ({ metrics, avgDuration }) => {
  const [expanded, setExpanded] = React.useState(false);
  const level = getPerformanceLevel(metrics.duration, avgDuration);

  return (
    <ListItem
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        borderLeft: 3,
        borderColor: level === "good" ? "success.main" : level === "medium" ? "warning.main" : "error.main",
        mb: 1,
        borderRadius: 1
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          cursor: "pointer"
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <PerformanceBadge level={level} />
        <Box sx={{ flex: 1, ml: 1 }}>
          <Typography variant="body2" fontWeight={500}>
            {metrics.nodeName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {metrics.nodeType.split(".").pop()}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", mr: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            {formatDuration(metrics.duration)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {metrics.calls} call{metrics.calls !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>
      
      <Collapse in={expanded}>
        <Box sx={{ mt: 1, pl: 3 }}>
          <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Average
              </Typography>
              <Typography variant="body2">
                {formatDuration(metrics.avgDuration)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Min / Max
              </Typography>
              <Typography variant="body2">
                {formatDuration(metrics.minDuration)} / {formatDuration(metrics.maxDuration)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Performance
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, 100 - (metrics.duration / (avgDuration * 2)) * 100)}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: "action.hover",
                "& .MuiLinearProgress-bar": {
                  bgcolor: level === "good" ? "success.main" : level === "medium" ? "warning.main" : "error.main"
                }
              }}
            />
          </Box>
        </Box>
      </Collapse>
    </ListItem>
  );
};

export const ProfilerPanel: React.FC<ProfilerPanelProps> = ({ workflowId }) => {
  const profile = usePerformanceProfilerStore((state) =>
    state.profiles[workflowId]
  );
  const isProfiling = usePerformanceProfilerStore((state) => state.isProfiling);
  const currentWorkflowId = usePerformanceProfilerStore(
    (state) => state.currentWorkflowId
  );
  const startProfiling = usePerformanceProfilerStore(
    (state) => state.startProfiling
  );
  const stopProfiling = usePerformanceProfilerStore((state) => state.stopProfiling);
  const clearProfile = usePerformanceProfilerStore((state) => state.clearProfile);
  
  const nodes = useNodes((state) => state.nodes);
  const workflowName = useMemo(() => {
    const node = nodes[0];
    return (node?.data as { workflowName?: string })?.workflowName || "Untitled Workflow";
  }, [nodes]);

  const bottlenecks = usePerformanceProfilerStore((state) =>
    state.getBottlenecks(workflowId)
  );

  const metrics = useMemo(() => {
    if (!profile) {
      return [];
    }
    return Object.values(profile.nodeMetrics).sort(
      (a, b) => b.duration - a.duration
    );
  }, [profile]);

  const avgDuration = useMemo(() => {
    if (metrics.length === 0) {
      return 0;
    }
    return metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
  }, [metrics]);

  const totalDuration = useMemo(() => {
    if (!profile) {
      return 0;
    }
    return metrics.reduce((sum, m) => sum + m.duration, 0);
  }, [metrics, profile]);

  const handleStopProfiling = () => {
    stopProfiling();
  };

  if (!profile && !isProfiling) {
    return (
      <Paper
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200
        }}
      >
        <Speed sx={{ fontSize: 48, color: "action.disabled", mb: 1 }} />
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No profiling data available
        </Typography>
        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
          Run the workflow with profiling enabled to collect performance metrics
        </Typography>
        {currentWorkflowId !== workflowId && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Current profiling: {currentWorkflowId || "None"}
            </Typography>
          </Box>
        )}
      </Paper>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed color={isProfiling ? "warning" : "action"} />
          <Typography variant="h6">Performance Profiler</Typography>
          {isProfiling && (
            <Chip
              label="Recording"
              size="small"
              color="warning"
              icon={<Timer />}
            />
          )}
        </Box>
        <Box>
          {isProfiling ? (
            <Tooltip title="Stop Profiling">
              <IconButton onClick={handleStopProfiling} color="error">
                <Warning />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Clear Profile">
              <IconButton onClick={() => clearProfile(workflowId)}>
                <TrendingUp />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {profile && (
        <>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <Paper
              sx={{
                p: 1.5,
                flex: 1,
                textAlign: "center",
                bgcolor: "action.hover"
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Total Duration
              </Typography>
              <Typography variant="h6">
                {formatDuration(profile.totalDuration || totalDuration)}
              </Typography>
            </Paper>
            <Paper
              sx={{
                p: 1.5,
                flex: 1,
                textAlign: "center",
                bgcolor: "action.hover"
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Nodes
              </Typography>
              <Typography variant="h6">{metrics.length}</Typography>
            </Paper>
            <Paper
              sx={{
                p: 1.5,
                flex: 1,
                textAlign: "center",
                bgcolor: bottlenecks.length > 0 ? "error.light" : "action.hover"
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Bottlenecks
              </Typography>
              <Typography variant="h6">{bottlenecks.length}</Typography>
            </Paper>
          </Box>

          {bottlenecks.length > 0 && (
            <Paper
              sx={{
                p: 1.5,
                mb: 2,
                bgcolor: "error.light",
                borderLeft: 3,
                borderColor: "error.main"
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Warning color="error" fontSize="small" />
                <Typography variant="subtitle2" color="error.dark">
                  Performance Bottlenecks Detected
                </Typography>
              </Box>
              <List dense sx={{ py: 0 }}>
                {bottlenecks.slice(0, 3).map((b) => (
                  <ListItem key={b.nodeId} sx={{ py: 0.5 }}>
                    <ListItemText
                      primary={b.nodeName}
                      secondary={`${formatDuration(b.duration)} (avg: ${formatDuration(b.avgDuration)})`}
                      primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Node Performance ({metrics.length} nodes)
          </Typography>
          {metrics.length > 0 ? (
            <List sx={{ maxHeight: 300, overflow: "auto" }}>
              {metrics.map((m) => (
                <NodeMetricsItem
                  key={m.nodeId}
                  metrics={m}
                  avgDuration={avgDuration}
                />
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No node metrics collected yet
            </Typography>
          )}
        </>
      )}

      {isProfiling && currentWorkflowId === workflowId && (
        <Box sx={{ mt: 2, textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary">
            Recording execution metrics... Run your workflow to collect data.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ProfilerPanel;
