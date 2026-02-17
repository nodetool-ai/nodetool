import { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Popover,
  List,
  ListItem,
  ListItemText,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BarChartIcon from "@mui/icons-material/BarChart";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import useWorkflowStatsStore from "../../stores/WorkflowStatsStore";
import { useNodes } from "../../contexts/NodeContext";

interface WorkflowStatsProps {
  workflowId: string;
  visible?: boolean;
}

interface StatItem {
  label: string;
  value: string;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Returns appropriate units (ms, s, m) based on duration magnitude.
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

/**
 * Formats a timestamp to a relative time string (e.g., "2m ago").
 */
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return "just now";
  }
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
};

const WorkflowStats: React.FC<WorkflowStatsProps> = ({
  workflowId,
  visible = true
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Subscribe to stats for this workflow only
  const stats = useWorkflowStatsStore(
    useCallback(
      (state) => state.getStats(workflowId),
      [workflowId]
    )
  );

  // Subscribe to node count efficiently
  const nodeCount = useNodes(
    useCallback((state) => state.nodes.length, [])
  );

  // Subscribe to edge count efficiently
  const edgeCount = useNodes(
    useCallback((state) => state.edges.length, [])
  );

  const resetStats = useWorkflowStatsStore((state) => state.resetStats);

  const handleOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleReset = useCallback(() => {
    resetStats(workflowId);
  }, [workflowId, resetStats]);

  const open = Boolean(anchorEl);
  const id = open ? "workflow-stats-popover" : undefined;

  const statItems = useMemo<StatItem[]>(() => {
    const items: StatItem[] = [
      { label: "Nodes", value: nodeCount.toString() },
      { label: "Edges", value: edgeCount.toString() },
      { label: "Runs", value: stats.runCount.toString() }
    ];

    if (stats.averageExecutionDuration !== undefined) {
      items.push({
        label: "Avg Duration",
        value: formatDuration(stats.averageExecutionDuration)
      });
    }

    if (stats.lastExecutionTime !== undefined) {
      items.push({
        label: "Last Run",
        value: formatRelativeTime(stats.lastExecutionTime)
      });
    }

    return items;
  }, [nodeCount, edgeCount, stats]);

  const hasExecutionData = stats.runCount > 0;

  if (!visible) {
    return null;
  }

  return (
    <>
      <Box
        data-testid="workflow-stats"
        sx={{
          position: "absolute",
          bottom: 16,
          left: 20,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          backgroundColor: theme.vars.palette.Paper.paper,
          backdropFilter: "blur(8px)",
          borderRadius: "8px",
          border: `1px solid ${theme.vars.palette.divider}`,
          padding: "4px 12px",
          boxShadow: theme.shadows[4],
          userSelect: "none",
          gap: 0.5
        }}
      >
        <Tooltip title="View workflow statistics" placement="top" arrow>
          <IconButton
            onClick={handleOpen}
            size="small"
            aria-describedby={id}
            sx={{
              padding: "4px",
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.palette.primary.main
              }
            }}
          >
            <BarChartIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>

        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 500,
            color: theme.vars.palette.text.secondary,
            fontFamily: "JetBrains Mono, monospace"
          }}
        >
          {nodeCount} nodes • {edgeCount} edges
        </Typography>
      </Box>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
        PaperProps={{
          sx: {
            minWidth: 200,
            maxWidth: 280,
            borderRadius: "8px"
          }
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: theme.vars.palette.text.primary
            }}
          >
            Workflow Statistics
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {hasExecutionData && (
              <Tooltip title="Reset statistics" placement="top">
                <IconButton
                  onClick={handleReset}
                  size="small"
                  sx={{
                    padding: "4px",
                    color: theme.vars.palette.text.secondary,
                    "&:hover": {
                      backgroundColor: theme.vars.palette.action.hover,
                      color: theme.palette.error.main
                    }
                  }}
                >
                  <RestartAltIcon sx={{ fontSize: "1rem" }} />
                </IconButton>
              </Tooltip>
            )}
            <IconButton
              onClick={handleClose}
              size="small"
              sx={{
                padding: "4px",
                color: theme.vars.palette.text.secondary,
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }}
            >
              <CloseIcon sx={{ fontSize: "1rem" }} />
            </IconButton>
          </Box>
        </Box>

        <Divider />

        <List dense disablePadding>
          {statItems.map((item) => (
            <ListItem
              key={item.label}
              sx={{
                px: 2,
                py: 0.75,
                "&:hover": {
                  backgroundColor: theme.vars.palette.action.hover
                }
              }}
            >
              <ListItemText
                primary={item.label}
                secondary={item.value}
                primaryTypographyProps={{
                  fontSize: "0.75rem",
                  color: theme.vars.palette.text.secondary
                }}
                secondaryTypographyProps={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  fontFamily: "JetBrains Mono, monospace",
                  color: theme.vars.palette.text.primary
                }}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexDirection: "row",
                  "& .MuiListItemText-primary": {
                    minWidth: 100
                  },
                  "& .MuiListItemText-secondary": {
                    textAlign: "right"
                  }
                }}
              />
            </ListItem>
          ))}
        </List>

        {!hasExecutionData && (
          <>
            <Divider />
            <Box
              sx={{
                px: 2,
                py: 1.5,
                textAlign: "center"
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  fontStyle: "italic"
                }}
              >
                No execution data yet. Run this workflow to see statistics.
              </Typography>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
};

export default memo(WorkflowStats);
