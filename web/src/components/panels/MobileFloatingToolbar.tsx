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
      backgroundColor: theme.vars.palette.grey[800],
      color: "var(--palette-primary-main)",
      border: `2px solid ${theme.vars.palette.grey[600]}`,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      backdropFilter: "blur(2px)",
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
        fontSize: "28px",
        position: "relative",
        zIndex: 1
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
      backgroundImage: [
        `linear-gradient(135deg, ${"var(--palette-primary-main)"}33, ${
          theme.vars.palette.grey[800]
        } 50%, ${"var(--palette-secondary-main)"}33)`,
        "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.25) 1px, transparent 2px)",
        "radial-gradient(circle at 70% 60%, rgba(255,255,255,0.2) 1px, transparent 2px)",
        `repeating-linear-gradient(135deg, ${"var(--palette-primary-main)"}10 0px, ${"var(--palette-primary-main)"}10 2px, transparent 2px, transparent 8px)`
      ].join(","),
      backgroundSize: "auto, 140px 140px, 120px 120px, 300px 300px",
      backgroundPosition: "center, 0 0, 60px 40px, 0 0",
      backgroundBlendMode: "soft-light, normal, normal, soft-light",
      boxShadow: `0 0 0 0 ${"var(--palette-primary-main)"}40`,
      filter: "none",
      "&:hover": {
        boxShadow: `0 10px 28px ${"var(--palette-primary-main)"}40, 0 0 36px ${"var(--palette-secondary-main)"}30`,
        filter: "none",
        transform: "scale(1.06)",
        "&::before": { left: "120%" }
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: 0,
        left: "-150%",
        width: "120%",
        height: "100%",
        background:
          "linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent)",
        transform: "skewX(-20deg)",
        transition: "left 0.6s ease",
        pointerEvents: "none"
      },
      "&.running": {
        animation:
          "pulse-glow 1.8s ease-in-out infinite, twinkle-shift 6s linear infinite",
        boxShadow: `0 0 18px 3px ${"var(--palette-primary-main)"}55, 0 0 42px ${"var(--palette-secondary-main)"}45`,
        borderColor: "var(--palette-primary-main)",
        filter: "saturate(1.25) brightness(1.1)",
        "&::before": {
          animation: "shine-sweep 1.8s linear infinite"
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: -3,
          borderRadius: "inherit",
          pointerEvents: "none",
          background: [
            `conic-gradient(from 0deg, ${"var(--palette-primary-main)"} 0deg, ${"var(--palette-secondary-main)"} 60deg, ${"var(--palette-primary-main)"} 120deg, ${"var(--palette-secondary-main)"} 180deg, ${"var(--palette-primary-main)"} 240deg, ${"var(--palette-secondary-main)"} 300deg, ${"var(--palette-primary-main)"} 360deg)`,
            "radial-gradient(circle at 35% 45%, rgba(255,255,255,0.5) 1px, transparent 2px)",
            "radial-gradient(circle at 65% 70%, rgba(255,255,255,0.5) 1px, transparent 2px)"
          ].join(","),
          backgroundSize: "auto, 120px 120px, 140px 140px",
          backgroundPosition: "center, 0 0, 80px 60px",
          opacity: 0.6,
          zIndex: 0,
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          animation:
            "rotate-halo 3.5s linear infinite, sparkle 1.6s linear infinite",
          mixBlendMode: "screen",
          filter: "saturate(1.35) brightness(1.1)"
        }
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

const MobileFloatingToolbar: React.FC = memo(function MobileFloatingToolbar() {
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
      <Box css={styles(theme)} className="mobile-floating-toolbar">
        {isMobile && (
          <Fab
            className={`floating-action-button`}
            onClick={handleOpenPaneMenu}
            aria-label="Open canvas menu"
          >
            <MoreHorizIcon />
          </Fab>
        )}
        <Fab
          className={`floating-action-button`}
          onClick={handleToggleNodeMenu}
          aria-label="Open node menu"
        >
          <ControlPointIcon />
        </Fab>
        <Fab
          className={`floating-action-button`}
          onClick={handleAutoLayout}
          aria-label="Auto layout nodes"
        >
          <LayoutIcon />
        </Fab>
        <Fab
          className={`floating-action-button`}
          onClick={handleSave}
          aria-label="Save workflow"
        >
          <SaveIcon />
        </Fab>
        <Fab
          className={`floating-action-button`}
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
          className={`floating-action-button ${
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
            className={`floating-action-button`}
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

export default MobileFloatingToolbar;
