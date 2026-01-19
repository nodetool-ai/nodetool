/**
 * Workflow Performance Profiler Panel
 *
 * Displays performance metrics and analysis for workflow execution,
 * including timing statistics, bottleneck identification, and optimization suggestions.
 */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  CircularProgress,
  LinearProgress,
  Tooltip,
  IconButton,
  Paper,
  alpha
} from "@mui/material";
import {
  Speed as SpeedIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Timer as TimerIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import useWorkflowProfilerStore, {
  type WorkflowProfile,
  type PerformanceSuggestion
} from "../../stores/WorkflowProfilerStore";
import { useNodes } from "../../contexts/NodeContext";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  visible?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const remainingMs = Math.round(ms % 1000);
    return `${seconds}s ${remainingMs}ms`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const remainingSeconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${remainingSeconds}s`;
  }
};

const getSeverityColor = (impact: PerformanceSuggestion["impact"]): "error" | "warning" | "info" | "success" => {
  switch (impact) {
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "info";
  }
};

const getSuggestionIcon = (type: PerformanceSuggestion["type"]) => {
  switch (type) {
    case "warning":
      return <WarningIcon sx={{ color: "warning.main" }} />;
    case "info":
      return <InfoIcon sx={{ color: "info.main" }} />;
    case "success":
      return <CheckCircleIcon sx={{ color: "success.main" }} />;
    default:
      return <InfoIcon />;
  }
};

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  color?: string;
}> = ({ title, value, icon, subtitle, color }) => {
  const theme = useTheme();

  return (
    <Paper
      sx={{
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: alpha(color || theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(color || theme.palette.primary.main, 0.2)}`
      }}
    >
      <Box sx={{ color: color || theme.palette.primary.main, mb: 0.5 }}>
        {icon}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
};

const BottleneckBar: React.FC<{ profile: WorkflowProfile }> = ({ profile }) => {
  const theme = useTheme();

  if (profile.bottlenecks.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        No performance bottlenecks detected.
      </Typography>
    );
  }

  const maxDuration = profile.bottlenecks[0]?.duration || 1;

  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Performance Bottlenecks
      </Typography>
      {profile.bottlenecks.map((bottleneck, index) => (
        <Box key={bottleneck.nodeId} sx={{ mb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
            <Typography variant="caption" noWrap sx={{ maxWidth: "70%" }}>
              {bottleneck.nodeLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDuration(bottleneck.duration)}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(bottleneck.duration / maxDuration) * 100}
            sx={{
              height: 6,
              borderRadius: 3,
              backgroundColor: alpha(theme.palette.error.main, 0.2),
              "& .MuiLinearProgress-bar": {
                backgroundColor:
                  index === 0
                    ? theme.palette.error.main
                    : index === 1
                      ? theme.palette.warning.main
                      : theme.palette.info.main,
                borderRadius: 3
              }
            }}
          />
        </Box>
      ))}
    </Box>
  );
};

const SuggestionItem: React.FC<{ suggestion: PerformanceSuggestion }> = ({ suggestion }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();

  return (
    <ListItem
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        px: 0,
        py: 0.5
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          cursor: suggestion.nodeIds?.length ? "pointer" : "default"
        }}
        onClick={() => suggestion.nodeIds?.length && setExpanded(!expanded)}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>{getSuggestionIcon(suggestion.type)}</ListItemIcon>
        <ListItemText
          primary={suggestion.message}
          secondary={
            suggestion.nodeIds?.length ? (
              <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Affected nodes: {suggestion.nodeIds.length}
                </Typography>
                {expanded ? (
                  <ExpandLessIcon sx={{ fontSize: 16 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 16 }} />
                )}
              </Box>
            ) : undefined
          }
          primaryTypographyProps={{ variant: "body2" }}
          secondaryTypographyProps={{ component: "div" }}
        />
        <Chip
          label={suggestion.impact.toUpperCase()}
          size="small"
          color={getSeverityColor(suggestion.impact)}
          sx={{ height: 20, fontSize: "0.65rem" }}
        />
      </Box>
      {expanded && suggestion.nodeIds && (
        <Box
          sx={{
            ml: 4,
            mt: 1,
            p: 1,
            backgroundColor: alpha(theme.palette.text.primary, 0.03),
            borderRadius: 1
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Node IDs:
          </Typography>
          {suggestion.nodeIds.map((id) => (
            <Typography key={id} variant="caption" sx={{ fontFamily: "monospace", display: "block" }}>
              {id}
            </Typography>
          ))}
        </Box>
      )}
    </ListItem>
  );
};

