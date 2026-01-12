/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import {
  Box,
  Typography,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNodes } from "../../contexts/NodeContext";
import {
  calculateWorkflowStats,
  getWorkflowComplexityLevel,
  getWorkflowComplexityDescription
} from "../../core/graph";

const containerStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    padding: "12px 16px",
    boxSizing: "border-box",
    gap: 16,
    overflow: "auto",
    ".section": {
      display: "flex",
      flexDirection: "column",
      gap: 8
    },
    ".section-title": {
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.vars.palette.text.secondary
    },
    ".stat-row": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 0"
    },
    ".stat-label": {
      fontSize: 13,
      color: theme.vars.palette.text.primary
    },
    ".stat-value": {
      fontSize: 13,
      fontWeight: 600,
      color: theme.vars.palette.primary.main
    },
    ".category-list": {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      bgcolor: theme.vars.palette.action.hover,
      borderRadius: 8,
      padding: 8
    },
    ".category-item": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 8px",
      borderRadius: 4,
      bgcolor: theme.vars.palette.background.paper,
      "&:hover": {
        bgcolor: theme.vars.palette.action.selected
      }
    },
    ".complexity-badge": {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 12px",
      borderRadius: 16,
      fontSize: 12,
      fontWeight: 600,
      textTransform: "capitalize"
    },
    ".complexity-simple": {
      bgcolor: theme.vars.palette.success.light,
      color: theme.vars.palette.success.dark
    },
    ".complexity-moderate": {
      bgcolor: theme.vars.palette.warning.light,
      color: theme.vars.palette.warning.dark
    },
    ".complexity-complex": {
      bgcolor: theme.vars.palette.error.light,
      color: theme.vars.palette.error.dark
    },
    ".progress-section": {
      marginTop: 4
    },
    ".progress-label": {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 11,
      color: theme.vars.palette.text.secondary,
      marginBottom: 4
    }
  });

const WorkflowStatsPanel: React.FC = () => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const stats = useMemo(() => {
    return calculateWorkflowStats(nodes, edges);
  }, [nodes, edges]);

  const complexityLevel = useMemo(() => {
    return getWorkflowComplexityLevel(stats);
  }, [stats]);

  const complexityColor = useMemo(() => {
    switch (complexityLevel) {
      case "simple":
        return "success";
      case "moderate":
        return "warning";
      case "complex":
        return "error";
      default:
        return "default";
    }
  }, [complexityLevel]);

  const formatCategoryName = (category: string): string => {
    return category.replace(/([A-Z])/g, " $1").trim();
  };

  const sortedCategories = useMemo(() => {
    return Object.entries(stats.nodeCountsByCategory).sort((a, b) => b[1] - a[1]);
  }, [stats.nodeCountsByCategory]);

  const sortedTypes = useMemo(() => {
    return Object.entries(stats.nodeCountsByType).sort((a, b) => b[1] - a[1]);
  }, [stats.nodeCountsByType]);

  return (
    <Box css={containerStyles(theme)}>
      <Box className="section">
        <Typography className="section-title">Overview</Typography>
        <Box className="category-list">
          <Box className="stat-row">
            <Typography className="stat-label">Total Nodes</Typography>
            <Typography className="stat-value">{stats.nodeCount}</Typography>
          </Box>
          <Box className="stat-row">
            <Typography className="stat-label">Total Connections</Typography>
            <Typography className="stat-value">{stats.edgeCount}</Typography>
          </Box>
          <Box className="stat-row">
            <Typography className="stat-label">Workflow Depth</Typography>
            <Typography className="stat-value">{stats.workflowDepth} layers</Typography>
          </Box>
          <Box className="stat-row">
            <Typography className="stat-label">Branching Factor</Typography>
            <Typography className="stat-value">{stats.branchingFactor}</Typography>
          </Box>
        </Box>
      </Box>

      <Box className="section">
        <Typography className="section-title">Structure</Typography>
        <Box className="category-list">
          <Box className="stat-row">
            <Typography className="stat-label">Source Nodes</Typography>
            <Chip label={stats.sourceNodes} size="small" color="primary" variant="outlined" />
          </Box>
          <Box className="stat-row">
            <Typography className="stat-label">Sink Nodes</Typography>
            <Chip label={stats.sinkNodes} size="small" color="primary" variant="outlined" />
          </Box>
          {stats.hasCycles && (
            <Box className="stat-row">
              <Typography className="stat-label" sx={{ color: "warning.main" }}>
                Cycles Detected
              </Typography>
              <Chip label="Yes" size="small" color="warning" />
            </Box>
          )}
        </Box>
      </Box>

      <Box className="section">
        <Typography className="section-title">Complexity</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Box
            className={`complexity-badge complexity-${complexityLevel}`}
            sx={{
              bgcolor: `${complexityColor}.light`,
              color: `${complexityColor}.dark`
            }}
          >
            {complexityLevel} Workflow
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: 1.4 }}>
            {getWorkflowComplexityDescription(complexityLevel)}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ my: 4 }} />

      <Box className="section">
        <Typography className="section-title">Nodes by Category</Typography>
        <List dense sx={{ padding: 0 }}>
          {sortedCategories.map(([category, count]) => (
            <ListItem
              key={category}
              sx={{
                padding: "4px 0",
                borderBottom: `1px solid ${theme.vars.palette.divider}`
              }}
            >
              <ListItemText
                primary={formatCategoryName(category)}
                primaryTypographyProps={{ fontSize: 13 }}
              />
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: "primary.main" }}
              >
                {count}
              </Typography>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box className="section">
        <Typography className="section-title">Top Node Types</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sortedTypes.slice(0, 5).map(([type, count]) => {
            const percentage = stats.nodeCount > 0 ? (count / stats.nodeCount) * 100 : 0;
            return (
              <Box key={type}>
                <Box className="progress-label">
                  <Typography variant="caption" noWrap sx={{ maxWidth: 180 }}>
                    {type}
                  </Typography>
                  <Typography variant="caption">{count}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={percentage}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: theme.vars.palette.action.hover,
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 2
                    }
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default WorkflowStatsPanel;
