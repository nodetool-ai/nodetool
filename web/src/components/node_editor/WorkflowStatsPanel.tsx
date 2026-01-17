import React from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  useTheme
} from "@mui/material";
import {
  useWorkflowAnalytics,
  formatDuration
} from "../../hooks/useWorkflowAnalytics";
import { memo } from "react";

interface WorkflowStatsPanelProps {
  workflowId: string;
}

const WorkflowStatsPanelComponent: React.FC<WorkflowStatsPanelProps> = ({
  workflowId,
}) => {
  const theme = useTheme();
  const analytics = useWorkflowAnalytics({ workflowId });

  const {
    nodeCount,
    edgeCount,
    executedNodes,
    totalDuration,
    averageNodeDuration,
    slowestNode,
    fastestNode,
    completionPercentage,
    hasErrors,
    nodesByDuration,
  } = analytics;

  const isEmpty = nodeCount === 0 && edgeCount === 0;

  if (isEmpty) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 2,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--mui-palette-background-level2)",
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No workflow data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        height: "100%",
        overflow: "auto",
        backgroundColor: "var(--mui-palette-background-level2)",
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: 1,
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Workflow Performance
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Runtime statistics and execution metrics
        </Typography>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Completion
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            {completionPercentage}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={completionPercentage}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.vars.palette.action.hover,
            "& .MuiLinearProgress-bar": {
              backgroundColor: hasErrors
                ? theme.vars.palette.error.main
                : completionPercentage === 100
                ? theme.vars.palette.success.main
                : theme.vars.palette.primary.main,
              borderRadius: 4,
            },
          }}
        />
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 1.5,
          mb: 2,
        }}
      >
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.action.hover,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Nodes
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            {nodeCount}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ ml: 0.5 }}
            >
              ({executedNodes} executed)
            </Typography>
          </Typography>
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.action.hover,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Connections
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            {edgeCount}
          </Typography>
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.action.hover,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Total Runtime
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            {totalDuration !== undefined
              ? formatDuration(totalDuration)
              : "—"}
          </Typography>
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.vars.palette.action.hover,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Avg Node Time
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            {averageNodeDuration !== undefined
              ? formatDuration(averageNodeDuration)
              : "—"}
          </Typography>
        </Box>
      </Box>

      {hasErrors && (
        <Box sx={{ mb: 2 }}>
          <Chip
            label="Has Errors"
            color="error"
            size="small"
            sx={{ borderRadius: 1 }}
          />
        </Box>
      )}

      {(slowestNode || fastestNode) && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Performance Highlights
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {slowestNode && (
              <Tooltip title={`Slowest: ${slowestNode.label}`}>
                <Chip
                  label={`🐌 ${formatDuration(slowestNode.duration)}`}
                  size="small"
                  sx={{
                    borderRadius: 1,
                    backgroundColor: theme.vars.palette.warning.light,
                    color: theme.vars.palette.warning.contrastText,
                  }}
                />
              </Tooltip>
            )}
            {fastestNode && (
              <Tooltip title={`Fastest: ${fastestNode.label}`}>
                <Chip
                  label={`⚡ ${formatDuration(fastestNode.duration)}`}
                  size="small"
                  sx={{
                    borderRadius: 1,
                    backgroundColor: theme.vars.palette.success.light,
                    color: theme.vars.palette.success.contrastText,
                  }}
                />
              </Tooltip>
            )}
          </Box>
        </Box>
      )}

      {nodesByDuration.length > 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Execution Time by Node
          </Typography>
          <TableContainer
            sx={{
              maxHeight: 200,
              backgroundColor: theme.vars.palette.background.paper,
              borderRadius: 1,
              border: `1px solid ${theme.vars.palette.divider}`,
            }}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ py: 0.5, px: 1 }}>Node</TableCell>
                  <TableCell align="right" sx={{ py: 0.5, px: 1 }}>
                    Duration
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodesByDuration.slice(0, 10).map((node: { id: string; label: string; duration: number }) => (
                  <TableRow
                    key={node.id}
                    sx={{
                      "&:last-child td": { borderBottom: 0 },
                      backgroundColor:
                        node.id === slowestNode?.id
                          ? theme.vars.palette.warning.light
                          : node.id === fastestNode?.id
                          ? theme.vars.palette.success.light
                          : "inherit",
                    }}
                  >
                    <TableCell
                      sx={{
                        py: 0.5,
                        px: 1,
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Tooltip title={node.label}>
                        <Typography variant="body2">
                          {node.label}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ py: 0.5, px: 1 }}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        {formatDuration(node.duration)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {nodesByDuration.length > 10 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5, textAlign: "right" }}
            >
              Showing 10 of {nodesByDuration.length} nodes
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  );
};

export const WorkflowStatsPanel = memo(WorkflowStatsPanelComponent);
