/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useCallback, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  Collapse,
  Tab,
  Tabs
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Speed as SpeedIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Timeline as TimelineIcon,
  History as HistoryIcon
} from "@mui/icons-material";
import isEqual from "lodash/isEqual";
import useProfilerStore from "../../stores/ProfilerStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import ExecutionTimeline from "../performance/ExecutionTimeline";
import PerformanceHistoryChart from "../performance/PerformanceHistoryChart";

interface WorkflowProfilerPanelProps {
  workflowId: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {
    const seconds = Math.floor(ms / 1000);
    const remainderMs = ms % 1000;
    if (remainderMs === 0) {return `${seconds}s`;}
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (seconds === 0) {return `${minutes}m`;}
  return `${minutes}m ${seconds}s`;
};

const getPerformanceColor = (score: number): string => {
  if (score >= 80) {return "success.main";}
  if (score >= 60) {return "warning.main";}
  return "error.main";
};

const getPerformanceLabel = (score: number): string => {
  if (score >= 90) {return "Excellent";}
  if (score >= 80) {return "Good";}
  if (score >= 60) {return "Fair";}
  if (score >= 40) {return "Poor";}
  return "Critical";
};

const PerformanceScoreGauge: React.FC<{ score: number }> = memo(({ score }) => {
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <Box sx={{ position: "relative", display: "inline-flex", width: 120, height: 120 }}>
      <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx="60"
          cy="60"
          r="40"
          fill="none"
          stroke="var(--vscode-editorWidget-background)"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r="40"
          fill="none"
          stroke={getPerformanceColor(score)}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
        />
      </svg>
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column"
        }}
      >
        <Typography variant="h4" fontWeight="bold" color={getPerformanceColor(score)}>
          {score}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Score
        </Typography>
      </Box>
    </Box>
  );
}, isEqual);
PerformanceScoreGauge.displayName = "PerformanceScoreGauge";

