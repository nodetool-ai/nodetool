/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  Chip,
  IconButton
} from "@mui/material";
import {
  Close as CloseIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { css } from "@emotion/react";
import useProfilerStore from "../../stores/ProfilerStore";
import {
  analyzePerformance,
  formatDuration,
  formatPercentage,
  getPerformanceGrade,
  type PerformanceReport
} from "../../utils/performanceAnalysis";

interface WorkflowProfilerProps {
  workflowId: string;
  onClose?: () => void;
  onNodeClick?: (nodeId: string) => void;
}

const styles = (theme: Theme) =>
  css({
    "&.workflow-profiler": {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "400px",
      maxHeight: "70vh",
      zIndex: 20000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateY(20px)" },
        "100%": { opacity: 1, transform: "translateY(0)" }
      }
    },
    "& .profiler-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    "& .profiler-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .score-section": {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      marginBottom: "16px"
    },
    "& .score-circle": {
      width: "64px",
      height: "64px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "24px",
      fontWeight: 700
    },
    "& .summary-section": {
      marginBottom: "16px"
    },
    "& .summary-text": {
      fontSize: "14px",
      color: theme.vars.palette.text.secondary
    },
    "& .metrics-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "8px",
      marginBottom: "16px"
    },
    "& .metric-card": {
      padding: "10px 12px",
      backgroundColor: theme.vars.palette.background.default,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .metric-label": {
      fontSize: "11px",
      color: theme.vars.palette.text.disabled,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "4px"
    },
    "& .metric-value": {
      fontSize: "16px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .nodes-section": {
      marginTop: "16px"
    },
    "& .node-item": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      transition: "background-color 0.15s",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .node-name": {
      flex: 1,
      fontSize: "13px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .node-duration": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      fontFamily: "monospace"
    },
    "& .insight-item": {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      padding: "8px 10px",
      borderRadius: "6px",
      marginBottom: "6px",
      "&.bottleneck": {
        backgroundColor: `${theme.vars.palette.warning.main}15`,
        borderLeft: `3px solid ${theme.vars.palette.warning.main}`
      },
      "&.warning": {
        backgroundColor: `${theme.vars.palette.error.main}15`,
        borderLeft: `3px solid ${theme.vars.palette.error.main}`
      },
      "&.info": {
        backgroundColor: `${theme.vars.palette.info.main}15`,
        borderLeft: `3px solid ${theme.vars.palette.info.main}`
      },
      "&.success": {
        backgroundColor: `${theme.vars.palette.success.main}15`,
        borderLeft: `3px solid ${theme.vars.palette.success.main}`
      }
    },
    "& .insight-text": {
      flex: 1,
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    },
    "& .progress-bar": {
      height: "6px",
      borderRadius: "3px",
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .profiler-actions": {
      display: "flex",
      gap: "8px",
      padding: "8px 16px",
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    }
  });

