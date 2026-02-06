/**
 * WorkflowStatisticsPanel displays comprehensive statistics about the current workflow.
 *
 * This panel shows:
 * - Basic counts (nodes, edges, selections)
 * - Node categories breakdown
 * - Graph metrics (depth, branching, complexity)
 * - Graph health indicators (orphans, cycles)
 * - Most used node types
 *
 * The statistics update in real-time as the workflow changes.
 */

import { memo } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Tooltip,
  useTheme,
  Stack
} from "@mui/material";
import {
  AccountTree,
  Hub,
  Warning,
  CheckCircle,
  TrendingUp,
  Category
} from "@mui/icons-material";
import { useWorkflowStatistics } from "../../hooks/useWorkflowStatistics";
import { styled } from "@mui/material/styles";

const StyledCard = styled(Card)(({ theme }) => ({
  height: "100%",
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(2)
}));

const StatItem: React.FC<{
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  tooltip?: string;
  color?: string;
}> = memo(({ label, value, icon, tooltip, color }) => {
  const theme = useTheme();

  const content = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 0.75,
        px: 1,
        borderRadius: 1,
        "&:hover": {
          backgroundColor: theme.palette.action.hover
        }
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {icon && <Box sx={{ color: color || "text.secondary", fontSize: 18 }}>{icon}</Box>}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: color || "text.primary"
        }}
      >
        {value}
      </Typography>
    </Box>
  );

  if (tooltip) {
    return <Tooltip title={tooltip} arrow>{content}</Tooltip>;
  }

  return content;
});

StatItem.displayName = "StatItem";

const ComplexityBadge: React.FC<{ complexity: number }> = memo(({ complexity }) => {
  const getComplexityLevel = (): { label: string; color: string } => {
    if (complexity <= 5) return { label: "Simple", color: "success" };
    if (complexity <= 15) return { label: "Moderate", color: "info" };
    if (complexity <= 30) return { label: "Complex", color: "warning" };
    return { label: "Very Complex", color: "error" };
  };

  const { label, color } = getComplexityLevel();
  const theme = useTheme();

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: theme.palette[color].main,
        color: theme.palette[color].contrastText,
        fontWeight: 600,
        fontSize: "0.7rem"
      }}
    />
  );
});

ComplexityBadge.displayName = "ComplexityBadge";

export const WorkflowStatisticsPanel: React.FC = memo(() => {
  const theme = useTheme();
  const stats = useWorkflowStatistics();

  if (stats.totalNodes === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "text.secondary",
          p: 3,
          textAlign: "center"
        }}
      >
        <AccountTree sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="body2" color="text.secondary">
          No nodes in workflow
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Add nodes to see workflow statistics
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        overflowY: "auto",
        p: 2
      }}
    >
      {/* Header with complexity badge */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Workflow Statistics
        </Typography>
        <ComplexityBadge complexity={stats.cyclomaticComplexity} />
      </Box>

      <Stack spacing={2}>
        {/* Basic Counts */}
        <StyledCard>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}
            >
              <Category fontSize="small" />
              Overview
            </Typography>
            <StatItem
              label="Total Nodes"
              value={stats.totalNodes}
              icon={<AccountTree fontSize="small" />}
            />
            <StatItem
              label="Total Edges"
              value={stats.totalEdges}
              icon={<Hub fontSize="small" />}
            />
            <StatItem
              label="Selected"
              value={stats.selectedNodes}
              tooltip="Number of currently selected nodes"
            />
          </CardContent>
        </StyledCard>

        {/* Node Categories */}
        <StyledCard>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}
            >
              <TrendingUp fontSize="small" />
              Node Categories
            </Typography>
            <StatItem
              label="Inputs"
              value={stats.nodeCategories.input}
              tooltip="Nodes that provide data to the workflow"
              color={theme.palette.info.main}
            />
            <StatItem
              label="Processing"
              value={stats.nodeCategories.processing}
              tooltip="Nodes that transform data"
              color={theme.palette.primary.main}
            />
            <StatItem
              label="Outputs"
              value={stats.nodeCategories.output}
              tooltip="Nodes that display or export results"
              color={theme.palette.success.main}
            />
            <StatItem
              label="Groups"
              value={stats.nodeCategories.group}
              tooltip="Container nodes for organizing workflow"
              color={theme.palette.warning.main}
            />
          </CardContent>
        </StyledCard>

        {/* Graph Metrics */}
        <StyledCard>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontWeight: 600 }}
            >
              Graph Metrics
            </Typography>
            <StatItem
              label="Graph Depth"
              value={stats.graphDepth}
              tooltip="Longest path from input to output"
            />
            <StatItem
              label="Branching Factor"
              value={stats.branchingFactor.toFixed(2)}
              tooltip="Average number of outputs per node"
            />
            <StatItem
              label="Cyclomatic Complexity"
              value={stats.cyclomaticComplexity}
              tooltip="Measures workflow complexity (edges - nodes + 2)"
            />
            <StatItem
              label="Avg Connections"
              value={stats.avgConnectionsPerNode.toFixed(2)}
              tooltip="Average number of connections per node"
            />
            <StatItem
              label="Max Connections"
              value={stats.maxConnections}
              tooltip="Highest number of connections on a single node"
            />
          </CardContent>
        </StyledCard>

        {/* Graph Health */}
        <StyledCard>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Typography
              variant="subtitle2"
              sx={{ mb: 1, fontWeight: 600 }}
            >
              Graph Health
            </Typography>
            <StatItem
              label="Orphan Nodes"
              value={stats.orphanNodes}
              icon={stats.orphanNodes > 0 ? <Warning fontSize="small" /> : <CheckCircle fontSize="small" />}
              color={stats.orphanNodes > 0 ? theme.palette.warning.main : theme.palette.success.main}
              tooltip="Nodes without any connections"
            />
            <StatItem
              label="Connectivity Density"
              value={`${(stats.connectivityDensity * 100).toFixed(1)}%`}
              tooltip="Ratio of actual edges to possible edges"
            />
            <StatItem
              label="Cycles Detected"
              value={stats.hasCycles ? "Yes" : "No"}
              icon={stats.hasCycles ? <Warning fontSize="small" /> : <CheckCircle fontSize="small" />}
              color={stats.hasCycles ? theme.palette.warning.main : theme.palette.success.main}
              tooltip="Whether the workflow contains cyclic dependencies"
            />
          </CardContent>
        </StyledCard>

        {/* Top Node Types */}
        {stats.topNodeTypes.length > 0 && (
          <StyledCard>
            <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography
                variant="subtitle2"
                sx={{ mb: 1, fontWeight: 600 }}
              >
                Most Used Node Types
              </Typography>
              {stats.topNodeTypes.map(({ type, count }) => (
                <StatItem
                  key={type}
                  label={type.split(".").pop() || type}
                  value={count}
                />
              ))}
            </CardContent>
          </StyledCard>
        )}
      </Stack>
    </Box>
  );
});

WorkflowStatisticsPanel.displayName = "WorkflowStatisticsPanel";

export default WorkflowStatisticsPanel;
