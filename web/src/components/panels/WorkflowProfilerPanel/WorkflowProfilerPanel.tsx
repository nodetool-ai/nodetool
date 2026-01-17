/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  LinearProgress,
  Tooltip,
  Alert,
  Skeleton,
} from "@mui/material";
import {
  AccessTime as AccessTimeIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as HourglassEmptyIcon,
  PlayCircle as PlayCircleIcon,
} from "@mui/icons-material";
import { useWorkflowProfiler } from "../../../hooks/useWorkflowProfiler";
import { useWorkflowManagerStore } from "../../../stores/WorkflowManagerStore";

const styles = {
  container: css({
    padding: "16px",
    height: "100%",
    overflow: "auto",
    boxSizing: "border-box",
  }),
  section: css({
    marginBottom: "24px",
  }),
  sectionTitle: css({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  }),
  statsGrid: css({
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    marginBottom: "16px",
  }),
  statCard: css({
    padding: "12px",
    borderRadius: "8px",
    backgroundColor: "var(--bg-secondary)",
    border: "1px solid var(--border-color)",
  }),
  statValue: css({
    fontSize: "24px",
    fontWeight: 700,
    color: "var(--text-primary)",
    lineHeight: 1.2,
  }),
  statLabel: css({
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginTop: "4px",
  }),
  nodeList: css({
    backgroundColor: "var(--bg-secondary)",
    borderRadius: "8px",
    border: "1px solid var(--border-color)",
    overflow: "hidden",
  }),
  nodeItem: css({
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-color)",
    "&:last-child": {
      borderBottom: "none",
    },
    "&:hover": {
      backgroundColor: "var(--bg-hover)",
    },
  }),
  nodeName: css({
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--text-primary)",
    marginBottom: "4px",
  }),
  nodeMeta: css({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "var(--text-secondary)",
  }),
  bottleneckCard: css({
    padding: "12px",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 152, 0, 0.1)",
    border: "1px solid rgba(255, 152, 0, 0.3)",
    marginBottom: "8px",
  }),
  bottleneckTitle: css({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--warning-main)",
    marginBottom: "8px",
  }),
  durationBar: css({
    height: "6px",
    borderRadius: "3px",
    backgroundColor: "var(--border-color)",
    overflow: "hidden",
    marginTop: "8px",
  }),
  emptyState: css({
    textAlign: "center",
    padding: "48px 24px",
    color: "var(--text-secondary)",
  }),
};

