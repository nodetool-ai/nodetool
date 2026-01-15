/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import { useWorkflowStatisticsStore } from "../../stores/WorkflowStatisticsStore";
import { useNodes } from "../../contexts/NodeContext";
import { useEdges } from "@xyflow/react";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    "&.workflow-stats-panel": {
      position: "fixed",
      top: "80px",
      right: "50px",
      width: "300px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
      "& @keyframes slideIn": {
        "0%": { opacity: 0, transform: "translateX(20px)" },
        "100%": { opacity: 1, transform: "translateX(0)" }
      }
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .panel-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .stat-section": {
      marginBottom: "16px"
    },
    "& .stat-section-title": {
      fontSize: "11px",
      fontWeight: 600,
      color: theme.vars.palette.text.disabled,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "8px",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    "& .stat-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: `1px solid ${theme.vars.palette.divider}33`
    },
    "& .stat-row:last-child": {
      borderBottom: "none"
    },
    "& .stat-label": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "13px",
      color: theme.vars.palette.text.secondary
    },
    "& .stat-value": {
      fontSize: "13px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      fontFamily: "monospace"
    },
    "& .stat-icon": {
      fontSize: "18px",
      color: theme.vars.palette.text.disabled
    },
    "& .node-type-bar": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginTop: "4px"
    },
    "& .node-type-segment": {
      height: "8px",
      borderRadius: "4px",
      transition: "width 0.2s ease"
    },
    "& .complexity-section": {
      marginTop: "16px",
      padding: "12px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px"
    },
    "& .complexity-bar": {
      height: "8px",
      borderRadius: "4px",
      marginTop: "8px",
      backgroundColor: theme.vars.palette.action.disabledBackground
    },
    "& .complexity-label": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginTop: "8px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.disabled,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "40px",
      marginBottom: "12px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px"
    }
  });

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: string;
}

const StatItem: React.FC<StatItemProps> = memo(({ icon, label, value, color }) => {
  return (
    <div className="stat-row">
      <div className="stat-label">
        <span className="stat-icon">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="stat-value" style={{ color }}>{value}</span>
    </div>
  );
});

StatItem.displayName = "StatItem";

const getComplexityColor = (score: number): string => {
  if (score <= 30) {return "var(--palette-success-main)";}
  if (score <= 60) {return "var(--palette-warning-main)";}
  return "var(--palette-error-main)";
};

const getComplexityLabel = (score: number): string => {
  if (score <= 30) {return "Simple";}
  if (score <= 60) {return "Moderate";}
  return "Complex";
};

const WorkflowStatisticsPanel: React.FC = memo(() => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useEdges();
  const statistics = useWorkflowStatisticsStore((state) => state.statistics);
  const calculateStatistics = useWorkflowStatisticsStore((state) => state.calculateStatistics);

  const stats = useMemo((): typeof statistics => {
    if (!statistics || statistics.totalNodes !== nodes.length || statistics.totalEdges !== edges.length) {
      calculateStatistics(nodes, edges);
      return useWorkflowStatisticsStore.getState().statistics;
    }
    return statistics;
  }, [nodes, edges, statistics, calculateStatistics]);

  const handleRefresh = useCallback(() => {
    calculateStatistics(nodes, edges);
  }, [nodes, edges, calculateStatistics]);

  const nodeTypeEntries = useMemo(() => {
    if (!stats?.nodeTypeCounts) {return [];}
    return Object.entries(stats.nodeTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [stats]);

  const totalTypes = useMemo(() => {
    return nodeTypeEntries.reduce((sum, [, count]) => sum + count, 0);
  }, [nodeTypeEntries]);

  const getBarColor = (index: number): string => {
    const colors = [
      "var(--palette-primary-main)",
      "var(--palette-secondary-main)",
      "var(--palette-success-main)",
      "var(--palette-warning-main)",
      "var(--palette-info-main)"
    ];
    return colors[index % colors.length];
  };

  if (!stats || nodes.length === 0) {
    return (
      <Box className="workflow-stats-panel" css={styles(theme)}>
        <Box className="panel-header">
          <Typography className="panel-title">
            <AccountTreeOutlinedIcon fontSize="small" />
            Workflow Statistics
          </Typography>
        </Box>
        <Box className="panel-content">
          <Box className="empty-state">
            <AccountTreeOutlinedIcon className="empty-icon" />
            <Typography className="empty-text">
              Add nodes to see workflow statistics
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box className="workflow-stats-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Typography className="panel-title">
          <AccountTreeOutlinedIcon fontSize="small" />
          Workflow Statistics
        </Typography>
        <Tooltip title="Refresh" arrow enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={handleRefresh} sx={{ color: "text.secondary" }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box className="panel-content">
        <Box className="stat-section">
          <Typography className="stat-section-title">
            <GridOnOutlinedIcon fontSize="small" />
            Overview
          </Typography>
          <StatItem
            icon={<GridOnOutlinedIcon />}
            label="Total Nodes"
            value={stats.totalNodes}
          />
          <StatItem
            icon={<LinkOutlinedIcon />}
            label="Connections"
            value={stats.totalEdges}
          />
        </Box>

        <Box className="stat-section">
          <Typography className="stat-section-title">
            <TrendingUpOutlinedIcon fontSize="small" />
            Node Types
          </Typography>
          {nodeTypeEntries.map(([type, count], index) => (
            <div key={type} className="stat-row">
              <div className="stat-label">
                <span
                  className="stat-icon"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: getBarColor(index)
                  }}
                />
                <span style={{ fontSize: "12px" }}>{type}</span>
              </div>
              <span className="stat-value">{count}</span>
            </div>
          ))}
          {nodeTypeEntries.length > 0 && (
            <Box className="node-type-bar" sx={{ mt: 1 }}>
              {nodeTypeEntries.map(([, count], index) => (
                <Box
                  key={index}
                  className="node-type-segment"
                  sx={{
                    width: `${(count / totalTypes) * 100}%`,
                    backgroundColor: getBarColor(index)
                  }}
                />
              ))}
            </Box>
          )}
        </Box>

        <Box className="stat-section">
          <Typography className="stat-section-title">
            <LinkOutlinedIcon fontSize="small" />
            Connectivity
          </Typography>
          <StatItem
            icon={<LinkOutlinedIcon />}
            label="Connected"
            value={stats.connectedNodes}
          />
          <StatItem
            icon={<LinkOffOutlinedIcon />}
            label="Disconnected"
            value={stats.disconnectedNodes}
            color={stats.disconnectedNodes > 0 ? "var(--palette-warning-main)" : undefined}
          />
        </Box>

        <Box className="complexity-section">
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography className="stat-section-title" sx={{ marginBottom: 0 }}>
              <SpeedOutlinedIcon fontSize="small" />
              Complexity Score
            </Typography>
            <Tooltip
              title="Based on node count, connections, and unique node types"
              arrow
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <IconButton size="small" sx={{ color: "text.disabled", p: 0.5 }}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            className="complexity-bar"
            sx={{
              backgroundColor: getComplexityColor(stats.complexityScore),
              opacity: 0.3
            }}
          />
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
            <Typography className="stat-value" style={{ color: getComplexityColor(stats.complexityScore) }}>
              {stats.complexityScore}/100
            </Typography>
            <Typography className="complexity-label">
              {getComplexityLabel(stats.complexityScore)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

WorkflowStatisticsPanel.displayName = "WorkflowStatisticsPanel";

export default WorkflowStatisticsPanel;
