/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  Tooltip
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import LoopIcon from "@mui/icons-material/Loop";
import WarningIcon from "@mui/icons-material/Warning";
import { useWorkflowStatistics } from "../../hooks/useWorkflowStatistics";
import { useWorkflowStatisticsStore } from "../../stores/WorkflowStatisticsStore";
import { CloseButton } from "../ui_primitives/CloseButton";

const styles = (theme: Theme) =>
  css({
    "&.workflow-statistics-panel": {
      position: "fixed",
      top: "80px",
      left: "20px",
      width: "280px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 14000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      animation: "fadeIn 0.15s ease-out forwards",
      overflow: "hidden"
    },
    "@keyframes fadeIn": {
      "0%": { opacity: 0, transform: "translateY(-10px)" },
      "100%": { opacity: 1, transform: "translateY(0)" }
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
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1)
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "12px 16px"
    },
    "& .stat-section": {
      marginBottom: "12px"
    },
    "& .stat-section:last-child": {
      marginBottom: 0
    },
    "& .stat-label": {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      marginBottom: "6px"
    },
    "& .stat-value": {
      fontSize: "20px",
      fontWeight: 700,
      color: theme.vars.palette.text.primary
    },
    "& .stat-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px"
    },
    "& .stat-row:last-child": {
      marginBottom: 0
    },
    "& .stat-row-label": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary
    },
    "& .stat-row-value": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .complexity-chip": {
      fontSize: "11px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    "& .complexity-simple": {
      backgroundColor: `${theme.vars.palette.success.main}20`,
      color: theme.vars.palette.success.main
    },
    "& .complexity-moderate": {
      backgroundColor: `${theme.vars.palette.warning.main}20`,
      color: theme.vars.palette.warning.main
    },
    "& .complexity-complex": {
      backgroundColor: `${theme.vars.palette.error.main}20`,
      color: theme.vars.palette.error.main
    },
    "& .type-list": {
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    "& .type-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: "12px",
      padding: "4px 0"
    },
    "& .type-name": {
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      maxWidth: "180px"
    },
    "& .type-count": {
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .badge-list": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px"
    },
    "& .badge": {
      fontSize: "11px",
      height: "20px",
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-icon": {
      fontSize: "32px",
      marginBottom: "8px",
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "13px"
    }
  });

interface WorkflowStatisticsPanelProps {
  workflowId: string;
}

const WorkflowStatisticsPanel: React.FC<WorkflowStatisticsPanelProps> = memo(
  ({ workflowId: _workflowId }: WorkflowStatisticsPanelProps) => {
    const theme = useTheme();
    const isOpen = useWorkflowStatisticsStore((state) => state.isOpen);
    const close = useWorkflowStatisticsStore((state) => state.close);
    const { stats } = useWorkflowStatistics();

    const complexityColor = useMemo(() => {
      switch (stats.estimatedComplexity) {
        case "simple":
          return "complexity-simple";
        case "moderate":
          return "complexity-moderate";
        case "complex":
          return "complexity-complex";
        default:
          return "complexity-simple";
      }
    }, [stats.estimatedComplexity]);

    if (!isOpen) {
      return null;
    }

    const badges = [];
    if (stats.hasLoops) {
      badges.push(
        <Chip
          key="loops"
          icon={<LoopIcon sx={{ fontSize: 14 }} />}
          label="Contains Loops"
          size="small"
          className="badge complexity-moderate"
        />
      );
    }
    if (stats.hasBypassedNodes) {
      badges.push(
        <Chip
          key="bypassed"
          icon={<WarningIcon sx={{ fontSize: 14 }} />}
          label="Bypassed Nodes"
          size="small"
          className="badge complexity-moderate"
        />
      );
    }

    return (
      <Box
        className="workflow-statistics-panel"
        css={styles(theme)}
      >
        <Box className="panel-header">
          <Typography className="panel-title">
            <InfoIcon fontSize="small" />
            Workflow Statistics
          </Typography>
          <CloseButton
            onClick={close}
            tooltip="Close (Escape)"
            buttonSize="small"
            nodrag={false}
          />
        </Box>

        <Box className="panel-content">
          {/* Main counts */}
          <Box className="stat-section">
            <Box className="stat-row">
              <Typography className="stat-row-label">Total Nodes</Typography>
              <Typography className="stat-row-value">{stats.totalNodes}</Typography>
            </Box>
            <Box className="stat-row">
              <Typography className="stat-row-label">Connections</Typography>
              <Typography className="stat-row-value">{stats.totalEdges}</Typography>
            </Box>
            <Box className="stat-row">
              <Typography className="stat-row-label">Selected</Typography>
              <Typography className="stat-row-value">{stats.selectedNodes}</Typography>
            </Box>
          </Box>

          {/* Complexity */}
          <Box className="stat-section">
            <Typography className="stat-label">Complexity</Typography>
            <Chip
              label={stats.estimatedComplexity}
              size="small"
              className={`complexity-chip ${complexityColor}`}
            />
          </Box>

          {/* Special badges */}
          {badges.length > 0 && (
            <Box className="stat-section">
              <Typography className="stat-label">Features</Typography>
              <Box className="badge-list">
                {badges}
              </Box>
            </Box>
          )}

          {/* Node type distribution */}
          {stats.nodeTypeStats.length > 0 && (
            <Box className="stat-section">
              <Typography className="stat-label">Node Types</Typography>
              <Box className="type-list">
                {stats.nodeTypeStats.slice(0, 8).map((typeStat) => (
                  <Box key={typeStat.type} className="type-item">
                    <Tooltip title={typeStat.type} arrow>
                      <Typography className="type-name">
                        {typeStat.type}
                      </Typography>
                    </Tooltip>
                    <Typography className="type-count">
                      {typeStat.count}
                    </Typography>
                  </Box>
                ))}
                {stats.nodeTypeStats.length > 8 && (
                  <Box className="type-item">
                    <Typography className="type-name">
                      +{stats.nodeTypeStats.length - 8} more types
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Empty state */}
          {stats.totalNodes === 0 && (
            <Box className="empty-state">
              <InfoIcon className="empty-icon" />
              <Typography className="empty-text">
                No nodes in workflow
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  }
);

WorkflowStatisticsPanel.displayName = "WorkflowStatisticsPanel";

export default WorkflowStatisticsPanel;
