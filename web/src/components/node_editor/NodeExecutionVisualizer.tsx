import { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Tooltip } from "@mui/material";
import isEqual from "lodash/isEqual";
import type { Node } from "@xyflow/react";

import { useDebugPanelStore } from "../../stores/DebugPanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface NodeExecutionVisualizerProps {
  workflowId: string;
}

const styles = (theme: Theme) =>
  ({
    overlay: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: ("none" as const),
      zIndex: 10
    },
    nodeOverlay: {
      position: "absolute" as const,
      borderRadius: "4px",
      border: "2px solid",
      transition: "all 0.2s ease",
      pointerEvents: ("auto" as const)
    },
    breakpoint: {
      position: "absolute" as const,
      top: "-8px",
      right: "-8px",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: "#f44336",
      border: "2px solid white",
      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 20
    },
    executionBadge: {
      position: "absolute" as const,
      bottom: "-20px",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "10px",
      padding: "2px 6px",
      borderRadius: "4px",
      whiteSpace: "nowrap" as const,
      fontFamily: "monospace"
    }
  });

const NodeExecutionVisualizer: React.FC<NodeExecutionVisualizerProps> = memo(
  ({ workflowId }) => {
    const theme = useTheme();

    const isDebugMode = useDebugPanelStore((state) => state.isDebugMode);
    const breakpoints = useDebugPanelStore((state) => state.breakpoints);
    const toggleBreakpoint = useDebugPanelStore((state) => state.toggleBreakpoint);

    const workflowManagerState = useWorkflowManager((state) => state);
    const getNodeStoreFn = (workflowManagerState as unknown as { getNodeStore?: (id: string) => { getState: () => { nodes: Node[] } } }).getNodeStore;
    const nodeStore = getNodeStoreFn ? getNodeStoreFn(workflowId) : null;
    const nodes = nodeStore ? nodeStore.getState().nodes : [];

    // Don't render if not in debug mode
    if (!isDebugMode) {
      return null;
    }

    return (
      <Box className="overlay" style={styles(theme).overlay}>
        {nodes.map((node: Node) => {
          const position = node.position;
          const width = node.width || 180;
          const height = node.height || 80;
          const bp = breakpoints.find((b) => b.nodeId === node.id);
          const hasBp = !!bp;
          const isSelected = node.selected;

          return (
            <Box
              key={node.id}
              className="node-overlay"
              sx={{
                ...styles(theme).nodeOverlay,
                left: position.x,
                top: position.y,
                width,
                height,
                borderColor: hasBp
                  ? "#f44336"
                  : isSelected
                  ? theme.vars.palette.primary.main
                  : theme.vars.palette.grey[600],
                backgroundColor: hasBp
                  ? "rgba(244, 67, 54, 0.1)"
                  : "transparent"
              }}
            >
              {hasBp && (
                <Tooltip
                  title={`Breakpoint on ${node.id}`}
                  placement="top"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <Box
                    sx={styles(theme).breakpoint}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      toggleBreakpoint(node.id);
                    }}
                  >
                    <Box
                      sx={{
                        width: "6px",
                        height: "6px",
                        backgroundColor: "white",
                        borderRadius: "50%"
                      }}
                    />
                  </Box>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Box>
    );
  },
  (prev, next) => prev.workflowId === next.workflowId
);

NodeExecutionVisualizer.displayName = "NodeExecutionVisualizer";

export default NodeExecutionVisualizer;
