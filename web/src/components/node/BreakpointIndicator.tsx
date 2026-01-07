/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, Box } from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useNodes } from "../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "-8px",
    right: "-8px",
    zIndex: 100,
    cursor: "pointer",
    transition: "transform 0.1s ease",
    "&:hover": {
      transform: "scale(1.2)"
    },
    ".breakpoint-icon": {
      color: theme.vars.palette.error.main,
      filter: `drop-shadow(0 0 3px ${theme.vars.palette.error.main})`,
      "&.has-breakpoint": {
        color: theme.vars.palette.error.main
      },
      "&.current": {
        color: theme.vars.palette.warning.main,
        filter: `drop-shadow(0 0 5px ${theme.vars.palette.warning.main})`,
        animation: "pulse 1s ease-in-out infinite"
      }
    },
    "@keyframes pulse": {
      "0%": { opacity: 1 },
      "50%": { opacity: 0.5 },
      "100%": { opacity: 1 }
    }
  });

interface BreakpointIndicatorProps {
  nodeId: string;
}

const BreakpointIndicator: React.FC<BreakpointIndicatorProps> = ({ nodeId }) => {
  const theme = useTheme();

  const { breakpoints, currentNodeId, toggleBreakpoint } = useWebsocketRunner(
    (s) => ({
      breakpoints: s.breakpoints,
      currentNodeId: s.currentNodeId,
      toggleBreakpoint: s.toggleBreakpoint
    })
  );

  const { selected } = useNodes((s) => ({
    selected: s.nodes.find((n) => n.id === nodeId)?.selected ?? false
  }));

  const hasBreakpoint = breakpoints.has(nodeId);
  const isCurrentNode = currentNodeId === nodeId;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleBreakpoint(nodeId);
    },
    [toggleBreakpoint, nodeId]
  );

  // Only show if selected or has breakpoint
  if (!selected && !hasBreakpoint) {
    return null;
  }

  return (
    <Box
      css={styles(theme)}
      onClick={handleClick}
      className="breakpoint-indicator"
    >
      <Tooltip
        title={
          hasBreakpoint
            ? "Remove Breakpoint (click to toggle)"
            : "Add Breakpoint (click to toggle)"
        }
        placement="top"
      >
        <FiberManualRecordIcon
          className={`breakpoint-icon ${hasBreakpoint ? "has-breakpoint" : ""} ${
            isCurrentNode ? "current" : ""
          }`}
          sx={{
            fontSize: hasBreakpoint ? "16px" : "12px",
            opacity: hasBreakpoint ? 1 : 0.3
          }}
        />
      </Tooltip>
    </Box>
  );
};

export default memo(BreakpointIndicator);
