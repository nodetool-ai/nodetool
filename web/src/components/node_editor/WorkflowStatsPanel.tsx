/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import HubIcon from "@mui/icons-material/Hub";
import LayersIcon from "@mui/icons-material/Layers";
import SpeedIcon from "@mui/icons-material/Speed";
import { useWorkflowStats } from "../../hooks/useWorkflowStats";
import { useWorkflowStatsStore } from "../../stores/WorkflowStatsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    "&.workflow-stats-panel": {
      position: "fixed",
      bottom: "80px",
      right: "20px",
      width: "280px",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideUp 0.2s ease-out forwards"
    },
    "@keyframes slideUp": {
      "0%": { opacity: 0, transform: "translateY(20px)" },
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
      gap: "8px"
    },
    "& .panel-content": {
      padding: "16px"
    },
    "& .stat-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "12px",
      "&:last-child": {
        marginBottom: 0
      }
    },
    "& .stat-label": {
      fontSize: "13px",
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    },
    "& .stat-value": {
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .section-title": {
      fontSize: "11px",
      fontWeight: 600,
      color: theme.vars.palette.text.disabled,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginTop: "16px",
      marginBottom: "8px"
    },
    "& .category-item": {
      display: "flex",
      alignItems: "center",
      marginBottom: "8px",
      gap: "8px"
    },
    "& .category-color": {
      width: "12px",
      height: "12px",
      borderRadius: "3px",
      flexShrink: 0
    },
    "& .category-name": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      flex: 1
    },
    "& .category-count": {
      fontSize: "12px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    "& .complexity-badge": {
      padding: "4px 10px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: 600
    },
    "& .complexity-simple": {
      backgroundColor: "#4caf5020",
      color: "#4caf50"
    },
    "& .complexity-moderate": {
      backgroundColor: "#ff980020",
      color: "#ff9800"
    },
    "& .complexity-complex": {
      backgroundColor: "#f4433620",
      color: "#f44336"
    },
    "& .complexity-advanced": {
      backgroundColor: "#9c27b020",
      color: "#9c27b0"
    },
    "& .empty-state": {
      textAlign: "center",
      padding: "24px 16px",
      color: theme.vars.palette.text.secondary
    }
  });

function getComplexityClass(label: string): string {
  switch (label.toLowerCase()) {
    case "simple":
      return "complexity-simple";
    case "moderate":
      return "complexity-moderate";
    case "complex":
      return "complexity-complex";
    case "advanced":
      return "complexity-advanced";
    default:
      return "complexity-simple";
  }
}

const WorkflowStatsPanel: React.FC = memo(() => {
  const theme = useTheme();
  const isOpen = useWorkflowStatsStore((state) => state.isOpen);
  const closePanel = useWorkflowStatsStore((state) => state.closePanel);
  const stats = useWorkflowStats();

  if (!isOpen) {
    return null;
  }

  if (stats.totalNodes === 0) {
    return (
      <Box className="workflow-stats-panel" css={styles(theme)}>
        <Box className="panel-header">
          <Typography className="panel-title">
            <SpeedIcon fontSize="small" />
            Workflow Stats
          </Typography>
          <IconButton size="small" onClick={closePanel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box className="empty-state">
          <Typography>No nodes in workflow</Typography>
          <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
            Add nodes to see statistics
          </Typography>
        </Box>
      </Box>
    );
  }

  const maxCategoryCount = Math.max(...stats.categories.map((c) => c.count), 1);

  return (
    <Box className="workflow-stats-panel" css={styles(theme)}>
      <Box className="panel-header">
        <Typography className="panel-title">
          <SpeedIcon fontSize="small" />
          Workflow Stats
        </Typography>
        <IconButton size="small" onClick={closePanel}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box className="panel-content">
        <Box className="stat-row">
          <Tooltip title="Total nodes in workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Typography className="stat-label">
              <AccountTreeIcon fontSize="small" />
              Nodes
            </Typography>
          </Tooltip>
          <Typography className="stat-value">{stats.totalNodes}</Typography>
        </Box>

        <Box className="stat-row">
          <Tooltip title="Total connections between nodes" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Typography className="stat-label">
              <HubIcon fontSize="small" />
              Connections
            </Typography>
          </Tooltip>
          <Typography className="stat-value">{stats.totalEdges}</Typography>
        </Box>

        <Box className="stat-row">
          <Tooltip title="Maximum depth of the workflow graph" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Typography className="stat-label">
              <LayersIcon fontSize="small" />
              Depth
            </Typography>
          </Tooltip>
          <Typography className="stat-value">{stats.maxDepth}</Typography>
        </Box>

        <Box className="stat-row">
          <Tooltip
            title={`Complexity score: ${stats.complexityScore}`}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Typography className="stat-label">
              <SpeedIcon fontSize="small" />
              Complexity
            </Typography>
          </Tooltip>
          <Typography
            className={`complexity-badge ${getComplexityClass(stats.complexityLabel)}`}
          >
            {stats.complexityLabel}
          </Typography>
        </Box>

        {stats.categories.length > 0 && (
          <>
            <Typography className="section-title">Node Categories</Typography>
            {stats.categories.slice(0, 5).map((category) => (
              <Box key={category.name} className="category-item">
                <Box
                  className="category-color"
                  sx={{ backgroundColor: category.color }}
                />
                <Typography className="category-name">{category.name}</Typography>
                <Box sx={{ flex: 1, mx: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(category.count / maxCategoryCount) * 100}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "action.hover",
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: category.color,
                        borderRadius: 2
                      }
                    }}
                  />
                </Box>
                <Typography className="category-count">{category.count}</Typography>
              </Box>
            ))}
            {stats.categories.length > 5 && (
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", display: "block", textAlign: "center", mt: 1 }}
              >
                +{stats.categories.length - 5} more categories
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
});

WorkflowStatsPanel.displayName = "WorkflowStatsPanel";

export default WorkflowStatsPanel;
