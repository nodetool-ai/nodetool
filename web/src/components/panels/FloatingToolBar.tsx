/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useState } from "react";
import { IconButton, Fab, Box, useMediaQuery } from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useLocation } from "react-router-dom";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ControlPointIcon from "@mui/icons-material/ControlPoint";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MobilePaneMenu from "../menus/MobilePaneMenu";
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { isLocalhost } from "../../stores/ApiClient";
// keep existing colors; add only subtle shine overlays

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 21000,
    display: "flex",
    flexDirection: "row",
    gap: "12px",

    ".floating-action-button": {
      width: "56px",
      height: "56px",
      position: "relative",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      color: theme.vars.palette.grey[200],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
      backdropFilter: "blur(2px)",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        borderColor: theme.vars.palette.grey[600],
        transform: "scale(1.05)",
        boxShadow: `0 4px 12px rgba(0, 0, 0, 0.35)`,
        color: theme.vars.palette.grey[0]
      },

      "&:active": {
        transform: "scale(0.95)"
      },

      "& svg": {
        fontSize: "28px",
        position: "relative",
        zIndex: 1
      },

      // subtle glass shine (top highlight) — keep colors intact
      "&::before": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "55%",
        background:
          "linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.02) 60%, transparent)",
        pointerEvents: "none",
        zIndex: 0
      },
      // inner hairline highlight
      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
        pointerEvents: "none"
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

    ".floating-action-button.run-workflow": {
      position: "relative",
      overflow: "hidden",
      backgroundColor: "var(--palette-primary-main)",
      color: "#0b1220",
      borderColor: "var(--palette-primary-main)",
      boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 16px var(--palette-primary-main)20`,
      filter: "saturate(1.1)",
      "&:hover": {
        boxShadow: `0 6px 18px rgba(0,0,0,.4), 0 0 24px var(--palette-primary-main)30`,
        transform: "scale(1.06)"
      },
      // lean on base shine overlay
      "&::before": {},
      "&.running": {
        animation: "pulse-glow 1.8s ease-in-out infinite",
        filter: "saturate(1.2) brightness(1.05)"
      }
    },

    /* Subtle buttons (secondary actions) */
    ".floating-action-button.subtle": {
      backgroundColor: theme.vars.palette.grey[900],
      color: theme.vars.palette.grey[400],
      borderColor: theme.vars.palette.grey[800],
      boxShadow: "0 1px 4px rgba(0,0,0,.25)",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200]
      }
    },
    
    /* Node menu button: secondary prominent, distinct color */
    ".floating-action-button.node-menu": {
      backgroundColor: theme.vars.palette.secondary.main,
      color: theme.vars.palette.secondary.contrastText,
      borderColor: theme.vars.palette.secondary.main,
      "&:hover": {
        boxShadow: `0 6px 16px rgba(0,0,0,.35), 0 0 20px ${theme.vars.palette.secondary.main}25`,
        transform: "scale(1.05)"
      }
    },

    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    },
    "@keyframes pulse-glow": {
      "0%": { boxShadow: `0 0 8px ${"var(--palette-primary-main)"}30` },
      "50%": { boxShadow: `0 0 24px ${"var(--palette-primary-main)"}70` },
      "100%": { boxShadow: `0 0 8px ${"var(--palette-primary-main)"}30` }
    },
    "@keyframes rotate-halo": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    },
    "@keyframes sparkle": {
      "0%": { opacity: 0.35 },
      "50%": { opacity: 0.55 },
      "100%": { opacity: 0.35 }
    },
    "@keyframes shine-sweep": {
      "0%": { left: "-150%" },
      "100%": { left: "120%" }
    },
    "@keyframes twinkle-shift": {
      "0%": { backgroundPosition: "center, 0 0, 60px 40px, 0 0" },
      "50%": { backgroundPosition: "center, 20px 10px, 70px 55px, 20px 20px" },
      "100%": { backgroundPosition: "center, 40px 20px, 80px 70px, 40px 40px" }
    }
  });

const FloatingToolBar: React.FC = memo(function FloatingToolBar() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const { workflow, nodes, edges, autoLayout, workflowJSON } = useNodes(
    (state) => ({
      workflow: state.workflow,
      nodes: state.nodes,
      edges: state.edges,
      autoLayout: state.autoLayout,
      workflowJSON: state.workflowJSON
    })
  );

  const { run, state, isWorkflowRunning, cancel } = useWorkflowRunner(
    (state) => ({
      run: state.run,
      state: state.state,
      isWorkflowRunning: state.state === "running",
      cancel: state.cancel
    })
  );

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

  const handleSave = useCallback(() => {
    if (!workflow) return;
    const w = getWorkflow(workflow.id);
    if (w) saveWorkflow(w);
  }, [getWorkflow, saveWorkflow, workflow]);

  const handleDownload = useCallback(() => {
    if (!workflow) return;
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${workflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflow, workflowJSON]);

  const handleAutoLayout = useCallback(() => {
    autoLayout();
  }, [autoLayout]);

  const handleRunAsApp = useCallback(() => {
    const workflowId = path.split("/").pop();
    if (workflowId) {
      const api = (window as any)["api"] as
        | { runApp: (workflowId: string) => void }
        | undefined;
      if (api) {
        api.runApp(workflowId);
      } else {
        window.open(
          "http://localhost:5173/index.html?workflow_id=" + workflowId,
          "_blank"
        );
      }
    }
  }, [path]);

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

  const handleOpenPaneMenu = useCallback(() => {
    setPaneMenuOpen(true);
  }, []);

  const handleClosePaneMenu = useCallback(() => {
    setPaneMenuOpen(false);
  }, []);

  // Only show in editor view (visibility toggled by CSS for mobile)
  if (!path.startsWith("/editor")) {
    return null;
  }

  return (
    <>
      <Box css={styles(theme)} className="floating-toolbar">
        {isMobile && (
          <Fab
            className={`floating-action-button subtle`}
            onClick={handleOpenPaneMenu}
            aria-label="Open canvas menu"
          >
            <MoreHorizIcon />
          </Fab>
        )}
        <Fab
          className={`floating-action-button node-menu`}
          onClick={handleToggleNodeMenu}
          aria-label="Open node menu"
        >
          <ControlPointIcon />
        </Fab>
        <Fab
          className={`floating-action-button subtle`}
          onClick={handleAutoLayout}
          aria-label="Auto layout nodes"
        >
          <LayoutIcon />
        </Fab>
        <Fab
          className={`floating-action-button subtle`}
          onClick={handleSave}
          aria-label="Save workflow"
        >
          <SaveIcon />
        </Fab>
        <Fab
          className={`floating-action-button subtle`}
          onClick={handleDownload}
          aria-label="Download workflow JSON"
        >
          <DownloadIcon />
        </Fab>
        <Fab
          className={`floating-action-button run-workflow ${
            isWorkflowRunning ? "running" : ""
          } ${isWorkflowRunning ? "disabled" : ""}`}
          onClick={handleRun}
          disabled={isWorkflowRunning}
          aria-label="Run workflow"
        >
          <PlayArrow />
        </Fab>

        <Fab
          className={`floating-action-button subtle ${
            !isWorkflowRunning ? "disabled" : ""
          }`}
          onClick={handleStop}
          disabled={!isWorkflowRunning}
          aria-label="Stop workflow"
        >
          <StopIcon />
        </Fab>
        {isLocalhost && workflow?.run_mode === "app" && (
          <Fab
            className={`floating-action-button subtle`}
            onClick={handleRunAsApp}
            aria-label="Run as App"
          >
            <RocketLaunchIcon />
          </Fab>
        )}
      </Box>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

export default FloatingToolBar;