const NodeTimingRow: React.FC<{ timing: NodeTiming; totalDuration: number }> = memo(
  ({ timing, totalDuration }) => {
    const [expanded, setExpanded] = useState(false);
    const percentage = totalDuration > 0 ? (timing.duration / totalDuration) * 100 : 0;

    return (
      <Box sx={{ mb: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            cursor: "pointer",
            p: 0.5,
            borderRadius: 1,
            "&:hover": { bgcolor: "action.hover" }
          }}
          onClick={() => { setExpanded(!expanded); }}
        >
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {timing.nodeName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {formatDuration(timing.duration)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={percentage}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: "action.hover",
                "& .MuiLinearProgress-bar": {
                  bgcolor: percentage > 50 ? "error.main" : percentage > 20 ? "warning.main" : "success.main",
                  borderRadius: 3
                }
              }}
            />
          </Box>
          <Chip
            label={`${Math.round(percentage)}%`}
            size="small"
            sx={{
              ml: 1,
              bgcolor: percentage > 50 ? "error.light" : percentage > 20 ? "warning.light" : "success.light",
              color: percentage > 50 ? "error.dark" : percentage > 20 ? "warning.dark" : "success.dark"
            }}
          />
        </Box>
        <Collapse in={expanded}>
          <Box sx={{ ml: 4, pl: 2, borderLeft: 2, borderColor: "divider", mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Node ID: {timing.nodeId}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Type: {timing.nodeType}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Status: {timing.status}
            </Typography>
          </Box>
        </Collapse>
      </Box>
    );
  },
  isEqual
);
NodeTimingRow.displayName = "NodeTimingRow";

const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = memo(({ workflowId }) => {
  const nodeStores = useWorkflowManager((state) => state.nodeStores);
  const analyzePerformance = useProfilerStore((state) => state.analyzePerformance);
  const getAnalysis = useProfilerStore((state) => state.getAnalysis);
  const clearAnalysis = useProfilerStore((state) => state.clearAnalysis);
  const getHistory = useProfilerStore((state) => state.getHistory);

  const [activeTab, setActiveTab] = useState(0);

  const nodes = useMemo(() => {
    const store = nodeStores[workflowId];
    if (store) {
      return store.getState().nodes;
    }
    return [];
  }, [nodeStores, workflowId]);

  const analysis = useMemo(() => {
    const existing = getAnalysis(workflowId);
    if (existing) {return existing;}
    return analyzePerformance(workflowId, nodes);
  }, [workflowId, nodes, analyzePerformance, getAnalysis]);

  const history = useMemo(() => getHistory(workflowId), [workflowId, getHistory]);

  const handleReanalyze = useCallback(() => {
    clearAnalysis(workflowId);
    analyzePerformance(workflowId, nodes);
  }, [workflowId, nodes, analyzePerformance, clearAnalysis]);

  const hasTimings = analysis.nodeTimings.some((t) => t.duration > 0);
  const timelineTimings = useMemo(() =>
    analysis.nodeTimings
      .filter((t) => t.duration > 0)
      .map((t) => ({
        ...t,
        startTime: 0,
        endTime: t.duration
      })),
    [analysis.nodeTimings]
  );

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto", bgcolor: "background.default" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Tooltip title="Re-analyze performance">
          <IconButton size="small" onClick={handleReanalyze}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {!hasTimings ? (
        <Paper sx={{ p: 3, textAlign: "center", bgcolor: "action.hover" }}>
          <TimerIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            No execution data available
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Run the workflow to see performance analysis
          </Typography>
        </Paper>
      ) : (
        <>
          <Box sx={{ display: "flex", gap: 3, mb: 3, flexWrap: "wrap", justifyContent: "center" }}>
            <Box sx={{ textAlign: "center" }}>
              <PerformanceScoreGauge score={analysis.performanceScore} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {getPerformanceLabel(analysis.performanceScore)}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 150 }}>
              <Paper sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                <TimerIcon color="action" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Time
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatDuration(analysis.totalDuration)}
                  </Typography>
                </Box>
              </Paper>
              <Paper sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                <TrendingUpIcon color="action" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Nodes
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {analysis.completedCount}/{analysis.nodeCount}
                  </Typography>
                </Box>
              </Paper>
              <Paper sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                <SpeedIcon color="action" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Avg per Node
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatDuration(analysis.averageNodeTime)}
                  </Typography>
                </Box>
              </Paper>
            </Box>
          </Box>

          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
            <Tab icon={<TimelineIcon fontSize="small" />} label="Timeline" iconPosition="start" />
            <Tab icon={<HistoryIcon fontSize="small" />} label="History" iconPosition="start" />
            <Tab icon={<WarningIcon fontSize="small" />} label="Details" iconPosition="start" />
          </Tabs>

          {activeTab === 0 && (
            <Paper sx={{ mb: 2 }}>
              <ExecutionTimeline timings={timelineTimings} totalDuration={analysis.totalDuration} />
            </Paper>
          )}

          {activeTab === 1 && (
            <Paper sx={{ mb: 2 }}>
              <PerformanceHistoryChart history={history} />
            </Paper>
          )}

          {activeTab === 2 && (
            <>
              {analysis.bottlenecks.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
                    <WarningIcon fontSize="small" />
                    Bottlenecks (Top {analysis.bottlenecks.length})
                  </Typography>
                  {analysis.bottlenecks.map((timing) => (
                    <NodeTimingRow key={timing.nodeId} timing={timing} totalDuration={analysis.totalDuration} />
                  ))}
                </Box>
              )}

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
                  <SpeedIcon fontSize="small" />
                  All Node Timings
                </Typography>
                {analysis.nodeTimings
                  .filter((t) => t.duration > 0)
                  .map((timing) => (
                    <NodeTimingRow key={timing.nodeId} timing={timing} totalDuration={analysis.totalDuration} />
                  ))}
              </Box>
            </>
          )}

          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
              <LightbulbIcon fontSize="small" />
              Recommendations
            </Typography>
            <List dense sx={{ bgcolor: "action.hover", borderRadius: 1 }}>
              {analysis.recommendations.map((rec, index) => (
                <ListItem key={index} sx={{ py: 0.5 }}>
                  {rec.includes("efficiently") || rec.includes("optimized") ? (
                    <CheckCircleIcon fontSize="small" color="success" sx={{ mr: 1 }} />
                  ) : (
                    <LightbulbIcon fontSize="small" color="warning" sx={{ mr: 1 }} />
                  )}
                  <ListItemText
                    primary={rec}
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
            Last analyzed: {new Date(analysis.timestamp).toLocaleTimeString()}
          </Typography>
        </>
      )}
    </Box>
  );
}, isEqual);

WorkflowProfilerPanel.displayName = "WorkflowProfilerPanel";

export default WorkflowProfilerPanel;
