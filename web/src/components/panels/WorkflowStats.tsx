/**
 * WorkflowStats displays statistics about the current workflow.
 *
 * Shows:
 * - Total node and edge counts
 * - Node counts by category (Input, Output, Processing, etc.)
 * - Node type distribution (most common node types)
 * - Selected node count
 *
 * This component uses selective subscriptions from the workflow store
 * to avoid unnecessary re-renders.
 */

import React, { useMemo } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useWorkflowStats from "../../hooks/useWorkflowStats";

// Styled stat card component
const StatCard: React.FC<{
  label: string;
  value: number;
  color?: string;
}> = React.memo(function StatCard({ label, value, color }) {
  const theme = useTheme();

  return (
    <Card
      sx={{
        height: "100%",
        bgcolor: color
          ? theme.vars.palette.background.paper
          : theme.vars.palette.action.hover,
        border: color ? `1px solid ${color}` : undefined
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="caption" sx={{ opacity: 0.7, display: "block" }}>
          {label}
        </Typography>
        <Typography
          variant="h6"
          sx={{
            fontWeight: "bold",
            color: color || theme.vars.palette.text.primary
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
});

// Node type chip with color coding
const NodeTypeChip: React.FC<{
  type: string;
  count: number;
  category: string;
}> = React.memo(function NodeTypeChip({ type, count, category }) {
  const theme = useTheme();

  // Get color based on category
  const getCategoryColor = (): string => {
    switch (category) {
      case "Input":
        return theme.vars.palette.info.main;
      case "Output":
        return theme.vars.palette.warning.main;
      case "Processing":
        return theme.vars.palette.primary.main;
      case "Constant":
        return theme.vars.palette.secondary.main;
      case "Group":
        return theme.vars.palette.success.main;
      case "Comment":
        return theme.vars.palette.grey[500];
      default:
        return theme.vars.palette.grey[400];
    }
  };

  // Simplify type name for display
  const displayName = type.replace("nodetool.", "").replace("input.", "").replace("output.", "");

  return (
    <Chip
      label={`${displayName} (${count})`}
      size="small"
      sx={{
        bgcolor: getCategoryColor(),
        color: theme.vars.palette.background.paper,
        fontSize: "0.75rem",
        height: 24
      }}
    />
  );
});

const WorkflowStats: React.FC = React.memo(function WorkflowStats() {
  const theme = useTheme();
  const stats = useWorkflowStats();

  // Calculate summary statistics
  const summaryStats = useMemo(
    () => [
      { label: "Total Nodes", value: stats.nodeCount },
      { label: "Total Edges", value: stats.edgeCount },
      { label: "Selected", value: stats.selectedNodeCount }
    ],
    [stats.nodeCount, stats.edgeCount, stats.selectedNodeCount]
  );

  // Calculate category statistics with colors
  const categoryStats = useMemo(
    () => [
      { 
        label: "Input", 
        value: stats.inputNodeCount, 
        color: theme.vars.palette.info.main 
      },
      { 
        label: "Output", 
        value: stats.outputNodeCount, 
        color: theme.vars.palette.warning.main 
      },
      { 
        label: "Processing", 
        value: stats.processingNodeCount, 
        color: theme.vars.palette.primary.main 
      },
      { 
        label: "Constant", 
        value: stats.constantNodeCount, 
        color: theme.vars.palette.secondary.main 
      },
      { 
        label: "Group", 
        value: stats.groupNodeCount, 
        color: theme.vars.palette.success.main 
      },
      { 
        label: "Comment", 
        value: stats.commentNodeCount, 
        color: undefined
      }
    ],
    [
      stats.inputNodeCount,
      stats.outputNodeCount,
      stats.processingNodeCount,
      stats.constantNodeCount,
      stats.groupNodeCount,
      stats.commentNodeCount,
      theme
    ]
  );

  return (
    <Box
      sx={{
        p: 2,
        height: "100%",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2
      }}
    >
      {/* Header */}
      <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
        Workflow Statistics
      </Typography>

      {/* Summary Stats */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap"
        }}
      >
        {summaryStats.map((stat) => (
          <Box
            key={stat.label}
            sx={{
              flex: "1 1 calc(33.333% - 8px)",
              minWidth: 80
            }}
          >
            <StatCard label={stat.label} value={stat.value} />
          </Box>
        ))}
      </Box>

      <Divider />

      {/* Category Breakdown */}
      <Box>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: "bold", mb: 1.5, opacity: 0.9 }}
        >
          Nodes by Category
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap"
          }}
        >
          {categoryStats.map((stat) => (
            <Box
              key={stat.label}
              sx={{
                flex: "1 1 calc(50% - 8px)",
                minWidth: 120
              }}
            >
              <StatCard
                label={stat.label}
                value={stat.value}
                color={stat.color}
              />
            </Box>
          ))}
        </Box>
      </Box>

      {/* Node Type Distribution */}
      {stats.nodeTypeDistribution.length > 0 && (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: "bold", mb: 1.5, opacity: 0.9 }}
          >
            Most Common Node Types
          </Typography>
          <Stack spacing={0.5} useFlexGap>
            {stats.nodeTypeDistribution.slice(0, 10).map((item) => (
              <NodeTypeChip
                key={item.type}
                type={item.type}
                count={item.count}
                category={item.category}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Empty State */}
      {stats.nodeCount === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 4,
            opacity: 0.5
          }}
        >
          <Typography variant="body2">
            No nodes in workflow. Add nodes to see statistics.
          </Typography>
        </Box>
      )}
    </Box>
  );
});

export default WorkflowStats;
