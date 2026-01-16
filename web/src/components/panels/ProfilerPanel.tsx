/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import {
  Box,
  Typography,
  List,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Paper,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpeedIcon from "@mui/icons-material/Speed";
import TimerIcon from "@mui/icons-material/Timer";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import useProfiling from "../../hooks/useProfiling";
import { NodeProfile } from "../../stores/ProfilingStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "12px 16px 16px 16px",
    boxSizing: "border-box",
    gap: 12,
    overflow: "hidden",
  });

const statsGridStyles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
  });

const statCardStyles = (theme: Theme) =>
  css({
    padding: 12,
    borderRadius: 8,
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
  });

const statValueStyles = (theme: Theme) =>
  css({
    fontSize: theme.fontSizeBig,
    fontWeight: 600,
    color: theme.vars.palette.primary.main,
    display: "flex",
    alignItems: "center",
    gap: 4,
  });

const statLabelStyles = (theme: Theme) =>
  css({
    fontSize: theme.fontSizeSmall,
    color: theme.vars.palette.text.secondary,
    marginTop: 2,
  });

const listStyles = () =>
  css({
    flex: 1,
    overflow: "auto",
    minHeight: 0,
    backgroundColor: theme.vars.palette.background.paper,
    borderRadius: 8,
    border: `1px solid ${theme.vars.palette.divider}`,
  });

const listItemStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "&:last-child": {
      borderBottom: "none",
    },
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
    },
  });

const durationBarStyles = (theme: Theme) =>
  css({
    flex: 1,
    margin: "0 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  });

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    return `${(ms / 60000).toFixed(1)}m`;
  }
};

const formatPercentage = (value: number, total: number): string => {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
};

interface NodeListItemProps {
  node: NodeProfile;
  maxDuration: number;
  onClick?: () => void;
}

const NodeListItem: React.FC<NodeListItemProps> = ({
  node,
  maxDuration,
  onClick,
}) => {
  const theme = useTheme<Theme>();
  const percentage = maxDuration > 0 ? (node.duration / maxDuration) * 100 : 0;
  const isSlow = percentage > 50;

  return (
    <div css={listItemStyles(theme)} onClick={onClick} style={{ cursor: "pointer" }}>
      <Box sx={{ width: 100, flexShrink: 0 }}>
        <Typography variant="body2" noWrap title={node.title}>
          {node.title || node.nodeType.split(".").pop()}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary" }}
        >
          {node.nodeType.split(".").pop()}
        </Typography>
      </Box>

      <div css={durationBarStyles(theme)}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {formatDuration(node.duration)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {formatPercentage(node.duration, maxDuration)}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.vars.palette.action.hover,
            "& .MuiLinearProgress-bar": {
              backgroundColor: isSlow
                ? theme.vars.palette.error.main
                : theme.vars.palette.primary.main,
              borderRadius: 3,
            },
          }}
        />
      </div>

      <Chip
        label={node.status}
        size="small"
        sx={{
          fontSize: theme.fontSizeSmall,
          height: 20,
          backgroundColor:
            node.status === "completed"
              ? theme.vars.palette.success.main + "20"
              : node.status === "error"
                ? theme.vars.palette.error.main + "20"
                : theme.vars.palette.warning.main + "20",
          color:
            node.status === "completed"
              ? theme.vars.palette.success.main
              : node.status === "error"
                ? theme.vars.palette.error.main
                : theme.vars.palette.warning.main,
        }}
      />
    </div>
  );
};

const ProfilerPanel: React.FC = () => {
  const theme = useTheme<Theme>();
  const { getCurrentWorkflow } = useWorkflowManager((state) => ({
    getCurrentWorkflow: state.getCurrentWorkflow
  }));
  const {
    getProfile,
    getStatistics,
    getSlowestNodes,
    clearProfile,
  } = useProfiling();

  const currentWorkflow = getCurrentWorkflow();
  const workflowId = currentWorkflow?.id;
  const profile = workflowId ? getProfile(workflowId) : undefined;
  const statistics = workflowId ? getStatistics(workflowId) : null;
  const slowestNodes = workflowId ? getSlowestNodes(workflowId, 10) : [];

  const maxDuration = useMemo(() => {
    if (!profile) return 0;
    return Math.max(...Object.values(profile.nodeProfiles).map(n => n.duration), 1);
  }, [profile]);

  const handleClear = () => {
    if (workflowId) {
      clearProfile(workflowId);
    }
  };

  if (!workflowId) {
    return (
      <div css={containerStyles(theme)}>
        <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", mt: 4 }}>
          No workflow selected
        </Typography>
      </div>
    );
  }

  if (!profile) {
    return (
      <div css={containerStyles(theme)}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <SpeedIcon /> Performance
          </Typography>
        </Box>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
            Run a workflow to see performance metrics
          </Typography>
        </Box>
      </div>
    );
  }

  const allNodes = Object.values(profile.nodeProfiles);
  const sortedNodes = [...allNodes].sort((a, b) => b.duration - a.duration);

  return (
    <div css={containerStyles(theme)}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon /> Performance
        </Typography>
        <Tooltip title="Clear profile">
          <IconButton size="small" onClick={handleClear}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {statistics && (
        <div css={statsGridStyles(theme)}>
          <Paper css={statCardStyles(theme)} elevation={0}>
            <div css={statValueStyles(theme)}>
              <TimerIcon fontSize="small" />
              {formatDuration(statistics.totalDuration)}
            </div>
            <div css={statLabelStyles(theme)}>Total Time</div>
          </Paper>

          <Paper css={statCardStyles(theme)} elevation={0}>
            <div css={statValueStyles(theme)}>
              <TrendingUpIcon fontSize="small" />
              {statistics.nodeCount} nodes
            </div>
            <div css={statLabelStyles(theme)}>Executed</div>
          </Paper>

          <Paper css={statCardStyles(theme)} elevation={0}>
            <div css={statValueStyles(theme)}>
              <TimerIcon fontSize="small" />
              {formatDuration(statistics.averageDuration)}
            </div>
            <div css={statLabelStyles(theme)}>Avg per Node</div>
          </Paper>

          <Paper css={statCardStyles(theme)} elevation={0}>
            <div css={statValueStyles(theme)}>
              {statistics.slowestNode ? formatDuration(statistics.slowestNode.duration) : "N/A"}
            </div>
            <div css={statLabelStyles(theme)}>Slowest Node</div>
          </Paper>
        </div>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
          Node Execution Times
        </Typography>
        <Chip
          label={allNodes.length}
          size="small"
          sx={{ height: 20, fontSize: theme.fontSizeSmall }}
        />
      </Box>

      <div css={listStyles(theme)}>
        <List disablePadding>
          {sortedNodes.map((node) => (
            <NodeListItem
              key={node.nodeId}
              node={node}
              maxDuration={maxDuration}
            />
          ))}
        </List>
      </div>

      {slowestNodes.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 1 }}>
            Bottlenecks
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {slowestNodes.slice(0, 3).map((node) => (
              <Chip
                key={node.nodeId}
                label={`${node.title || node.nodeType.split(".").pop()}: ${formatDuration(node.duration)}`}
                size="small"
                sx={{
                  backgroundColor: theme.vars.palette.error.main + "15",
                  color: theme.vars.palette.error.main,
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </div>
  );
};

export default ProfilerPanel;
