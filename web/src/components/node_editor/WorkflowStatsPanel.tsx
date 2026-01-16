/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Typography, Chip, LinearProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import useWorkflowStatsStore, {
  WorkflowStructureStats
} from "../../stores/WorkflowStatsStore";
import { useNodes } from "../../contexts/NodeContext";

interface WorkflowStatsPanelProps {
  workflowId: string;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      height: "100%",
      overflow: "auto",
      padding: "1em"
    },
    ".stats-header": {
      marginBottom: "1em",
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".stats-title": {
      fontSize: "1em",
      fontWeight: 600
    },
    ".stats-section": {
      marginBottom: "1.5em"
    },
    ".section-title": {
      fontSize: "0.85em",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.75em",
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".stat-card": {
      padding: "0.75em",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.action.hover,
      display: "flex",
      flexDirection: "column",
      gap: "0.25em"
    },
    ".stat-value": {
      fontSize: "1.5em",
      fontWeight: 700,
      fontFamily: "monospace"
    },
    ".stat-label": {
      fontSize: "0.7em",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase"
    },
    ".type-breakdown": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em"
    },
    ".type-row": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".type-name": {
      fontSize: "0.75em",
      minWidth: "80px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".type-count": {
      fontSize: "0.75em",
      fontWeight: 600,
      minWidth: "30px",
      textAlign: "right"
    },
    ".progress-bar": {
      flex: 1,
      height: "6px",
      borderRadius: "3px",
      backgroundColor: theme.vars.palette.action.focus
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    ".empty-icon": {
      fontSize: "3em",
      marginBottom: "0.5em",
      opacity: 0.5
    },
    ".empty-text": {
      fontSize: "0.85em"
    },
    ".metric-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "0.75em"
    },
    ".chip-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.5em",
      marginTop: "0.5em"
    },
    ".metric-chip": {
      fontSize: "0.7em"
    }
  });

const StatCard: React.FC<{
  value: string | number;
  label: string;
  color?: string;
}> = ({ value, label, color }) => {
  return (
    <div className="stat-card">
      <span className="stat-value" style={{ color: color || "inherit" }}>
        {value}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  );
};

const TypeBreakdown: React.FC<{ stats: WorkflowStructureStats }> = ({ stats }) => {
  const theme = useTheme();
  const maxCount = Math.max(...stats.nodeTypeBreakdown.map((t) => t.count), 1);

  return (
    <div className="type-breakdown">
      {stats.nodeTypeBreakdown.slice(0, 10).map((item) => (
        <div className="type-row" key={item.type}>
          <span className="type-name" title={item.type}>
            {item.type.split(".").pop() || item.type}
          </span>
          <div className="progress-bar">
            <LinearProgress
              variant="determinate"
              value={(item.count / maxCount) * 100}
              sx={{
                height: "100%",
                borderRadius: "3px",
                backgroundColor: theme.vars.palette.action.focus,
                "& .MuiLinearProgress-bar": {
                  backgroundColor:
                    item.type.includes("input")
                      ? theme.vars.palette.c_input
                      : item.type.includes("output")
                        ? theme.vars.palette.c_output
                        : theme.vars.palette.primary.main
                }
              }}
            />
          </div>
          <span className="type-count">{item.count}</span>
        </div>
      ))}
      {stats.nodeTypeBreakdown.length > 10 && (
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5 }}>
          +{stats.nodeTypeBreakdown.length - 10} more types
        </Typography>
      )}
    </div>
  );
};

const StructureStats: React.FC<{ stats: WorkflowStructureStats }> = ({ stats }) => {
  return (
    <>
      <div className="metric-grid">
        <StatCard value={stats.totalNodes} label="Nodes" />
        <StatCard value={stats.totalEdges} label="Connections" />
        <StatCard value={stats.graphDepth} label="Depth" />
        <StatCard
          value={`${Math.round((stats.connectedNodes / Math.max(stats.totalNodes, 1)) * 100)}%`}
          label="Connected"
        />
      </div>

      <div style={{ marginTop: "1em" }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: "0.75em" }}>
          Node Categories
        </Typography>
        <div className="chip-container">
          <Chip
            label={`${stats.inputNodes} Inputs`}
            size="small"
            color="info"
            variant="outlined"
            className="metric-chip"
          />
          <Chip
            label={`${stats.processingNodes} Processing`}
            size="small"
            color="primary"
            variant="outlined"
            className="metric-chip"
          />
          <Chip
            label={`${stats.outputNodes} Outputs`}
            size="small"
            color="success"
            variant="outlined"
            className="metric-chip"
          />
          {stats.isolatedNodes > 0 && (
            <Chip
              label={`${stats.isolatedNodes} Isolated`}
              size="small"
              color="warning"
              variant="outlined"
              className="metric-chip"
            />
          )}
        </div>
      </div>

      <div style={{ marginTop: "1em" }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontSize: "0.75em" }}>
          Node Types
        </Typography>
        <TypeBreakdown stats={stats} />
      </div>
    </>
  );
};

const WorkflowStatsPanel: React.FC<WorkflowStatsPanelProps> = ({ workflowId }) => {
  const theme = useTheme();
  const nodes = useNodes((state: any) => state.nodes);
  const edges = useNodes((state: any) => state.edges);

  const stats = useWorkflowStatsStore(
    useMemo(() => (state: any) => state.getStats(workflowId), [workflowId])
  );

  const updateStats = useWorkflowStatsStore((state: any) => state.updateStats);

  React.useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      updateStats(workflowId, nodes, edges);
    }
  }, [workflowId, nodes, edges, updateStats]);

  const containerStyle = useMemo(() => styles(theme), [theme]);

  if (nodes.length === 0 && edges.length === 0) {
    return (
      <Box css={containerStyle}>
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-text">
            Add nodes to see workflow statistics
          </div>
        </div>
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box css={containerStyle}>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box css={containerStyle}>
      <div className="stats-header">
        <Typography className="stats-title">Workflow Statistics</Typography>
      </div>

      <div className="stats-section">
        <Typography className="section-title">Structure</Typography>
        <StructureStats stats={stats.structure} />
      </div>

      <div className="stats-section">
        <Typography className="section-title">Performance</Typography>
        <Typography
          variant="body2"
          sx={{ color: "text.secondary", fontSize: "0.75em" }}
        >
          Run your workflow to see execution statistics
        </Typography>
      </div>
    </Box>
  );
};

export default memo(WorkflowStatsPanel, isEqual);
