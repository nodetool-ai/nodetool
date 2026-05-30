/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo } from "react";
import { Box } from "../ui_primitives";
import { useLocation } from "react-router-dom";
import { useCombo } from "../../stores/KeyPressedStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useFloatingToolbarActions } from "../../hooks/useFloatingToolbarActions";
import { useFloatingToolbarPosition } from "../../hooks/useFloatingToolbarPosition";
import CanvasMediaComposer from "./CanvasMediaComposer";
import { useShallow } from "zustand/react/shallow";

const containerStyles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: theme.zIndex.drawer,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    width: "min(720px, calc(100vw - 32px))",
    // Let canvas interactions pass through the empty gap; the composer card
    // re-enables pointer events for itself.
    pointerEvents: "none",
    "& > *": {
      pointerEvents: "auto"
    }
  });

const FloatingToolBar: React.FC = memo(function FloatingToolBar() {
  const theme = useTheme();
  const location = useLocation();
  const path = location.pathname;

  // Controls pill is hidden; only the keyboard shortcuts for run/stop remain so
  // the canvas composer stays the sole on-screen control.
  const { handleRun, handleStop, isWorkflowRunning, isPaused, isSuspended } =
    useFloatingToolbarActions();

  const { bottomPanelVisible, bottomPanelSize } = useBottomPanelStore(
    useShallow((state) => ({
      bottomPanelVisible: state.panel.isVisible,
      bottomPanelSize: state.panel.panelSize
    }))
  );

  const toolbarPosition = useFloatingToolbarPosition(
    bottomPanelVisible,
    bottomPanelSize
  );

  // Always active: while a run is in progress, the shortcut queues another run.
  useCombo(["control", "enter"], handleRun, true);
  useCombo(["meta", "enter"], handleRun, true);
  useCombo(
    ["escape"],
    handleStop,
    true,
    isWorkflowRunning || isPaused || isSuspended
  );

  // Shown in the legacy editor (/editor) and the unified workspace (/workspace).
  // In the workspace it only mounts inside WorkflowEditorSurface, i.e. an active
  // workflow tab in Edit mode, so this guard just excludes unrelated routes.
  if (!path.startsWith("/editor") && !path.startsWith("/workspace")) {
    return null;
  }

  return (
    <Box css={containerStyles(theme)} style={toolbarPosition}>
      <CanvasMediaComposer />
    </Box>
  );
});

FloatingToolBar.displayName = "FloatingToolBar";

export default FloatingToolBar;
