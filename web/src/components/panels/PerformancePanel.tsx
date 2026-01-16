/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  IconButton,
  Button
} from "@mui/material";
import {
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  Lightbulb as LightbulbIcon,
  Refresh as RefreshIcon,
  Timeline as TimelineIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import usePerformanceProfileStore, {
  WorkflowProfile,
  NodeProfile,
  PerformanceInsights
} from "../../stores/PerformanceProfileStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "12px 16px",
    boxSizing: "border-box",
    gap: 12,
    overflow: "auto",
    "&::-webkit-scrollbar": {
      width: 6,
      height: 6
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent"
    },
    "&::-webkit-scrollbar-thumb": {
      background: theme.palette.divider,
      borderRadius: 3
    }
  });

const cardStyles = (theme: Theme) =>
  css({
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: 8,
    border: `1px solid ${theme.vars.palette.divider}`,
    padding: 12,
    transition: "box-shadow 0.2s ease",
    "&:hover": {
      boxShadow: `0 4px 12px ${theme.vars.palette.action.hover}`
    }
  });

const statValueStyles = (theme: Theme) =>
  css({
    fontSize: "1.5rem",
    fontWeight: 600,
    fontFamily: theme.fontFamily2,
    color: theme.vars.palette.text.primary
  });

const statLabelStyles = (theme: Theme) =>
  css({
    fontSize: "0.75rem",
    color: theme.vars.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  });

