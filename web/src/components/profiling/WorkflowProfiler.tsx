/**
 * WorkflowProfiler Component
 *
 * Displays performance profiling information for workflow executions.
 * Shows node execution times, bottlenecks, and optimization suggestions.
 */

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
  Tooltip,
  IconButton,
  Collapse,
  alpha
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Clear as ClearIcon
} from "@mui/icons-material";
import { useWorkflowProfilerStore, NodeProfile, WorkflowProfile } from "../../stores/WorkflowProfilerStore";

interface WorkflowProfilerProps {
  nodes?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
};

const getDurationColor = (duration: number, avgDuration: number): string => {
  if (duration > avgDuration * 2) {return "error";}
  if (duration > avgDuration * 1.5) {return "warning";}
  return "success";
};

const NodeProfileItem: React.FC<{
  node: NodeProfile;
  avgDuration: number;
  maxDuration: number;
}> = ({ node, avgDuration, maxDuration }) => {
  const [expanded, setExpanded] = React.useState(false);

  const progress = maxDuration > 0 ? (node.duration / maxDuration) * 100 : 0;
  const color = getDurationColor(node.duration, avgDuration);
  const colorValue = color === "error" ? "#d32f2f" : color === "warning" ? "#ed6c02" : "#2e7d32";

  const statusColors: Record<string, string> = {
    pending: "#9e9e9e",
    running: "#0288d1",
    completed: "#2e7d32",
    failed: "#d32f2f",
    skipped: "#ed6c02"
  };

  return (
    <Box
      sx={{
        mb: 1,
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: 1,
          cursor: "pointer",
          bgcolor: alpha(colorValue, 0.05),
          "&:hover": { bgcolor: alpha(colorValue, 0.1) }
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ width: 36, mr: 1 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              bgcolor: statusColors[node.status],
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" noWrap fontWeight="medium">
              {node.nodeName}
            </Typography>
            <Chip
              label={node.nodeType.split(".").pop()}
              size="small"
              sx={{ height: 18, fontSize: "0.65rem" }}
            />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(progress, 100)}
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(colorValue, 0.2),
                "& .MuiLinearProgress-bar": {
                  bgcolor: colorValue,
                  borderRadius: 3
                }
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50, textAlign: "right" }}>
              {formatDuration(node.duration)}
            </Typography>
          </Box>
        </Box>

        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: 2, bgcolor: "action.hover" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Typography variant="body2">{node.status}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Duration</Typography>
              <Typography variant="body2">{formatDuration(node.duration)}</Typography>
            </Box>
            {node.startTime && (
              <Box>
                <Typography variant="caption" color="text.secondary">Started</Typography>
                <Typography variant="body2">
                  {new Date(node.startTime).toLocaleTimeString()}
                </Typography>
              </Box>
            )}
            {node.endTime && (
              <Box>
                <Typography variant="caption" color="text.secondary">Completed</Typography>
                <Typography variant="body2">
                  {new Date(node.endTime).toLocaleTimeString()}
                </Typography>
              </Box>
            )}
            {node.outputSize !== undefined && (
              <Box>
                <Typography variant="caption" color="text.secondary">Output Size</Typography>
                <Typography variant="body2">
                  {(node.outputSize / 1024).toFixed(1)} KB
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

const BottleneckAlert: React.FC<{ bottlenecks: NodeProfile[] }> = ({ bottlenecks }) => {
  if (bottlenecks.length === 0) {return null;}

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        bgcolor: alpha("#ed6c02", 0.1),
        border: 1,
        borderColor: alpha("#ed6c02", 0.3),
        borderRadius: 2
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <WarningIcon color="warning" fontSize="small" />
        <Typography variant="subtitle2" color="warning.dark">
          Performance Bottlenecks Detected
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        The following nodes are taking significantly longer than others:
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {bottlenecks.map(node => (
          <Chip
            key={node.nodeId}
            label={`${node.nodeName} (${formatDuration(node.duration)})`}
            size="small"
            color="warning"
            variant="outlined"
          />
        ))}
      </Box>
    </Paper>
  );
};

const OptimizationSuggestions: React.FC<{ profile: WorkflowProfile }> = ({ profile }) => {
  const suggestions: string[] = [];

  if (profile.bottlenecks.length > 0) {
    suggestions.push("Consider optimizing the bottlenecks or using faster alternatives for those nodes.");
  }

  if (profile.parallelizableNodes.length > 0) {
    suggestions.push("Some nodes could potentially run in parallel to reduce total execution time.");
  }

  const slowNodes = profile.nodes.filter(n => n.duration > profile.averageNodeDuration * 2);
  if (slowNodes.length > profile.nodes.length * 0.3) {
    suggestions.push("Over 30% of nodes are running slowly. Consider reviewing the workflow structure.");
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mt: 2,
        bgcolor: alpha("#0288d1", 0.1),
        border: 1,
        borderColor: alpha("#0288d1", 0.3),
        borderRadius: 2
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <TrendingUpIcon color="info" fontSize="small" />
        <Typography variant="subtitle2" color="info.dark">
          Optimization Suggestions
        </Typography>
      </Box>
      <List dense sx={{ py: 0 }}>
        {suggestions.map((suggestion, index) => (
          <ListItem key={index} sx={{ py: 0.5 }}>
            <ListItemText
              primary={suggestion}
              primaryTypographyProps={{ variant: "body2" }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  nodes: _propsNodes
}) => {
  const { currentProfile, historicalProfiles, clearHistory } = useWorkflowProfilerStore();
  const _nodes = _propsNodes || [];

  const maxDuration = useMemo(() => {
    if (!currentProfile) {return 0;}
    return Math.max(...currentProfile.nodes.map(n => n.duration), 1);
  }, [currentProfile]);

  const avgDuration = currentProfile?.averageNodeDuration || 0;

  if (!currentProfile) {
    return (
      <Paper
        elevation={3}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          p: 3
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Workflow Profiler</Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center"
          }}
        >
          <TimerIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
          <Typography color="text.secondary">
            No active workflow execution
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Run a workflow to see performance metrics
          </Typography>
        </Box>

        {historicalProfiles.length > 0 && (
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Recent Profiles ({historicalProfiles.length})
              </Typography>
              <Tooltip title="Clear history">
                <IconButton size="small" onClick={clearHistory}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <List dense sx={{ maxHeight: 150, overflow: "auto" }}>
              {historicalProfiles.slice(0, 5).map((profile, index) => (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={profile.workflowName}
                    secondary={`${formatDuration(profile.totalDuration)} • ${profile.nodes.length} nodes`}
                    primaryTypographyProps={{ variant: "body2" }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Paper>
    );
  }

  const sortedNodes = [...currentProfile.nodes].sort((a, b) => b.duration - a.duration);

  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        height: "100%",
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
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Profiling: {currentProfile.workflowName}</Typography>
        </Box>
        <Chip
          icon={<TimerIcon />}
          label={`Total: ${formatDuration(currentProfile.totalDuration)}`}
          size="small"
          color="primary"
          variant="outlined"
        />
      </Box>

      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Nodes</Typography>
            <Typography variant="h6">{currentProfile.nodes.length}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Avg Duration</Typography>
            <Typography variant="h6">{formatDuration(avgDuration)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Completed</Typography>
            <Typography variant="h6">
              {currentProfile.nodes.filter(n => n.status === "completed").length}
            </Typography>
          </Box>
        </Box>
      </Box>

      <BottleneckAlert bottlenecks={currentProfile.bottlenecks} />

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Node Performance (sorted by duration)
        </Typography>
        {sortedNodes.map(node => (
          <NodeProfileItem
            key={node.nodeId}
            node={node}
            avgDuration={avgDuration}
            maxDuration={maxDuration}
          />
        ))}
      </Box>

      <OptimizationSuggestions profile={currentProfile} />
    </Paper>
  );
};

export default WorkflowProfiler;
