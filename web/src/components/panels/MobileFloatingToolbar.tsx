/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import { IconButton, Fab, Box } from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useLocation } from "react-router-dom";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ControlPointIcon from "@mui/icons-material/ControlPoint";

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 1100,
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    
    ".floating-action-button": {
      width: "56px",
      height: "56px",
      backgroundColor: theme.vars.palette.grey[800],
      color: "var(--palette-primary-main)",
      border: `2px solid ${theme.vars.palette.grey[600]}`,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(10px)",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        borderColor: "var(--palette-primary-main)",
        transform: "scale(1.05)",
        boxShadow: `0 6px 20px rgba(0, 0, 0, 0.5), 0 0 20px ${"var(--palette-primary-main)"}30`,
        color: theme.vars.palette.grey[0]
      },
      
      "&:active": {
        transform: "scale(0.95)"
      },
      
      "& svg": {
        fontSize: "28px"
      },
      
      "&.running": {
        borderColor: "var(--palette-primary-main)",
        "& svg": {
          animation: "spin 2s linear infinite",
          color: "var(--palette-primary-main)"
        }
      },
      
      "&.disabled": {
        opacity: 0.5,
        pointerEvents: "none"
      }
    },
    
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    }
  });

const MobileFloatingToolbar: React.FC = memo(function MobileFloatingToolbar() {
  const theme = useTheme();
  const path = useLocation().pathname;
  
  const { workflow, nodes, edges } = useNodes((state) => ({
    workflow: state.workflow,
    nodes: state.nodes,
    edges: state.edges
  }));

  const { run, state, isWorkflowRunning, cancel } = useWorkflowRunner((state) => ({
    run: state.run,
    state: state.state,
    isWorkflowRunning: state.state === "running",
    cancel: state.cancel
  }));

  const { getWorkflow, saveWorkflow } = useWorkflowManager((state) => ({
    getWorkflow: state.getWorkflow,
    saveWorkflow: state.saveWorkflow
  }));

  const handleRun = useCallback(() => {
    if (!isWorkflowRunning) {
      run({}, workflow, nodes, edges);
    }
    setTimeout(() => {
      const w = getWorkflow(workflow.id);
      if (w) {
        saveWorkflow(w);
      }
    }, 100);
  }, [
    isWorkflowRunning,
    run,
    workflow,
    nodes,
    edges,
    getWorkflow,
    saveWorkflow
  ]);

  const handleStop = useCallback(() => {
    cancel();
  }, [cancel]);

  // Node menu open/close for mobile
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore(
    (state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen
    })
  );
  const handleToggleNodeMenu = useCallback(() => {
    if (isMenuOpen) {
      closeNodeMenu();
    } else {
      // Open as a bottom sheet (full-width) near the top for full-height layout
      const x = 0;
      const y = Math.max(8, Math.floor(window.innerHeight * 0.06));
      openNodeMenu({ x, y });
    }
  }, [isMenuOpen, openNodeMenu, closeNodeMenu]);

  // Only show in editor view (visibility toggled by CSS for mobile)
  if (!path.startsWith("/editor")) {
    return null;
  }

  return (
    <Box css={styles(theme)} className="mobile-floating-toolbar">
      <Fab
        className={`floating-action-button`}
        onClick={handleToggleNodeMenu}
        aria-label="Open node menu"
      >
        <ControlPointIcon />
      </Fab>
      <Fab
        className={`floating-action-button ${isWorkflowRunning ? "running" : ""} ${isWorkflowRunning ? "disabled" : ""}`}
        onClick={handleRun}
        disabled={isWorkflowRunning}
        aria-label="Run workflow"
      >
        <PlayArrow />
      </Fab>
      
      <Fab
        className={`floating-action-button ${!isWorkflowRunning ? "disabled" : ""}`}
        onClick={handleStop}
        disabled={!isWorkflowRunning}
        aria-label="Stop workflow"
      >
        <StopIcon />
      </Fab>
    </Box>
  );
});

export default MobileFloatingToolbar;
