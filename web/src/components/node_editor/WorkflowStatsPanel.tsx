import React from "react";
import {
  Box,
  Typography,
  Paper,
  Tooltip,
  IconButton,
  Collapse,
  useTheme,
  Divider,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  AccountTree as TopologyIcon,
  Storage as NodeIcon,
  CallSplit as EdgeIcon,
  Input as InputIcon,
  Output as OutputIcon,
  Settings as ProcessIcon,
  Layers as GroupIcon,
} from "@mui/icons-material";
import useWorkflowStats from "../../hooks/useWorkflowStats";

interface WorkflowStatsPanelProps {
  open?: boolean;
  onToggle?: () => void;
}

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tooltip?: string;
}

const StatItem: React.FC<StatItemProps> = ({
  icon,
  label,
  value,
  tooltip,
}) => {
  const content = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.5,
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center" }}>
        {icon}
      </Box>
      <Typography variant="body2" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{content}</Tooltip>;
  }

  return content;
};

const WorkflowStatsPanel: React.FC<WorkflowStatsPanelProps> = ({
  open = true,
  onToggle,
}) => {
  const theme = useTheme();
  const { stats } = useWorkflowStats();

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: "absolute",
        bottom: theme.spacing(2),
        left: theme.spacing(2),
        width: 280,
        maxHeight: open ? 400 : 48,
        overflow: "hidden",
        bgcolor: "background.paper",
        borderRadius: 2,
        border: `1px solid ${theme.vars.palette.divider}`,
        transition: theme.transitions.create("max-height"),
        zIndex: 100,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          bgcolor: "action.hover",
          cursor: onToggle ? "pointer" : "default",
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TopologyIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={600}>
            Workflow Statistics
          </Typography>
        </Box>
        {onToggle && (
          <IconButton size="small">
            <ExpandMoreIcon
              sx={{
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: theme.transitions.create("transform"),
              }}
            />
          </IconButton>
        )}
      </Box>

      <Collapse in={open}>
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <StatItem
              icon={<NodeIcon fontSize="small" />}
              label="Total Nodes"
              value={stats.nodeCount}
              tooltip="Total number of nodes in the workflow"
            />
            <StatItem
              icon={<EdgeIcon fontSize="small" />}
              label="Connections"
              value={stats.edgeCount}
              tooltip="Total number of connections between nodes"
            />
            <StatItem
              icon={<InputIcon fontSize="small" />}
              label="Inputs"
              value={stats.inputNodeCount}
              tooltip="Number of input nodes"
            />
            <StatItem
              icon={<OutputIcon fontSize="small" />}
              label="Outputs"
              value={stats.outputNodeCount}
              tooltip="Number of output nodes"
            />
            <StatItem
              icon={<ProcessIcon fontSize="small" />}
              label="Processing"
              value={stats.processingNodeCount}
              tooltip="Number of processing nodes (transform, model, etc.)"
            />
            <StatItem
              icon={<GroupIcon fontSize="small" />}
              label="Groups"
              value={stats.groupNodeCount}
              tooltip="Number of group containers"
            />
          </Box>

          <Divider sx={{ my: 1.5 }} />

          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Connectivity
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
            <StatItem
              icon={<NodeIcon fontSize="small" />}
              label="Connected"
              value={stats.connectedNodeCount}
              tooltip="Nodes with at least one incoming connection"
            />
            <StatItem
              icon={<NodeIcon fontSize="small" />}
              label="Disconnected"
              value={stats.disconnectedNodeCount}
              tooltip="Nodes with no incoming connections"
            />
            <StatItem
              icon={<TopologyIcon fontSize="small" />}
              label="Density"
              value={formatPercentage(stats.connectionDensity)}
              tooltip="Ratio of actual connections to maximum possible connections"
            />
            <StatItem
              icon={<TopologyIcon fontSize="small" />}
              label="Max Depth"
              value={stats.maxConnectionDepth}
              tooltip="Maximum number of nodes in the longest path"
            />
          </Box>

          {stats.selectedNodeCount > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Selection
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                <StatItem
                  icon={<NodeIcon fontSize="small" />}
                  label="Selected"
                  value={stats.selectedNodeCount}
                  tooltip="Number of currently selected nodes"
                />
              </Box>
            </>
          )}

          {stats.groupNodeCount > 0 && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Groups
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                <StatItem
                  icon={<GroupIcon fontSize="small" />}
                  label="Avg Nodes/Group"
                  value={stats.averageNodesPerGroup.toFixed(1)}
                  tooltip="Average number of nodes inside each group"
                />
              </Box>
            </>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default WorkflowStatsPanel;
