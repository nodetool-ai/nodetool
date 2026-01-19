/**
 * Workflow Performance Profiler Panel
 *
 * Research feature for analyzing workflow execution performance.
 * Displays real-time performance metrics, bottlenecks, and optimization suggestions.
 *
 * Features:
 * - Real-time execution timeline
 * - Performance score and metrics
 * - Bottleneck identification
 * - Optimization suggestions
 *
 * @example
 * ```typescript
 * <PerformanceProfilerPanel
 *   workflowId={workflow.id}
 *   nodeTypes={nodeTypes}
 *   isOpen={showProfiler}
 *   onClose={() => setShowProfiler(false)}
 * />
 * ```
 */
import React, { useMemo, useState, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Tooltip,
  Divider,
  Alert
} from "@mui/material";
import {
  Close as CloseIcon,
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Lightbulb as LightbulbIcon,
  Refresh as RefreshIcon
} from "@mui/icons-material";
import usePerformanceProfilerStore, {
  PerformanceBottleneck,
  WorkflowPerformanceReport
} from "../../stores/PerformanceProfilerStore";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  nodeTypes: Record<string, { label: string; memoryMB?: number; compute?: number }>;
  isOpen: boolean;
  onClose: () => void;
}

interface PerformanceMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: "primary" | "success" | "warning" | "error";
}

const PerformanceMetricCard: React.FC<PerformanceMetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color
}) => {
  const colorMap: Record<string, string> = {
    primary: "var(--mt-color-primary, #1976d2)",
    success: "var(--mt-color-success, #2e7d32)",
    warning: "var(--mt-color-warning, #ed6c02)",
    error: "var(--mt-color-error, #d32f2f)"
  };

  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderLeft: 4,
        borderColor: colorMap[color],
        backgroundColor: "var(--mt-color-background-paper, #fff)"
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ color: colorMap[color] }}>{icon}</Box>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
};

const BottleneckItem: React.FC<{ bottleneck: PerformanceBottleneck }> = ({
  bottleneck
}) => {
  const [expanded, setExpanded] = useState(false);
  const severityColors: Record<string, "error" | "warning" | "info"> = {
    high: "error",
    medium: "warning",
    low: "info"
  };

  return (
    <ListItem
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        mb: 1
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
        <ListItemIcon sx={{ minWidth: 36 }}>
          <WarningIcon color={severityColors[bottleneck.severity]} />
        </ListItemIcon>
        <ListItemText
          primary={bottleneck.nodeName}
          secondary={bottleneck.description}
          primaryTypographyProps={{ fontWeight: 500 }}
        />
        <Chip
          label={bottleneck.severity.toUpperCase()}
          size="small"
          color={severityColors[bottleneck.severity]}
          sx={{ mr: 1 }}
        />
        <IconButton size="small">
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pl: 5, pt: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>Type:</strong> {bottleneck.type}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>Suggestion:</strong> {bottleneck.suggestion}
          </Typography>
        </Box>
      </Collapse>
    </ListItem>
  );
};

