/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Collapse,
  Tooltip,
  useTheme,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Timeline as TimelineIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import usePerformanceProfilerStore, {
  BottleneckNode,
  ParallelizableGroup,
} from "../../stores/PerformanceProfilerStore";
import { useNodes } from "../../contexts/NodeContext";

interface PerformanceProfilerProps {
  workflowId: string;
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

const getSeverityColor = (severity: BottleneckNode["severity"], theme: any): string => {
  switch (severity) {
    case "critical":
      return theme.palette.error.main;
    case "high":
      return theme.palette.warning.main;
    case "medium":
      return theme.palette.info.main;
    case "low":
      return theme.palette.success.main;
    default:
      return theme.palette.grey[500];
  }
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}> = ({ title, value, subtitle, icon, color }) => {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.default",
        minWidth: 100,
      }}
    >
      <Box sx={{ color: color || theme.palette.primary.main, mb: 0.5 }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
};

const BottleneckRow: React.FC<{
  bottleneck: BottleneckNode;
  index: number;
  maxPercentage: number;
}> = ({ bottleneck, index, maxPercentage }) => {
  const theme = useTheme();
  const percentage = (bottleneck.percentageOfTotal / maxPercentage) * 100;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              minWidth: 20,
              color: "text.secondary",
            }}
          >
            #{index + 1}
          </Typography>
          <Tooltip title={bottleneck.nodeType}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {bottleneck.nodeLabel}
            </Typography>
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            label={bottleneck.severity}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.7rem",
              bgcolor: getSeverityColor(bottleneck.severity, theme),
              color: "white",
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 50, textAlign: "right" }}>
            {formatDuration(bottleneck.duration)}
          </Typography>
        </Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": {
            bgcolor: getSeverityColor(bottleneck.severity, theme),
            borderRadius: 3,
          },
        }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
        {bottleneck.percentageOfTotal}% of total execution time
      </Typography>
    </Box>
  );
};

const ParallelizableGroupRow: React.FC<{ group: ParallelizableGroup }> = ({ group }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          bgcolor: "action.hover",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon sx={{ fontSize: 20, color: "info.main" }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {group.nodes.length}x {group.nodes[0]?.nodeLabel || "Node"}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            label={`Save ${formatDuration(group.potentialSavings)}`}
            size="small"
            sx={{ height: 22, bgcolor: "success.light", color: "success.dark" }}
          />
          <IconButton size="small">
            <ExpandMoreIcon
              sx={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </IconButton>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {group.description}
          </Typography>
          {group.nodes.map((node, idx) => (
            <Box
              key={node.nodeId}
              sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {idx + 1}. {node.nodeLabel}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                {formatDuration(node.duration)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({ workflowId }) => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const { profile, isAnalyzing, analyzeWorkflow } = usePerformanceProfilerStore();

  useEffect(() => {
    if (workflowId && nodes.length > 0) {
      analyzeWorkflow(workflowId, nodes);
    }
  }, [workflowId, nodes.length, analyzeWorkflow]);

  const maxBottleneckPercentage = useMemo(() => {
    if (!profile?.bottleneckNodes.length) {
      return 100;
    }
    return Math.max(...profile.bottleneckNodes.map((b) => b.percentageOfTotal), 1);
  }, [profile]);

  const completionRate = useMemo(() => {
    if (!profile) {
      return 0;
    }
    return (profile.completedNodeCount / Math.max(profile.nodeCount, 1)) * 100;
  }, [profile]);

  const handleRefresh = () => {
    if (workflowId && nodes.length > 0) {
      analyzeWorkflow(workflowId, nodes);
    }
  };

  if (isAnalyzing && !profile) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary">Analyzing workflow performance...</Typography>
        <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <TimelineIcon sx={{ fontSize: 48, color: "action.disabled", mb: 1 }} />
        <Typography color="text.secondary" variant="body2">
          Run a workflow execution to see performance metrics
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Performance Profile
          </Typography>
        </Box>
        <Tooltip title="Re-analyze">
          <IconButton size="small" onClick={handleRefresh}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
        <MetricCard
          title="Total Time"
          value={formatDuration(profile.totalDuration)}
          icon={<ScheduleIcon />}
          color={theme.palette.primary.main}
        />
        <MetricCard
          title="Completion"
          value={`${Math.round(completionRate)}%`}
          subtitle={`${profile.completedNodeCount}/${profile.nodeCount}`}
          icon={<CheckCircleIcon />}
          color={completionRate === 100 ? theme.palette.success.main : theme.palette.warning.main}
        />
        <MetricCard
          title="Avg Node"
          value={formatDuration(profile.averageNodeDuration)}
          icon={<TimelineIcon />}
          color={theme.palette.info.main}
        />
        <MetricCard
          title="Throughput"
          value={`${profile.metrics.throughput}/s`}
          icon={<TrendingUpIcon />}
          color={theme.palette.secondary.main}
        />
      </Box>

      {profile.bottleneckNodes.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <WarningIcon sx={{ fontSize: 20, color: "warning.main" }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Bottlenecks
            </Typography>
          </Box>
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "divider" }}
          >
            {profile.bottleneckNodes.map((bottleneck, index) => (
              <BottleneckRow
                key={bottleneck.nodeId}
                bottleneck={bottleneck}
                index={index}
                maxPercentage={maxBottleneckPercentage}
              />
            ))}
          </Paper>
        </Box>
      )}

      {profile.parallelizableNodes.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <SpeedIcon sx={{ fontSize: 20, color: "info.main" }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Optimization Opportunities
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {profile.parallelizableNodes.slice(0, 3).map((group, index) => (
              <ParallelizableGroupRow key={index} group={group} />
            ))}
          </Box>
        </Box>
      )}

      {profile.bottleneckNodes.length === 0 && profile.parallelizableNodes.length === 0 && (
        <Box sx={{ textAlign: "center", py: 2 }}>
          <InfoIcon sx={{ fontSize: 32, color: "success.main", mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            No performance issues detected. Great job optimizing your workflow!
          </Typography>
        </Box>
      )}

      <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <InfoIcon sx={{ fontSize: 14 }} />
          Last analyzed: {profile ? new Date(usePerformanceProfilerStore.getState().lastAnalyzedAt || 0).toLocaleTimeString() : "Never"}
        </Typography>
      </Box>
    </Box>
  );
};

export default PerformanceProfiler;
