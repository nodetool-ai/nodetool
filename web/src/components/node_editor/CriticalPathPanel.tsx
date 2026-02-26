/**
 * Critical Path Panel Component
 *
 * Displays information about the execution critical path.
 * Shows total duration, node count, and list of nodes on the critical path.
 *
 * @experimental
 */

import React, { memo, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  Stack,
  Alert
} from "@mui/material";
import {
  Speed as SpeedIcon,
  AccessTime as TimeIcon,
  Route as RouteIcon
} from "@mui/icons-material";
import { CriticalPathResult, formatCriticalPathDuration } from "../../utils/executionCriticalPath";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

export interface CriticalPathPanelProps {
  /** The critical path analysis result */
  criticalPath: CriticalPathResult | null;
  /** All nodes in the workflow (for displaying names) */
  nodes: Node<NodeData>[];
}

/**
 * Critical Path Panel Component
 *
 * Shows detailed information about the execution critical path.
 * Displays in a panel format suitable for sidebars or dialogs.
 */
const CriticalPathPanel: React.FC<CriticalPathPanelProps> = memo(
  function CriticalPathPanel({ criticalPath, nodes }) {
    const criticalPathNodes = useMemo(() => {
      if (!criticalPath) {
        return [];
      }

      return Array.from(criticalPath.nodeIds)
        .map(id => nodes.find(n => n.id === id))
        .filter((n): n is Node<NodeData> => n !== undefined);
    }, [criticalPath, nodes]);

    if (!criticalPath || criticalPath.nodeCount === 0) {
      return (
        <Paper
          sx={{
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            height: "100%"
          }}
        >
          <Alert severity="info" variant="outlined">
            <Typography variant="body2">
              No execution data available. Run the workflow to see critical path analysis.
            </Typography>
          </Alert>
        </Paper>
      );
    }

    return (
      <Paper
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          height: "100%",
          overflow: "auto"
        }}
      >
        {/* Header with summary */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <RouteIcon color="warning" fontSize="small" />
            <Typography variant="subtitle2" fontWeight="bold">
              Critical Path
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            The longest execution chain that determines total workflow time
          </Typography>
        </Box>

        {/* Summary statistics */}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip
            icon={<TimeIcon fontSize="small" />}
            label={formatCriticalPathDuration(criticalPath.totalDuration)}
            color="warning"
            variant="outlined"
            size="small"
          />
          <Chip
            icon={<SpeedIcon fontSize="small" />}
            label={`${criticalPath.nodeCount} nodes`}
            color="info"
            variant="outlined"
            size="small"
          />
        </Stack>

        <Divider />

        {/* Node list */}
        <Box sx={{ flex: 1, overflow: "auto" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Critical path nodes (in execution order):
          </Typography>
          <List dense disablePadding>
            {criticalPathNodes.map((node, index) => (
              <ListItem
                key={node.id}
                disableGutters
                disablePadding
                sx={{
                  pl: 0,
                  py: 0.5,
                  borderRadius: 1,
                  "&:hover": {
                    bgcolor: "action.hover"
                  }
                }}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: "warning.main",
                    color: "warning.contrastText",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: "bold",
                    mr: 1,
                    flexShrink: 0
                  }}
                >
                  {index + 1}
                </Box>
                <ListItemText
                  primary={node.data.title || node.type?.split(".").pop() || "Node"}
                  secondary={node.type?.split(".").pop()}
                  primaryTypographyProps={{
                    variant: "body2",
                    fontWeight: 500,
                    noWrap: true
                  }}
                  secondaryTypographyProps={{
                    variant: "caption",
                    color: "text.secondary",
                    noWrap: true
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Footer note */}
        <Alert severity="info" variant="outlined" sx={{ mt: "auto" }}>
          <Typography variant="caption">
            Nodes on the critical path are highlighted with a warning badge.
            Optimizing these nodes will have the greatest impact on total execution time.
          </Typography>
        </Alert>
      </Paper>
    );
  }
);

export default CriticalPathPanel;
