/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip
} from "@mui/material";
import { memo } from "react";
import { useBottomPanelStore, ResizePanelState } from "../../stores/BottomPanelStore";
import { useWorkflowAnalyticsStore, NodeAnalytics } from "../../stores/WorkflowAnalyticsStore";
import { useNodes } from "../../contexts/NodeContext";
import { formatDuration } from "../../utils/formatDateAndTime";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import SpeedIcon from "@mui/icons-material/Speed";
import TimerIcon from "@mui/icons-material/Timer";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    padding: theme.spacing(1.5),
    gap: theme.spacing(1.5),
    "& .summary-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: theme.spacing(1)
    },
    "& .metric-card": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(1.5),
      backgroundColor: theme.vars.palette.background.default,
      borderRadius: theme.shape.borderRadius,
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .metric-value": {
      fontSize: "1.25rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .metric-label": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },
    "& .section-title": {
      fontSize: "0.875rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5)
    },
    "& .bottleneck-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(1),
      backgroundColor: `${theme.vars.palette.warning.main}15`,
      borderRadius: theme.shape.borderRadius,
      border: `1px solid ${theme.vars.palette.warning.main}30`
    },
    "& .node-table": {
      flex: 1,
      overflow: "auto",
      minHeight: 0
    }
  });

const formatDurationShort = (ms: number | undefined): string => {
  if (ms === undefined) { return "-"; }
  return formatDuration(ms);
};

const getStatusColor = (status: string | undefined, theme: Theme): string => {
  if (!status) { return theme.vars.palette.text.disabled; }
  switch (status) {
    case "completed":
      return theme.vars.palette.success.main;
    case "failed":
      return theme.vars.palette.error.main;
    case "running":
      return theme.vars.palette.info.main;
    default:
      return theme.vars.palette.text.secondary;
  }
};

const NodeRow: React.FC<{ node: NodeAnalytics; _totalDuration: number }> = memo(({ node }) => {
  const theme = useTheme();
  const statusColor = getStatusColor(node.status, theme);

  return (
    <TableRow>
      <TableCell sx={{ py: 0.75, px: 1 }}>
        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }} title={node.nodeLabel}>
          {node.nodeLabel}
        </Typography>
      </TableCell>
      <TableCell sx={{ py: 0.75, px: 1 }}>
        <Chip
          label={node.nodeType.split(".").pop()}
          size="small"
          sx={{
            fontSize: "0.7rem",
            height: 20,
            backgroundColor: theme.vars.palette.action.hover
          }}
        />
      </TableCell>
      <TableCell sx={{ py: 0.75, px: 1, textAlign: "right" }}>
        <Typography
          variant="body2"
          sx={{
            color: node.isBottleneck ? theme.vars.palette.warning.main : theme.vars.palette.text.primary,
            fontWeight: node.isBottleneck ? 600 : 400
          }}
        >
          {formatDurationShort(node.duration)}
        </Typography>
      </TableCell>
      <TableCell sx={{ py: 0.75, px: 1, textAlign: "right" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
          <Typography variant="body2" sx={{ color: theme.vars.palette.text.secondary }}>
            {node.percentage.toFixed(1)}%
          </Typography>
          {node.isBottleneck && (
            <Tooltip title="Bottleneck: This node takes significant time">
              <WarningAmberIcon sx={{ fontSize: 16, color: theme.vars.palette.warning.main }} />
            </Tooltip>
          )}
        </Box>
      </TableCell>
      <TableCell sx={{ py: 0.75, px: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: statusColor
            }}
          />
          <Typography variant="body2" sx={{ color: statusColor, textTransform: "capitalize" }}>
            {node.status || "pending"}
          </Typography>
        </Box>
      </TableCell>
    </TableRow>
  );
});

NodeRow.displayName = "NodeRow";

const WorkflowAnalyticsPanel: React.FC = () => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const currentWorkflowId = useBottomPanelStore((state: ResizePanelState) => state.panel.activeView === "analytics" ? "current" : "");
  const getAnalytics = useWorkflowAnalyticsStore((state) => state.getAnalytics);

  const analytics = getAnalytics(currentWorkflowId, nodes);

  return (
    <Box css={styles(theme)}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Workflow Analytics
          </Typography>
        </Box>
      </Box>

      <Box className="summary-grid">
        <Paper className="metric-card" elevation={0}>
          <Box className="metric-value">
            {analytics.executedNodes}/{analytics.totalNodes}
          </Box>
          <Box className="metric-label">
            <TimerIcon sx={{ fontSize: 14 }} />
            Nodes Executed
          </Box>
        </Paper>
        <Paper className="metric-card" elevation={0}>
          <Box className="metric-value">
            {formatDurationShort(analytics.totalDuration)}
          </Box>
          <Box className="metric-label">
            <RefreshIcon sx={{ fontSize: 14 }} />
            Total Duration
          </Box>
        </Paper>
        <Paper className="metric-card" elevation={0}>
          <Box className="metric-value">
            {analytics.slowestNode ? formatDurationShort(analytics.slowestNode.duration) : "-"}
          </Box>
          <Box className="metric-label">
            <WarningAmberIcon sx={{ fontSize: 14 }} />
            Slowest Node
          </Box>
        </Paper>
        <Paper className="metric-card" elevation={0}>
          <Box className="metric-value">
            {analytics.bottlenecks.length}
          </Box>
          <Box className="metric-label">
            <SpeedIcon sx={{ fontSize: 14 }} />
            Bottlenecks
          </Box>
        </Paper>
      </Box>

      {analytics.bottlenecks.length > 0 && (
        <Box>
          <Typography className="section-title">
            <WarningAmberIcon sx={{ fontSize: 16 }} />
            Performance Bottlenecks
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {analytics.bottlenecks.map((node) => (
              <Box key={node.nodeId} className="bottleneck-item">
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {node.nodeLabel}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.vars.palette.text.secondary }}>
                    {node.nodeType.split(".").pop()}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatDurationShort(node.duration)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: theme.vars.palette.warning.main }}>
                    {node.percentage.toFixed(1)}% of total
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box className="node-table">
        <Typography className="section-title">
          <TimerIcon sx={{ fontSize: 16 }} />
          Node Breakdown
        </Typography>
        <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 300 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 0.5, px: 1, backgroundColor: theme.vars.palette.background.default }}>
                  Node
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1, backgroundColor: theme.vars.palette.background.default }}>
                  Type
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1, backgroundColor: theme.vars.palette.background.default, textAlign: "right" }}>
                  Duration
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1, backgroundColor: theme.vars.palette.background.default, textAlign: "right" }}>
                  Share
                </TableCell>
                <TableCell sx={{ py: 0.5, px: 1, backgroundColor: theme.vars.palette.background.default }}>
                  Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analytics.nodes
                .filter((n) => n.duration !== undefined)
                .sort((a, b) => (b.duration || 0) - (a.duration || 0))
                .map((node) => (
                  <NodeRow key={node.nodeId} node={node} _totalDuration={analytics.totalDuration || 0} />
                ))}
              {analytics.nodes.filter((n) => n.duration === undefined).length > 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 1, textAlign: "center", color: theme.vars.palette.text.secondary }}>
                    <Typography variant="caption">
                      {analytics.nodes.filter((n) => n.duration === undefined).length} nodes not yet executed
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default memo(WorkflowAnalyticsPanel);