const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  visible = true
}) => {
  const theme = useTheme();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const profile = useWorkflowProfilerStore((state) => state.getProfile(workflowId));
  const suggestions = useWorkflowProfilerStore((state) => state.getSuggestions(workflowId));
  const analyzeWorkflow = useWorkflowProfilerStore((state) => state.analyzeWorkflow);
  const clearProfile = useWorkflowProfilerStore((state) => state.clearProfile);
  const setNodeLabel = useWorkflowProfilerStore((state) => state.setNodeLabel);

  const nodes = useNodes((state) => state.nodes);
  const workflow = useNodes((state) => state.workflow);

  useEffect(() => {
    for (const node of nodes) {
      const title = node.data?.title as string;
      if (title) {
        setNodeLabel(workflowId, node.id, title);
      }
    }
  }, [workflowId, nodes, setNodeLabel]);

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);
    analyzeWorkflow(
      workflowId,
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data as Record<string, unknown>
      }))
    );
    setTimeout(() => setIsAnalyzing(false), 500);
  }, [workflowId, nodes, analyzeWorkflow]);

  const handleClear = useCallback(() => {
    clearProfile(workflowId);
  }, [workflowId, clearProfile]);

  const stats = useMemo(() => {
    if (!profile) {
      return null;
    }

    return {
      totalTime: formatDuration(profile.totalDuration),
      nodeCount: `${profile.completedNodes}/${profile.nodeCount}`,
      avgTime: formatDuration(profile.averageNodeDuration),
      bottleneckCount: profile.bottlenecks.length
    };
  }, [profile]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        p: 2,
        height: "100%",
        overflow: "auto",
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Analyze Performance">
            <span>
              <IconButton
                onClick={handleAnalyze}
                disabled={isAnalyzing || !workflow}
                size="small"
              >
                {isAnalyzing ? (
                  <CircularProgress size={20} />
                ) : (
                  <RefreshIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          {profile && (
            <Tooltip title="Clear Analysis">
              <IconButton onClick={handleClear} size="small">
                <TimerIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {!workflow ? (
        <Typography color="text.secondary" variant="body2">
          No workflow loaded.
        </Typography>
      ) : !profile ? (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Run a workflow execution to see performance metrics.
          </Typography>
          <Button
            variant="outlined"
            startIcon={isAnalyzing ? <CircularProgress size={16} /> : <SpeedIcon />}
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze Performance"}
          </Button>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 1,
              mb: 2
            }}
          >
            <StatCard
              title="Total Time"
              value={stats!.totalTime}
              icon={<TimerIcon fontSize="small" />}
              color={theme.palette.primary.main}
            />
            <StatCard
              title="Avg per Node"
              value={stats!.avgTime}
              icon={<TrendingUpIcon fontSize="small" />}
              color={theme.palette.info.main}
            />
            <StatCard
              title="Nodes Run"
              value={stats!.nodeCount}
              icon={<SpeedIcon fontSize="small" />}
              color={theme.palette.success.main}
            />
            <StatCard
              title="Bottlenecks"
              value={stats!.bottleneckCount.toString()}
              icon={<TrendingDownIcon fontSize="small" />}
              color={theme.palette.warning.main}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <BottleneckBar profile={profile} />

          <Divider sx={{ my: 2 }} />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Optimization Suggestions
            </Typography>
            {suggestions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No suggestions available.
              </Typography>
            ) : (
              <List dense disablePadding>
                {suggestions.map((suggestion, index) => (
                  <SuggestionItem key={index} suggestion={suggestion} />
                ))}
              </List>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

export default memo(WorkflowProfilerPanel);
