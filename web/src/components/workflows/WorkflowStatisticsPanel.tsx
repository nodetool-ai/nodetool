/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Paper,
  LinearProgress,
  Chip,
  Divider,
  IconButton,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import HubIcon from "@mui/icons-material/Hub";
import DeviceHubIcon from "@mui/icons-material/DeviceHub";
import FilterCenterFocusIcon from "@mui/icons-material/FilterCenterFocus";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import isEqual from "lodash/isEqual";
import { useWorkflowStats, formatComplexityScore, getTopNodeTypes, getTopNamespaces } from "../../hooks/editor/useWorkflowStats";
import { useNodes } from "../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "320px",
      maxHeight: "400px",
      overflowY: "auto",
      zIndex: 9999,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      borderRadius: "12px",
      backdropFilter: "blur(10px)",
      backgroundColor: "rgba(30, 30, 30, 0.95)",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      transition: "transform 0.2s ease, opacity 0.2s ease"
    },
    "&.collapsed": {
      transform: "translateY(calc(100% - 48px))"
    },
    ".stats-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: "rgba(40, 40, 40, 0.9)",
      borderRadius: "12px 12px 0 0",
      cursor: "pointer"
    },
    ".stats-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontWeight: 600,
      fontSize: "0.9rem",
      color: theme.vars.palette.grey[0]
    },
    ".stats-content": {
      padding: "16px"
    },
    ".stat-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px",
      fontSize: "0.85rem"
    },
    ".stat-label": {
      color: theme.vars.palette.grey[300],
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    ".stat-value": {
      fontWeight: 600,
      color: theme.vars.palette.grey[0]
    },
    ".section-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginTop: "16px",
      marginBottom: "8px"
    },
    ".progress-container": {
      marginBottom: "12px"
    },
    ".progress-label": {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "4px",
      fontSize: "0.8rem"
    },
    ".complexity-badge": {
      padding: "4px 12px",
      borderRadius: "16px",
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase"
    },
    ".chip-container": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginTop: "8px"
    },
    ".chip": {
      fontSize: "0.75rem",
      padding: "2px 8px"
    },
    ".close-button": {
      padding: "4px",
      color: theme.vars.palette.grey[400],
      "&:hover": {
        color: theme.vars.palette.grey[0],
        backgroundColor: "rgba(255,255,255,0.1)"
      }
    },
    ".metric-icon": {
      fontSize: "18px",
      color: theme.vars.palette.primary.main
    }
  });

interface WorkflowStatisticsPanelProps {
  workflowId?: string;
  className?: string;
}

const WorkflowStatisticsPanel: React.FC<WorkflowStatisticsPanelProps> = ({
  workflowId: _workflowId,
  className = ""
}) => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const stats = useWorkflowStats(nodes, edges);

  const topNodeTypes = getTopNodeTypes(stats.nodeCountByType, 4);
  const topNamespaces = getTopNamespaces(stats.nodeCountByNamespace, 4);

  const getComplexityColor = (score: number): string => {
    if (score < 20) {
      return theme.vars.palette.success.main;
    }
    if (score < 40) {
      return theme.vars.palette.info.main;
    }
    if (score < 60) {
      return theme.vars.palette.warning.main;
    }
    if (score < 80) {
      return theme.vars.palette.orange?.main || "#f57c00";
    }
    return theme.vars.palette.error.main;
  };

  const complexityColor = getComplexityColor(stats.complexityScore);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Paper css={styles(theme)} className={className}>
      <div className="stats-header">
        <div className="stats-title">
          <AnalyticsIcon className="metric-icon" />
          Workflow Statistics
        </div>
        <Tooltip title="Close statistics">
          <IconButton
            className="close-button"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              const panel = (e.target as HTMLElement).closest("[class*='stats']");
              if (panel) {
                (panel as HTMLElement).style.display = "none";
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="stats-content">
        <div className="stat-row">
          <span className="stat-label">
            <AccountTreeIcon fontSize="small" />
            Total Nodes
          </span>
          <span className="stat-value">{stats.totalNodes}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">
            <HubIcon fontSize="small" />
            Total Connections
          </span>
          <span className="stat-value">{stats.totalEdges}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">
            <DeviceHubIcon fontSize="small" />
            Root Nodes
          </span>
          <span className="stat-value">{stats.rootNodes}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">
            <FilterCenterFocusIcon fontSize="small" />
            Leaf Nodes
          </span>
          <span className="stat-value">{stats.leafNodes}</span>
        </div>

        <div className="stat-row">
          <span className="stat-label">
            <HubIcon fontSize="small" />
            Isolated Nodes
          </span>
          <span className="stat-value">{stats.isolatedNodes}</span>
        </div>

        <Divider sx={{ my: 1.5, borderColor: theme.vars.palette.grey[700] }} />

        <div className="section-title">
          <TrendingUpIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }} />
          Complexity Analysis
        </div>

        <div className="progress-container">
          <div className="progress-label">
            <span>Complexity Score</span>
            <Chip
              label={formatComplexityScore(stats.complexityScore)}
              size="small"
              sx={{
                backgroundColor: `${complexityColor}20`,
                color: complexityColor,
                border: `1px solid ${complexityColor}`,
                ".MuiChip-label": {
                  fontWeight: 600
                }
              }}
            />
          </div>
          <LinearProgress
            variant="determinate"
            value={Math.min(stats.complexityScore, 100)}
            sx={{
              height: "6px",
              borderRadius: "3px",
              backgroundColor: "rgba(255,255,255,0.1)",
              "& .MuiLinearProgress-bar": {
                backgroundColor: complexityColor,
                borderRadius: "3px"
              }
            }}
          />
        </div>

        <div className="progress-container">
          <div className="progress-label">
            <span>Connection Density</span>
            <span className="stat-value">{stats.connectionDensity}%</span>
          </div>
          <LinearProgress
            variant="determinate"
            value={Math.min(stats.connectionDensity * 10, 100)}
            sx={{
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "rgba(255,255,255,0.1)",
              "& .MuiLinearProgress-bar": {
                backgroundColor: theme.vars.palette.info.main,
                borderRadius: "2px"
              }
            }}
          />
        </div>

        {topNodeTypes.length > 0 && (
          <>
            <Divider sx={{ my: 1.5, borderColor: theme.vars.palette.grey[700] }} />
            <div className="section-title">Top Node Types</div>
            <div className="chip-container">
              {topNodeTypes.map(({ type, count }) => {
                const shortType = type.split(".").pop() || type;
                return (
                  <Chip
                    key={type}
                    label={`${shortType}: ${count}`}
                    size="small"
                    className="chip"
                    sx={{
                      backgroundColor: "rgba(255,255,255,0.08)",
                      color: theme.vars.palette.grey[200],
                      border: `1px solid ${theme.vars.palette.grey[600]}`
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {topNamespaces.length > 0 && (
          <>
            <Divider sx={{ my: 1.5, borderColor: theme.vars.palette.grey[700] }} />
            <div className="section-title">Namespaces Used</div>
            <div className="chip-container">
              {topNamespaces.map(({ namespace, count }) => (
                <Chip
                  key={namespace}
                  label={`${namespace}: ${count}`}
                  size="small"
                  className="chip"
                  sx={{
                    backgroundColor: "rgba(100,100,255,0.15)",
                    color: theme.vars.palette.primary.light,
                    border: `1px solid ${theme.vars.palette.primary.dark}`
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Paper>
  );
};

export default memo(WorkflowStatisticsPanel, isEqual);
