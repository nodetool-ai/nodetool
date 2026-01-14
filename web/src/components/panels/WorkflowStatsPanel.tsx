/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Divider, Chip } from "@mui/material";
import { useNodes } from "../../contexts/NodeContext";
import { useMemo } from "react";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import HubIcon from "@mui/icons-material/Hub";
import CommentIcon from "@mui/icons-material/Comment";
import InputIcon from "@mui/icons-material/Input";
import OutputIcon from "@mui/icons-material/Output";
import { memo } from "react";

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: string;
}

const StatItem: React.FC<StatItemProps> = memo(function StatItem({ icon, label, value, color }) {
  return (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      py: 0.75
    }}
  >
    <Box
      sx={{
        color: color || "text.secondary",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 1,
        bgcolor: color ? `${color}15` : "action.hover"
      }}
    >
      {icon}
    </Box>
    <Box sx={{ flex: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
    <Typography variant="body2" fontWeight={600}>
      {value}
    </Typography>
  </Box>
  );
});

interface CategoryStat {
  category: string;
  count: number;
  color: string;
}

const styles = (theme: Theme) =>
  css({
    ".workflow-stats-panel": {
      padding: 2,
      height: "100%",
      overflow: "auto",
      bgcolor: "background.default"
    },
    ".panel-header": {
      display: "flex",
      alignItems: "center",
      gap: 1,
      mb: 2
    },
    ".panel-title": {
      fontSize: "1rem",
      fontWeight: 600,
      color: "text.primary"
    },
    ".section-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "text.secondary",
      mb: 1,
      mt: 2
    },
    ".stats-section": {
      bgcolor: "background.paper",
      borderRadius: 2,
      border: `1px solid ${theme.vars.palette.divider}`,
      p: 1.5,
      mb: 2
    },
    ".category-chips": {
      display: "flex",
      flexWrap: "wrap",
      gap: 0.75,
      mt: 1
    },
    ".category-chip": {
      fontSize: "0.75rem",
      fontWeight: 500
    },
    ".divider": {
      my: 1.5,
      borderColor: theme.vars.palette.divider
    }
  });

const WorkflowStatsPanel: React.FC = memo(function WorkflowStatsPanel() {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const selectedNodes = useNodes((state) => state.getSelectedNodes());

  const stats = useMemo(() => {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const selectedCount = selectedNodes.length;

    const commentNodes = nodes.filter((n) => n.type === "comment");
    const commentCount = commentNodes.length;

    const inputNodes = nodes.filter((n) => n.type === "inputNode");
    const outputNodes = nodes.filter((n) => n.type === "outputNode");
    const regularNodes = nodes.filter(
      (n) =>
        n.type !== "comment" && n.type !== "inputNode" && n.type !== "outputNode" && n.type !== "groupNode"
    );

    const categoryCount: Record<string, number> = {};
    nodes.forEach((node) => {
      const nodeType = node.type || "unknown";
      const category = nodeType.split(".")[0] || "other";
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const categoryStats: CategoryStat[] = Object.entries(categoryCount)
      .map(([category, count]) => ({
        category,
        count,
        color:
          category === "nodetool"
            ? theme.vars.palette.primary.main
            : category === "comfy"
              ? "#f59e0b"
              : category === "inputNode"
                ? "#10b981"
                : category === "outputNode"
                  ? "#ef4444"
                  : category === "comment"
                    ? "#8b5cf6"
                    : category === "groupNode"
                      ? "#6366f1"
                      : theme.vars.palette.text.secondary
      }))
      .sort((a, b) => b.count - a.count);

    const connectionDensity = totalNodes > 0 ? (totalEdges / (totalNodes * (totalNodes - 1))) * 100 : 0;

    return {
      totalNodes,
      totalEdges,
      selectedCount,
      commentCount,
      inputNodes: inputNodes.length,
      outputNodes: outputNodes.length,
      regularNodes: regularNodes.length,
      categoryStats,
      connectionDensity: Math.min(connectionDensity, 100).toFixed(1)
    };
  }, [nodes, edges, selectedNodes, theme]);

  return (
    <Box css={styles(theme)} className="workflow-stats-panel">
      <Box className="panel-header">
        <AnalyticsIcon sx={{ color: "primary.main" }} />
        <Typography className="panel-title">Workflow Statistics</Typography>
      </Box>

      <Box className="stats-section">
        <StatItem
          icon={<AccountTreeIcon fontSize="small" />}
          label="Total Nodes"
          value={stats.totalNodes}
          color={theme.vars.palette.primary.main}
        />
        <Divider className="divider" />
        <StatItem
          icon={<HubIcon fontSize="small" />}
          label="Connections"
          value={stats.totalEdges}
          color={theme.vars.palette.secondary.main}
        />
        <Divider className="divider" />
        <StatItem
          icon={<InputIcon fontSize="small" />}
          label="Input Nodes"
          value={stats.inputNodes}
          color="#10b981"
        />
        <StatItem
          icon={<OutputIcon fontSize="small" />}
          label="Output Nodes"
          value={stats.outputNodes}
          color="#ef4444"
        />
        <StatItem
          icon={<CommentIcon fontSize="small" />}
          label="Comments"
          value={stats.commentCount}
          color="#8b5cf6"
        />
      </Box>

      <Typography className="section-title">Node Categories</Typography>
      <Box className="stats-section">
        <Box className="category-chips">
          {stats.categoryStats.map((cat) => (
            <Chip
              key={cat.category}
              label={`${cat.category}: ${cat.count}`}
              size="small"
              sx={{
                bgcolor: `${cat.color}15`,
                color: cat.color,
                borderColor: `${cat.color}30`,
                border: `1px solid`,
                ".MuiChip-label": {
                  fontWeight: 500
                }
              }}
            />
          ))}
          {stats.categoryStats.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No nodes in workflow
            </Typography>
          )}
        </Box>
      </Box>

      <Typography className="section-title">Selection</Typography>
      <Box className="stats-section">
        <StatItem
          icon={<AccountTreeIcon fontSize="small" />}
          label="Selected Nodes"
          value={stats.selectedCount}
          color={stats.selectedCount > 0 ? theme.vars.palette.warning.main : undefined}
        />
      </Box>

      <Typography className="section-title">Metrics</Typography>
      <Box className="stats-section">
        <StatItem
          icon={<HubIcon fontSize="small" />}
          label="Connection Density"
          value={`${stats.connectionDensity}%`}
          color={parseFloat(stats.connectionDensity) > 50 ? theme.vars.palette.error.main : undefined}
        />
      </Box>
    </Box>
  );
});

export default WorkflowStatsPanel;