const ScoreGauge: React.FC<{ score: number; size?: number }> = ({
  score,
  size = 120
}) => {
  const getScoreColor = (s: number): string => {
    if (s >= 80) {return "var(--mt-color-success, #2e7d32)";}
    if (s >= 60) {return "var(--mt-color-warning, #ed6c02)";}
    return "var(--mt-color-error, #d32f2f)";
  };

  const getScoreLabel = (s: number): string => {
    if (s >= 80) {return "Excellent";}
    if (s >= 60) {return "Good";}
    if (s >= 40) {return "Fair";}
    return "Needs Optimization";
  };

  const circumference = 2 * Math.PI * (size / 2 - 10);
  const offset = circumference - (score / 100) * circumference;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 10}
            fill="none"
            stroke="var(--mt-color-divider, #e0e0e0)"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 10}
            fill="none"
            stroke={getScoreColor(score)}
            strokeWidth={8}
            strokeDasharray={circumference.toString()}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center"
          }}
        >
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {score}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {getScoreLabel(score)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  nodeTypes,
  isOpen,
  onClose
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const nodeMetrics = usePerformanceProfilerStore((state) =>
    state.getAllMetrics(workflowId)
  );

  const generateReport = usePerformanceProfilerStore((state) =>
    state.generateReport.bind(state, workflowId)
  );

  const clearMetrics = usePerformanceProfilerStore((state) =>
    state.clearMetrics.bind(state, workflowId)
  );

  const report = useMemo(
    () => generateReport(nodeTypes),
    [workflowId, nodeTypes, nodeMetrics, generateReport]
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleClose = useCallback(() => {
    clearMetrics();
    onClose();
  }, [workflowId, clearMetrics, onClose]);

  if (!isOpen) {return null;}

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {return `${ms}ms`;}
    if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  };

  return (
    <Paper
      sx={{
        position: "fixed",
        right: 16,
        top: 80,
        width: 380,
        maxHeight: "calc(100vh - 100px)",
        overflow: "auto",
        zIndex: 1200,
        boxShadow: 3,
        borderRadius: 2
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          position: "sticky",
          top: 0,
          backgroundColor: "var(--mt-color-background-paper, #fff)",
          zIndex: 1
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {refreshing && <LinearProgress />}

      <Box sx={{ p: 2 }}>
        {report.nodeCount === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Run a workflow to see performance metrics.
          </Alert>
        ) : (
          <>
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                mb: 3
              }}
            >
              <ScoreGauge score={report.score} />
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                mb: 3
              }}
            >
              <PerformanceMetricCard
                title="Total Duration"
                value={formatDuration(report.totalDuration)}
                subtitle={`${report.completedCount}/${report.nodeCount} nodes completed`}
                icon={<TrendingUpIcon />}
                color="primary"
              />
              <PerformanceMetricCard
                title="Nodes Executed"
                value={`${report.completedCount}/${report.nodeCount}`}
                subtitle={`${report.errorCount} errors`}
                icon={<CheckIcon />}
                color={report.errorCount > 0 ? "error" : "success"}
              />
              <PerformanceMetricCard
                title="Bottlenecks"
                value={report.bottlenecks.length}
                subtitle="identified issues"
                icon={<WarningIcon />}
                color={
                  report.bottlenecks.filter((b) => b.severity === "high").length > 0
                    ? "error"
                    : "warning"
                }
              />
              <PerformanceMetricCard
                title="Optimization"
                value={report.parallelizationOpportunities.length}
                subtitle="opportunities"
                icon={<LightbulbIcon />}
                color="primary"
              />
            </Box>

            {report.bottlenecks.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
                >
                  <TrendingUpIcon fontSize="small" />
                  Bottlenecks
                </Typography>
                <List dense>
                  {report.bottlenecks.map((bottleneck) => (
                    <BottleneckItem key={bottleneck.nodeId} bottleneck={bottleneck} />
                  ))}
                </List>
              </Box>
            )}

            {report.parallelizationOpportunities.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, mb: 1, display: "flex", alignItems: "center", gap: 1 }}
                >
                  <LightbulbIcon fontSize="small" />
                  Optimization Opportunities
                </Typography>
                <List dense>
                  {report.parallelizationOpportunities.map((opp) => (
                    <ListItem key={opp.nodeId}>
                      <ListItemIcon>
                        <CheckIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText primary={opp.nodeName} secondary={opp.suggestion} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                Execution Timeline
              </Typography>
              <Box sx={{ position: "relative", height: 60, mb: 1 }}>
                {report.metrics
                  .filter((m) => m.status === "completed" || m.status === "running")
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((metric, index, arr) => {
                    const totalTime =
                      arr.length > 0
                        ? arr[arr.length - 1].startTime +
                          metric.duration -
                          arr[0].startTime
                        : 1;
                    const startPercent = ((metric.startTime - arr[0].startTime) / totalTime) * 100;
                    const widthPercent = (metric.duration / totalTime) * 100;

                    return (
                      <Tooltip
                        key={metric.nodeId}
                        title={`${metric.nodeName}: ${formatDuration(metric.duration)}`}
                      >
                        <Box
                          sx={{
                            position: "absolute",
                            left: `${startPercent}%`,
                            width: `${Math.max(widthPercent, 2)}%`,
                            height: 20,
                            top: index * 24 + 10,
                            backgroundColor:
                              metric.status === "error"
                                ? "var(--mt-color-error, #d32f2f)"
                                : "var(--mt-color-primary, #1976d2)",
                            borderRadius: 0.5,
                            opacity: 0.8,
                            transition: "all 0.3s ease"
                          }}
                        />
                      </Tooltip>
                    );
                  })}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {report.metrics.slice(0, 5).map((metric) => (
                  <Chip
                    key={metric.nodeId}
                    label={metric.nodeName}
                    size="small"
                    icon={
                      metric.status === "completed" ? (
                        <CheckIcon fontSize="small" />
                      ) : metric.status === "error" ? (
                        <ErrorIcon fontSize="small" />
                      ) : undefined
                    }
                    color={metric.status === "completed" ? "success" : metric.status === "error" ? "error" : undefined}
                    sx={{ fontSize: "0.7rem" }}
                  />
                ))}
                {report.metrics.length > 5 && (
                  <Chip label={`+${report.metrics.length - 5} more`} size="small" variant="outlined" />
                )}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Paper>
  );
};

export default PerformanceProfilerPanel;
