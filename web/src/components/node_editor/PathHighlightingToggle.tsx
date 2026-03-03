/**
 * PathHighlightingToggle - Toggle button for workflow execution path highlighting.
 *
 * This component provides a toggle button in the node editor that enables/disables
 * the experimental path highlighting feature. When enabled, nodes and edges that
 * have executed are visually highlighted to help users understand data flow.
 *
 * @experimental Part of the workflow path highlighting experimental feature.
 */

import { memo } from "react";
import { Tooltip, IconButton, toggleButtonClasses } from "@mui/material";
import { Timeline } from "@mui/icons-material";
import usePathHighlightingStore from "../../stores/PathHighlightingStore";
import { useTheme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";

export const PathHighlightingToggle = memo(() => {
  const theme = useTheme();

  // Use selective subscription to avoid unnecessary re-renders
  const { enabled, setEnabled } = usePathHighlightingStore(
    (state) => ({
      enabled: state.enabled,
      setEnabled: state.setEnabled
    }),
    shallow
  );

  const handleToggle = () => {
    setEnabled(!enabled);
  };

  return (
    <Tooltip
      title={
        enabled
          ? "Path highlighting enabled - executed nodes are highlighted"
          : "Path highlighting disabled - click to enable execution path visualization"
      }
      placement="left"
      arrow
    >
      <IconButton
        size="small"
        onClick={handleToggle}
        sx={{
          position: "absolute",
          bottom: 100,
          right: 16,
          zIndex: 5,
          backgroundColor: enabled
            ? theme.vars.palette.primary.main + "20"
            : theme.vars.palette.background.paper,
          border: `1px solid ${enabled ? theme.vars.palette.primary.main : theme.vars.palette.divider}`,
          color: enabled ? theme.vars.palette.primary.main : theme.vars.palette.text.secondary,
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: enabled
              ? theme.vars.palette.primary.main + "30"
              : theme.vars.palette.action.hover,
            transform: "scale(1.05)"
          },
          [`&.${toggleButtonClasses.disabled}`]: {
            opacity: 0.5
          }
        }}
      >
        <Timeline fontSize="small" />
      </IconButton>
    </Tooltip>
  );
});

PathHighlightingToggle.displayName = "PathHighlightingToggle";

export default PathHighlightingToggle;
