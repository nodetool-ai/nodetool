/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useState } from "react";
import {
  IconButton,
  Fab,
  Box,
  useMediaQuery,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useLocation } from "react-router-dom";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
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
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { usePanelStore } from "../../stores/PanelStore";
import { isLocalhost } from "../../stores/ApiClient";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { Workflow } from "../../stores/ApiTypes";
// keep existing colors; add only subtle shine overlays

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
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
          animation: "spin 2s linear infinite"
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
        animation:
          "pulse-glow 1.8s ease-in-out infinite, theme-shift 6s ease infinite",
        background: `radial-gradient(circle at center, ${theme.vars.palette.primary.dark} 0%, ${theme.vars.palette.primary.light} 100%)`,
        boxShadow:
          "0 0 18px var(--palette-primary-main)60, 0 0 36px var(--palette-secondary-main)40, inset 0 0 12px var(--palette-primary-main)40"
      }
    },

    ".floating-action-button.save-workflow": {
      position: "relative",
      overflow: "hidden",
      backgroundColor: "var(--palette-grey-700)",
      color: "var(--palette-grey-200)",
      boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 16px var(--palette-grey-700)25`,
      filter: "saturate(1.1)",
      "&:hover": {
        boxShadow: `0 6px 18px rgba(0,0,0,.4), 0 0 24px var(--palette-success-main)35`,
        transform: "scale(1.06)"
      },
      "&::before": {},
      "&.disabled": {
        opacity: 0.6,
        pointerEvents: "none"
      }
    },
    // Ensure disabled state doesn't dim the running run-workflow button
    ".floating-action-button.run-workflow.Mui-disabled.running": {
      opacity: 1
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
      color: theme.vars.palette.grey[900],
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
      "0%": { boxShadow: `0 0 14px ${"var(--palette-primary-main)"}60` },
      "50%": { boxShadow: `0 0 40px ${"var(--palette-primary-main)"}90` },
      "100%": { boxShadow: `0 0 14px ${"var(--palette-primary-main)"}60` }
    },
    "@keyframes theme-shift": {
      "0%": { backgroundSize: "80% 120%", backgroundPosition: "50% 50%" },
      "50%": { backgroundSize: "120% 120%", backgroundPosition: "50% 50%" },
      "100%": { backgroundSize: "80% 120%", backgroundPosition: "50% 50%" }
    },
    "@keyframes rotate-halo": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
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

const FloatingToolBar: React.FC<{
  setWorkflowToEdit: (workflow: Workflow) => void;
}> = memo(function FloatingToolBar({ setWorkflowToEdit }) {
  const theme = useTheme();
  const path = useLocation().pathname;
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<null | HTMLElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isLeftPanelVisible = usePanelStore((state) => state.panel.isVisible);
  const { isRightPanelVisible, rightPanelSize } = useRightPanelStore(
    (state) => ({
      isRightPanelVisible: state.panel.isVisible,
      rightPanelSize: state.panel.panelSize
    })
  );

  const { workflow, nodes, edges, autoLayout, workflowJSON } = useNodes(
    (state) => ({
      workflow: state.workflow,
      nodes: state.nodes,
      edges: state.edges,
      autoLayout: state.autoLayout,
      workflowJSON: state.workflowJSON
    })
  );
  const getCurrentWorkflow = useNodes((state) => state.getWorkflow);

  const { run, state, isWorkflowRunning, cancel } = useWebsocketRunner(
    (state) => ({
      run: state.run,
      state: state.state,
      isWorkflowRunning: state.state === "running",
      cancel: state.cancel
    })
  );

  const { getWorkflow: getWorkflowById, saveWorkflow } = useWorkflowManager(
    (state) => ({
      getWorkflow: state.getWorkflow,
      saveWorkflow: state.saveWorkflow
    })
  );

  const handleRun = useCallback(() => {
    if (!isWorkflowRunning) {
      run({}, workflow, nodes, edges);
    }
    setTimeout(() => {
      const w = getWorkflowById(workflow.id);
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
    getWorkflowById,
    saveWorkflow
  ]);

  const handleStop = useCallback(() => {
    cancel();
  }, [cancel]);

  const handleSave = useCallback(() => {
    if (!workflow) return;
    const w = getWorkflowById(workflow.id);
    if (w) saveWorkflow(w);
  }, [getWorkflowById, saveWorkflow, workflow]);

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

  const handleEditWorkflow = useCallback(() => {
    setWorkflowToEdit(getCurrentWorkflow());
  }, [getCurrentWorkflow, setWorkflowToEdit]);

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
      // Open centered in the viewport
      const FALLBACK_MENU_WIDTH = 950;
      const FALLBACK_MENU_HEIGHT = 900;
      const CURSOR_ANCHOR_OFFSET_Y = 40; // compensate for store's anchor shift
      const x = Math.floor(window.innerWidth / 2 - FALLBACK_MENU_WIDTH / 2);
      const y = Math.floor(
        window.innerHeight / 2 -
          FALLBACK_MENU_HEIGHT / 2 +
          CURSOR_ANCHOR_OFFSET_Y
      );
      openNodeMenu({ x, y });
    }
  }, [isMenuOpen, openNodeMenu, closeNodeMenu]);

  const handleOpenPaneMenu = useCallback(() => {
    setPaneMenuOpen(true);
  }, []);

  const handleClosePaneMenu = useCallback(() => {
    setPaneMenuOpen(false);
  }, []);

  const handleOpenActionsMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      setActionsMenuAnchor(e.currentTarget);
    },
    []
  );

  const handleCloseActionsMenu = useCallback(() => {
    setActionsMenuAnchor(null);
  }, []);

  // Only show in editor view; keep visible when right panel is open
  if (!path.startsWith("/editor") || isLeftPanelVisible) {
    return null;
  }

  return (
    <>
      <Box
        css={styles(theme)}
        className="floating-toolbar"
        style={
          isRightPanelVisible
            ? {
                left: "auto",
                transform: "none",
                right: `${Math.max(rightPanelSize + 20, 72)}px`
              }
            : undefined
        }
      >
        {isMobile && (
          <Tooltip
            title="Open canvas menu"
            enterDelay={TOOLTIP_ENTER_DELAY}
            placement="top"
          >
            <Fab
              className={`floating-action-button subtle`}
              onClick={handleOpenPaneMenu}
              aria-label="Open canvas menu"
            >
              <MoreHorizIcon />
            </Fab>
          </Tooltip>
        )}
        <Tooltip
          title={getShortcutTooltip("openNodeMenu")}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <Fab
            className={`floating-action-button node-menu`}
            onClick={handleToggleNodeMenu}
            aria-label="Open node menu"
          >
            <ControlPointIcon />
          </Fab>
        </Tooltip>
        <Tooltip
          title="Auto layout nodes"
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <Fab
            className={`floating-action-button subtle`}
            onClick={handleAutoLayout}
            aria-label="Auto layout nodes"
          >
            <LayoutIcon />
          </Fab>
        </Tooltip>
        <Tooltip
          title="More actions"
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <Fab
            className={`floating-action-button subtle`}
            onClick={handleOpenActionsMenu}
            aria-label="More actions"
          >
            <MoreVertIcon />
          </Fab>
        </Tooltip>
        <Tooltip
          title={getShortcutTooltip("saveWorkflow")}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <Fab
            className={`floating-action-button save-workflow`}
            onClick={handleSave}
            aria-label="Save workflow"
          >
            <SaveIcon />
          </Fab>
        </Tooltip>
        <Tooltip
          title={getShortcutTooltip("runWorkflow")}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <span>
            <Fab
              className={`floating-action-button run-workflow ${
                isWorkflowRunning ? "running" : ""
              }`}
              onClick={handleRun}
              disabled={isWorkflowRunning}
              aria-label="Run workflow"
            >
              <PlayArrow />
            </Fab>
          </span>
        </Tooltip>

        <Tooltip
          title={getShortcutTooltip("stopWorkflow")}
          enterDelay={TOOLTIP_ENTER_DELAY}
          placement="top"
        >
          <span>
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
          </span>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MenuItem
          onClick={() => {
            handleEditWorkflow();
            handleCloseActionsMenu();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Edit workflow settings" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleDownload();
            handleCloseActionsMenu();
          }}
        >
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Download JSON" />
        </MenuItem>
        {isLocalhost && workflow?.run_mode === "app" && (
          <MenuItem
            onClick={() => {
              handleRunAsApp();
              handleCloseActionsMenu();
            }}
          >
            <ListItemIcon>
              <RocketLaunchIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Run as standalone app" />
          </MenuItem>
        )}
      </Menu>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

export default FloatingToolBar;