const barContainerStyles = (theme: Theme) =>
  css({
    height: 8,
    backgroundColor: theme.vars.palette.action.hover,
    borderRadius: 4,
    overflow: "hidden"
  });

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${Math.round(ms)}ms`;}
  if (ms < 60000) {return `${(ms / 1000).toFixed(2)}s`;}
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const barStyles = (percentage: number, isBottleneck: boolean, theme: Theme) =>
  css({
    height: "100%",
    width: `${Math.min(100, percentage)}%`,
    backgroundColor: isBottleneck
      ? theme.vars.palette.error.main
      : theme.vars.palette.primary.main,
    borderRadius: 4,
    transition: "width 0.3s ease"
  });

const NodeTimingBar: React.FC<{
  node: NodeProfile;
  maxDuration: number;
  theme: Theme;
}> = ({ node, maxDuration, theme }) => {
  const percentage = maxDuration > 0 ? (node.duration / maxDuration) * 100 : 0;
  const isBottleneck = percentage > 50;

  return (
    <Box css={barContainerStyles} sx={{ mt: 1 }}>
      <Box
        css={barStyles(percentage, isBottleneck, theme)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: isBottleneck ? "flex-start" : "flex-start",
          px: 1
        }}
      >
        {isBottleneck && (
          <Typography
            sx={{
              color: "white",
              fontSize: "0.65rem",
              fontWeight: 600,
              whiteSpace: "nowrap"
            }}
          >
            {formatDuration(node.duration)}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString();
};

const StatsCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}> = ({ icon, label, value, subValue, color }) => {
  const theme = useTheme();
  return (
    <Paper
      css={cardStyles(theme)}
      sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ color: color || "primary.main" }}>{icon}</Box>
        <Typography css={statLabelStyles(theme)}>{label}</Typography>
      </Box>
      <Typography css={statValueStyles(theme)}>{value}</Typography>
      {subValue && (
        <Typography
          sx={{ fontSize: "0.75rem", color: "text.secondary" }}
        >
          {subValue}
        </Typography>
      )}
    </Paper>
  );
};

const EmptyState: React.FC = () => {
  const theme = useTheme();
  return (
    <Box
      css={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 2,
        color: theme.vars.palette.text.secondary
      })}
    >
      <TimelineIcon sx={{ fontSize: 48, opacity: 0.5 }} />
      <Typography variant="body2">Run a workflow to see performance data</Typography>
    </Box>
  );
};

const PerformancePanel: React.FC = () => {
  const theme = useTheme();
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const currentProfile = usePerformanceProfileStore((state) => state.currentProfile);
  const insights = usePerformanceProfileStore((state) => state.insights);
  const getProfile = usePerformanceProfileStore((state) => state.getProfile);
  const getInsights = usePerformanceProfileStore((state) => state.getInsights);
  const clearProfile = usePerformanceProfileStore((state) => state.clearProfile);

  const workflowId = openWorkflows[0]?.id;
  const workflowName = openWorkflows[0]?.name || "Untitled";

  const profile = workflowId ? getProfile(workflowId) : undefined;
  const workflowInsights = workflowId ? getInsights(workflowId) : undefined;

  const handleRefresh = () => {
    if (workflowId) {
      clearProfile(workflowId);
    }
  };

  const maxDuration = useMemo(() => {
    if (!profile?.nodes.length) {return 0;}
    return Math.max(...profile.nodes.map((n) => n.duration));
  }, [profile]);

  if (!profile || profile.nodes.length === 0) {
    return (
      <Box css={containerStyles}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Performance
          </Typography>
        </Box>
        <EmptyState />
      </Box>
    );
  }

  return (
    <Box css={containerStyles}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Performance
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary" }}
          >
            {workflowName}
          </Typography>
        </Box>
        <Tooltip title="Clear profile">
          <IconButton size="small" onClick={handleRefresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        css={css`
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        `}
      >
        <StatsCard
          icon={<SpeedIcon />}
          label="Total Time"
          value={formatDuration(profile.totalDuration)}
          subValue={`${profile.executedNodes} nodes executed`}
          color={theme.vars.palette.primary.main}
        />
        <StatsCard
          icon={<TrendingUpIcon />}
          label="Avg per Node"
          value={formatDuration(workflowInsights?.averageNodeDuration || 0)}
          subValue={formatTime(profile.timestamp)}
          color={theme.vars.palette.success.main}
        />
      </Box>

      {workflowInsights?.slowestNode && (
        <Paper css={cardStyles(theme)}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <WarningIcon sx={{ color: "error.main", fontSize: 18 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Bottleneck Detected
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            <strong>{workflowInsights.slowestNode.nodeName}</strong> took{" "}
            {formatDuration(workflowInsights.slowestNode.duration)}
          </Typography>
          <Box css={barContainerStyles}>
            <Box
              css={barStyles(
                (workflowInsights.slowestNode.duration / maxDuration) * 100,
                true,
                theme
              )}
            />
          </Box>
        </Paper>
      )}

      <Paper css={cardStyles(theme)}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <TimelineIcon sx={{ color: "primary.main", fontSize: 18 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Node Timing Breakdown
          </Typography>
        </Box>
        <List dense sx={{ py: 0 }}>
          {profile.nodes
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 8)
            .map((node) => (
              <ListItem
                key={node.nodeId}
                sx={{
                  px: 0,
                  borderBottom: `1px solid ${theme.vars.palette.divider}`,
                  "&:last-child": { borderBottom: "none" }
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                        {node.nodeName}
                      </Typography>
                      {node.duration / maxDuration > 0.3 && (
                        <Chip
                          size="small"
                          label="Slow"
                          sx={{
                            height: 18,
                            fontSize: "0.65rem",
                            backgroundColor: theme.vars.palette.error.main,
                            color: "white"
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {node.nodeType}
                    </Typography>
                  }
                />
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {formatDuration(node.duration)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {((node.duration / maxDuration) * 100).toFixed(0)}%
                  </Typography>
                </Box>
              </ListItem>
            ))}
        </List>
      </Paper>

      {workflowInsights?.recommendations &&
        workflowInsights.recommendations.length > 0 && (
          <Paper css={cardStyles(theme)}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <LightbulbIcon sx={{ color: "warning.main", fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Recommendations
              </Typography>
            </Box>
            <List dense sx={{ py: 0 }}>
              {workflowInsights.recommendations.map((rec, index) => (
                <ListItem key={index} sx={{ px: 0, py: 0.5 }}>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {rec}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
    </Box>
  );
};

export default memo(PerformancePanel);
