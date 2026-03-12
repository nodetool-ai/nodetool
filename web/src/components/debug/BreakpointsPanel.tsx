/**
 * BreakpointsPanel - View and manage workflow breakpoints
 *
 * EXPERIMENTAL FEATURE: Visual Debugging with Breakpoints
 *
 * This panel displays all breakpoints set in the current workflow,
 * allowing users to view, enable/disable, and remove breakpoints.
 *
 * @experimental - This is an experimental feature for visual debugging.
 */
import { memo, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Chip,
  Tooltip,
  Divider
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import BugReportIcon from "@mui/icons-material/BugReport";
import useBreakpointsStore from "../../stores/BreakpointsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNodes } from "../../contexts/NodeContext";

interface BreakpointsPanelProps {
  onNodeClick?: (nodeId: string) => void;
}

export const BreakpointsPanel: React.FC<BreakpointsPanelProps> = memo(
  function BreakpointsPanel({ onNodeClick }) {
    const currentWorkflowId = useWorkflowManager(
      (state) => state.currentWorkflowId
    );
    const nodes = useNodes((state) => state.nodes);

    const unsetBreakpoint = useBreakpointsStore((state) => state.unsetBreakpoint);
    const getWorkflowBreakpoints = useBreakpointsStore(
      (state) => state.getWorkflowBreakpoints
    );

    const workflowBreakpoints = useMemo(() => {
      if (!currentWorkflowId) {
        return [];
      }
      return getWorkflowBreakpoints(currentWorkflowId);
    }, [currentWorkflowId, getWorkflowBreakpoints]);

    const handleRemoveBreakpoint = useCallback(
      (nodeId: string) => {
        if (currentWorkflowId) {
          unsetBreakpoint(currentWorkflowId, nodeId);
        }
      },
      [currentWorkflowId, unsetBreakpoint]
    );

    const handleNodeClick = useCallback(
      (nodeId: string) => {
        if (onNodeClick) {
          onNodeClick(nodeId);
        }
      },
      [onNodeClick]
    );

    const getNodeName = useCallback(
      (nodeId: string): string => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) {
          return `Node (${nodeId.slice(0, 8)}...)`;
        }

        const nodeData = node.data;
        if (nodeData?.title) {
          return nodeData.title;
        }
        if (node?.type) {
          return node.type.replace("nodetool.", "");
        }
        return `Node (${nodeId.slice(0, 8)}...)`;
      },
      [nodes]
    );

    if (!currentWorkflowId) {
      return (
        <Box
          sx={{
            p: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "text.secondary"
          }}
        >
          <BugReportIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography variant="body2">
            No workflow selected
          </Typography>
        </Box>
      );
    }

    if (workflowBreakpoints.length === 0) {
      return (
        <Box
          sx={{
            p: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "text.secondary"
          }}
        >
          <BugReportIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
          <Typography variant="body2" gutterBottom>
            No breakpoints set
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Right-click a node and select &quot;Toggle Breakpoint&quot;
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box
          sx={{
            p: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <BugReportIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2" fontWeight="medium">
              Breakpoints
            </Typography>
          </Box>
          <Chip
            label={workflowBreakpoints.length}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>

        <List sx={{ flex: 1, overflow: "auto", py: 0 }}>
          {workflowBreakpoints.map((breakpoint, index) => (
            <div key={breakpoint.nodeId}>
              <ListItem
                disablePadding
                secondaryAction={
                  <Tooltip title="Remove breakpoint">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleRemoveBreakpoint(breakpoint.nodeId)}
                      sx={{ mr: 0.5 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemButton
                  dense
                  onClick={() => handleNodeClick(breakpoint.nodeId)}
                  sx={{ py: 1 }}
                >
                  <ListItemText
                    primary={getNodeName(breakpoint.nodeId)}
                    primaryTypographyProps={{
                      variant: "body2",
                      fontWeight: "medium"
                    }}
                    secondary={`ID: ${breakpoint.nodeId.slice(0, 8)}...`}
                    secondaryTypographyProps={{
                      variant: "caption",
                      color: "text.secondary"
                    }}
                  />
                </ListItemButton>
              </ListItem>
              {index < workflowBreakpoints.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </Box>
    );
  }
);

export default BreakpointsPanel;