const NodeBarChart: React.FC<{ nodes: NodePerformanceMetrics[] }> = memo(({ nodes }) => {
  const maxDuration = Math.max(...nodes.map(n => n.lastDuration || n.averageDuration), 1);

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) =>
      (b.lastDuration || b.averageDuration) - (a.lastDuration || a.averageDuration)
    ).slice(0, 8);
  }, [nodes]);

  if (nodes.length === 0) { return null; }

  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
        Execution Time Distribution (Top 8)
      </Typography>
      {sortedNodes.map((node) => {
        const duration = node.lastDuration || node.averageDuration;
        const percentage = (duration / maxDuration) * 100;
        return (
          <Box key={node.nodeId} sx={{ mb: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
              <Typography
                variant="caption"
                sx={{
                  width: "80px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "11px"
                }}
              >
                {node.nodeName}
              </Typography>
              <Box
                sx={{
                  flex: 1,
                  height: "8px",
                  borderRadius: "4px",
                  backgroundColor: "action.hover",
                  overflow: "hidden"
                }}
              >
                <Box
                  sx={{
                    width: `${percentage}%`,
                    height: "100%",
                    backgroundColor:
                      percentage > 70 ? "warning.main" :
                      percentage > 40 ? "info.main" : "success.main",
                    borderRadius: "4px",
                    transition: "width 0.3s ease"
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontSize: "10px", color: "text.secondary", minWidth: "45px", textAlign: "right" }}>
                {formatDuration(duration)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
});

NodeBarChart.displayName = "NodeBarChart";

const InsightChip: React.FC<{ type: string }> = ({ type }) => {
  const config = {
    bottleneck: { icon: <TrendingUpIcon fontSize="small" />, color: "warning", label: "Bottleneck" },
    warning: { icon: <WarningIcon fontSize="small" />, color: "error", label: "Warning" },
    info: { icon: <InfoIcon fontSize="small" />, color: "info", label: "Info" },
    success: { icon: <CheckCircleIcon fontSize="small" />, color: "success", label: "Success" }
  };
  const { icon, color, label } = config[type as keyof typeof config] || config.info;
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      color={color as "success" | "warning" | "error" | "info"}
      sx={{ height: "20px", fontSize: "10px" }}
    />
  );
};

const WorkflowProfiler: React.FC<WorkflowProfilerProps> = memo(({
  workflowId,
  onClose,
  onNodeClick
}) => {
  const theme = useTheme();
  const profile = useProfilerStore((state) => state.getProfile(workflowId));
  const clearProfile = useProfilerStore((state) => state.clearProfile);

  const report: PerformanceReport | null = useMemo(() => {
    if (!profile) { return null; }
    return analyzePerformance(profile);
  }, [profile]);

  const { grade, color } = useMemo(() => {
    if (!report) { return { grade: "-", color: "text.secondary" }; }
    const result = getPerformanceGrade(report.score);
    return { grade: result.grade, color: result.color };
  }, [report]);

  const handleClear = () => {
    clearProfile(workflowId);
    onClose?.();
  };

  if (!profile) {
    return null;
  }

  const nodes = Object.values(profile.nodes);
  const sortedNodes = [...nodes].sort((a, b) =>
    (b.lastDuration || b.averageDuration) - (a.lastDuration || a.averageDuration)
  );

  return (
    <Box className="workflow-profiler" css={styles(theme)}>
      <Box className="profiler-header">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Performance Profile
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClear} sx={{ color: "text.secondary" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box className="profiler-content">
        <Box className="score-section">
          <Box
            className="score-circle"
            sx={{
              backgroundColor: `${color}15`,
              color: color,
              border: `2px solid ${color}`
            }}
          >
            {grade}
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {report?.score || 0}%
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Efficiency Score
            </Typography>
          </Box>
        </Box>

        <Box className="summary-section">
          <Typography className="summary-text">
            {report?.summary || "Analyzing workflow performance..."}
          </Typography>
        </Box>

        <Box className="metrics-grid">
          <Box className="metric-card">
            <Typography className="metric-label">Total Time</Typography>
            <Typography className="metric-value">
              {formatDuration(profile.totalDuration)}
            </Typography>
          </Box>
          <Box className="metric-card">
            <Typography className="metric-label">Nodes</Typography>
            <Typography className="metric-value">
              {profile.completedNodes}/{profile.nodeCount}
            </Typography>
          </Box>
          <Box className="metric-card">
            <Typography className="metric-label">Bottlenecks</Typography>
            <Typography className="metric-value">
              {profile.bottlenecks.length}
            </Typography>
          </Box>
          <Box className="metric-card">
            <Typography className="metric-label">Memory Est.</Typography>
            <Typography className="metric-value" sx={{ fontSize: "14px" }}>
              {report?.memoryEstimate || "-"}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Completion Progress
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", ml: "auto" }}>
              {formatPercentage(profile.completedNodes, profile.nodeCount)}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(profile.completedNodes / profile.nodeCount) * 100}
            sx={{
              height: "6px",
              borderRadius: "3px",
              backgroundColor: "action.hover",
              "& .MuiLinearProgress-bar": {
                backgroundColor:
                  profile.failedNodes > 0 ? "warning.main" : "success.main"
              }
            }}
          />
        </Box>

        <NodeBarChart nodes={nodes} />

        {report && report.insights.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Insights
            </Typography>
            {report.insights.slice(0, 4).map((insight, index) => (
              <Box
                key={index}
                className={`insight-item ${insight.type}`}
                onClick={() => insight.nodeId && onNodeClick?.(insight.nodeId)}
                sx={{ cursor: insight.nodeId ? "pointer" : "default" }}
              >
                <InsightChip type={insight.type} />
                <Typography className="insight-text">
                  {insight.message}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {sortedNodes.length > 0 && (
          <Box className="nodes-section">
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Node Performance
            </Typography>
            {sortedNodes.slice(0, 10).map((node) => (
              <Box
                key={node.nodeId}
                className="node-item"
                onClick={() => onNodeClick?.(node.nodeId)}
              >
                <Box
                  sx={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor:
                      node.status === "completed" ? "success.main" :
                      node.status === "failed" ? "error.main" :
                      node.status === "running" ? "info.main" : "text.disabled"
                  }}
                />
                <Typography className="node-name">{node.nodeName}</Typography>
                <Chip
                  size="small"
                  label={node.nodeType.split(".").pop()}
                  sx={{ height: "18px", fontSize: "9px" }}
                />
                <Typography className="node-duration">
                  {formatDuration(node.averageDuration)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
});

WorkflowProfiler.displayName = "WorkflowProfiler";

export default WorkflowProfiler;