const formatDuration = (ms: number | undefined): string => {
  if (ms === undefined) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const getStatusColor = (status: string | undefined): "success" | "error" | "warning" | "info" | "default" => {
  switch (status) {
    case "completed": return "success";
    case "error": return "error";
    case "running":
    case "starting":
    case "booting": return "info";
    default: return "default";
  }
};

const getStatusIcon = (status: string | undefined) => {
  switch (status) {
    case "completed": return <CheckCircleIcon fontSize="small" />;
    case "error": return <ErrorIcon fontSize="small" />;
    case "running":
    case "starting":
    case "booting": return <PlayCircleIcon fontSize="small" />;
    default: return <HourglassEmptyIcon fontSize="small" />;
  }
};

interface StatCardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ value, label, icon, color }) => (
  <Paper css={styles.statCard} elevation={0}>
    <Box css={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <Box css={{ color: color || "var(--text-secondary)" }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
    <Typography variant="h4" css={styles.statValue}>{value}</Typography>
  </Paper>
);

const WorkflowProfilerPanel: React.FC = () => {
  const currentWorkflowId = useWorkflowManagerStore((state) => state.currentWorkflowId);
  const profile = useWorkflowProfiler(currentWorkflowId || "");

  const maxDuration = useMemo(() => {
    if (!profile) return 0;
    return Math.max(...profile.nodeProfiles.map((n) => n.duration || 0), 1);
  }, [profile]);

  if (!currentWorkflowId) {
    return (
      <Box css={styles.container}>
        <Box css={styles.emptyState}>
          <SpeedIcon sx={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
          <Typography variant="h6" gutterBottom>No Workflow Selected</Typography>
          <Typography variant="body2">
            Open a workflow to view execution profiling data.
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box css={styles.container}>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2, marginBottom: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const completionRate = profile.totalNodes > 0
    ? Math.round((profile.completedNodes / profile.totalNodes) * 100)
    : 0;

  return (
    <Box css={styles.container}>
      <Box css={styles.section}>
        <Typography variant="h6" gutterBottom>
          <SpeedIcon sx={{ verticalAlign: "middle", mr: 1 }} />
          Workflow Profiler
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {profile.workflowName}
        </Typography>
      </Box>

      <Box css={styles.statsGrid}>
        <StatCard
          value={formatDuration(profile.totalDuration)}
          label="Total Duration"
          icon={<AccessTimeIcon />}
          color="var(--primary-main)"
        />
        <StatCard
          value={`${profile.completedNodes}/${profile.totalNodes}`}
          label="Completed Nodes"
          icon={<CheckCircleIcon />}
          color="var(--success-main)"
        />
        <StatCard
          value={completionRate}
          label="Completion Rate"
          icon={<CheckCircleIcon />}
          color="var(--info-main)"
        />
        <StatCard
          value={profile.failedNodes}
          label="Failed Nodes"
          icon={<ErrorIcon />}
          color="var(--error-main)"
        />
      </Box>

      {profile.runningNodes > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {profile.runningNodes} node(s) currently running
        </Alert>
      )}

      {profile.bottlenecks.length > 0 && (
        <Box css={styles.section}>
          <Typography variant="subtitle2" css={styles.sectionTitle}>
            <WarningIcon fontSize="small" />
            Bottlenecks Detected
          </Typography>
          {profile.bottlenecks.map((bottleneck) => (
            <Box key={bottleneck.nodeId} css={styles.bottleneckCard}>
              <Box css={styles.bottleneckTitle}>
                <WarningIcon fontSize="small" />
                {bottleneck.nodeName}
              </Box>
              <Box css={styles.nodeMeta}>
                <Typography variant="body2">
                  Duration: {formatDuration(bottleneck.duration)}
                </Typography>
                <Chip
                  label="Slow"
                  size="small"
                  color="warning"
                  sx={{ height: 20, fontSize: "10px" }}
                />
              </Box>
              <Box css={styles.durationBar}>
                <LinearProgress
                  variant="determinate"
                  value={bottleneck.duration ? (bottleneck.duration / maxDuration) * 100 : 0}
                  sx={{
                    height: "100%",
                    backgroundColor: "transparent",
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: "var(--warning-main)",
                    },
                  }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box css={styles.section}>
        <Typography variant="subtitle2" css={styles.sectionTitle}>
          <AccessTimeIcon fontSize="small" />
          Node Execution Times
        </Typography>
        <Paper css={styles.nodeList} elevation={0}>
          <List dense disablePadding>
            {profile.nodeProfiles
              .sort((a, b) => (b.duration || 0) - (a.duration || 0))
              .slice(0, 20)
              .map((node) => (
                <ListItem key={node.nodeId} css={styles.nodeItem} disablePadding>
                  <ListItemText
                    primary={
                      <Box css={styles.nodeName}>
                        {node.isBottleneck && (
                          <Tooltip title="Potential bottleneck">
                            <WarningIcon
                              fontSize="small"
                              sx={{ color: "var(--warning-main)", mr: 0.5, verticalAlign: "middle" }}
                            />
                          </Tooltip>
                        )}
                        {node.nodeName}
                      </Box>
                    }
                    secondary={
                      <Box css={styles.nodeMeta}>
                        <Chip
                          icon={getStatusIcon(node.status)}
                          label={node.status || "pending"}
                          size="small"
                          color={getStatusColor(node.status)}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "10px" }}
                        />
                        <Typography variant="caption">
                          {formatDuration(node.duration)}
                        </Typography>
                        {node.duration && maxDuration > 0 && (
                          <Box css={styles.durationBar} sx={{ width: 60 }}>
                            <LinearProgress
                              variant="determinate"
                              value={(node.duration / maxDuration) * 100}
                              sx={{
                                height: "100%",
                                backgroundColor: "transparent",
                                "& .MuiLinearProgress-bar": {
                                  backgroundColor: node.isBottleneck
                                    ? "var(--warning-main)"
                                    : "var(--primary-main)",
                                },
                              }}
                            />
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
          </List>
        </Paper>
      </Box>

      {profile.parallelizableNodes.length > 0 && (
        <Box css={styles.section}>
          <Alert severity="success">
            <Typography variant="subtitle2">Parallel Execution Possible</Typography>
            <Typography variant="body2">
              {profile.parallelizableNodes.length} nodes are running in parallel.
              Consider restructuring to optimize execution time.
            </Typography>
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default WorkflowProfilerPanel;
