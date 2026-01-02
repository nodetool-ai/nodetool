/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useState } from "react";
import {
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
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import { useLocation, useNavigate } from "react-router-dom";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCombo } from "../../stores/KeyPressedStore";
import AddIcon from "@mui/icons-material/Add";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MobilePaneMenu from "../menus/MobilePaneMenu";
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import TerminalIcon from "@mui/icons-material/Terminal";
import DownloadIcon from "@mui/icons-material/Download";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { Workflow } from "../../stores/ApiTypes";
import { cn } from "../editor_ui/editorUtils";

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label?: string;
  tooltip: string;
  shortcut?: string;
  variant?: "primary" | "secondary" | "neutral" | "stop";
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = memo(function ToolbarButton({
  icon,
  label,
  tooltip,
  shortcut,
  variant = "neutral",
  className,
  onClick,
  disabled,
  "aria-label": ariaLabel
}) {
  const title = shortcut ? getShortcutTooltip(shortcut) : tooltip;

  return (
    <Tooltip
      title={title}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="top"
    >
      <Fab
        className={cn(
          "floating-action-button",
          variant,
          className,
          disabled && "disabled"
        )}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel || tooltip}
        disableRipple
      >
        {icon}
      </Fab>
    </Tooltip>
  );
});

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: theme.zIndex.drawer,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    padding: "6px 12px",
    backgroundColor: theme.vars.palette.grey[900],
    borderRadius: "16px",
    border: `1px solid ${theme.vars.palette.grey[700]}`,
    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.4)`,

    ".floating-action-button": {
      width: "44px",
      height: "44px",
      position: "relative",
      borderRadius: "10px",
      border: "none",
      boxShadow: "none",
      transition: "all 0.15s ease-out",

      "& svg": {
        fontSize: "22px"
      },

      "&:hover": {
        transform: "scale(1.05)"
      },

      "&:active": {
        transform: "scale(0.95)"
      }
    },

    ".floating-action-button.primary": {
      backgroundColor: theme.vars.palette.primary.main,
      color: "#0B1220",
      borderRadius: "10px",
      boxShadow: `0 4px 12px rgba(59, 130, 246, 0.3)`,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.light,
        boxShadow: `0 6px 16px rgba(59, 130, 246, 0.4)`
      },
      "&.running": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200],
        boxShadow: "none",
        "& svg": {
          animation: "pulse-scale 1s ease-in-out infinite"
        }
      }
    },

    ".floating-action-button.secondary": {
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[300],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[100]
      }
    },

    ".floating-action-button.neutral": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200]
      }
    },

    ".floating-action-button.disabled": {
      opacity: 0.4,
      pointerEvents: "none"
    },

    ".floating-action-button.stop": {
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[500],
      "&:hover": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText
      },
      "&.active": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText
      }
    },

    "@keyframes pulse-scale": {
      "0%": { transform: "scale(1)" },
      "50%": { transform: "scale(1.1)" },
      "100%": { transform: "scale(1)" }
    }
  });

const FloatingToolBar: React.FC<{
  setWorkflowToEdit: (workflow: Workflow) => void;
}> = memo(function FloatingToolBar({ setWorkflowToEdit }) {
  const theme = useTheme();
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<null | HTMLElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { isRightPanelVisible, rightPanelSize } = useRightPanelStore(
    (state) => ({
      isRightPanelVisible: state.panel.isVisible,
      rightPanelSize: state.panel.panelSize
    })
  );
  const bottomPanelVisible = useBottomPanelStore(
    (state) => state.panel.isVisible
  );
  const bottomPanelSize = useBottomPanelStore((state) => state.panel.panelSize);
  const toggleBottomPanel = useBottomPanelStore(
    (state) => state.handleViewChange
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

  const { run, isWorkflowRunning, isPaused, isSuspended, cancel, pause, resume } = useWebsocketRunner(
    (state) => ({
      run: state.run,
      isWorkflowRunning: state.state === "running",
      isPaused: state.state === "paused",
      isSuspended: state.state === "suspended",
      cancel: state.cancel,
      pause: state.pause,
      resume: state.resume
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
      run({}, workflow, nodes, edges, undefined);
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

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleResume = useCallback(() => {
    resume();
  }, [resume]);

  useCombo(["control", "enter"], handleRun, true, !isWorkflowRunning);
  useCombo(["meta", "enter"], handleRun, true, !isWorkflowRunning);
  useCombo(["escape"], handleStop, true, isWorkflowRunning || isPaused || isSuspended);

  const handleSave = useCallback(() => {
    if (!workflow) {
      return;
    }
    const w = getWorkflowById(workflow.id);
    if (w) {
      saveWorkflow(w);
    }
  }, [getWorkflowById, saveWorkflow, workflow]);

  const handleDownload = useCallback(() => {
    if (!workflow) {
      return;
    }
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

  const handleOpenInMiniApp = useCallback(() => {
    if (!workflow?.id) {
      return;
    }
    navigate(`/apps/${workflow.id}`);
  }, [navigate, workflow?.id]);

  const handleRunAsApp = useCallback(() => {
    const workflowId = path.split("/").pop();
    if (workflowId) {
      navigate(`/apps/${workflowId}`);
    }
  }, [navigate, path]);

  const handleEditWorkflow = useCallback(() => {
    setWorkflowToEdit(getCurrentWorkflow());
  }, [getCurrentWorkflow, setWorkflowToEdit]);

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
      const FALLBACK_MENU_WIDTH = 950;
      const FALLBACK_MENU_HEIGHT = 900;
      const CURSOR_ANCHOR_OFFSET_Y = 40;
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

  const handleToggleTerminal = useCallback(() => {
    toggleBottomPanel("terminal");
  }, [toggleBottomPanel]);

  if (!path.startsWith("/editor")) {
    return null;
  }

  return (
    <>
      <Box
        css={styles(theme)}
        className="floating-toolbar"
        style={{
          ...(isRightPanelVisible
            ? {
                left: "auto",
                transform: "none",
                right: `${Math.max(rightPanelSize + 20, 72)}px`
              }
            : {}),
          bottom: bottomPanelVisible
            ? `${Math.max(
                Math.min(
                  bottomPanelSize,
                  typeof window !== "undefined"
                    ? Math.max(200, window.innerHeight * 0.6)
                    : bottomPanelSize
                ) + 20,
                80
              )}px`
            : "20px"
        }}
      >
        {isMobile && (
          <ToolbarButton
            icon={<MoreHorizIcon />}
            tooltip="Menu"
            variant="neutral"
            onClick={handleOpenPaneMenu}
            aria-label="Open canvas menu"
          />
        )}

        <ToolbarButton
          icon={<AddIcon />}
          tooltip="Add Node"
          shortcut="openNodeMenu"
          variant="secondary"
          onClick={handleToggleNodeMenu}
          aria-label="Add node"
        />
        <ToolbarButton
          icon={<LayoutIcon />}
          tooltip="Auto Layout"
          variant="neutral"
          onClick={handleAutoLayout}
          aria-label="Auto layout nodes"
        />
        <ToolbarButton
          icon={<SaveIcon />}
          tooltip="Save"
          shortcut="saveWorkflow"
          variant="neutral"
          onClick={handleSave}
          aria-label="Save workflow"
        />
        <ToolbarButton
          icon={<MoreVertIcon />}
          tooltip="More"
          variant="neutral"
          onClick={handleOpenActionsMenu}
          aria-label="More actions"
        />

        {(isPaused || isSuspended) && (
          <ToolbarButton
            icon={<PlayCircleIcon />}
            tooltip="Resume"
            variant="secondary"
            onClick={handleResume}
            aria-label="Resume workflow"
          />
        )}

        <ToolbarButton
          icon={<StopIcon />}
          tooltip="Stop (interrupt execution)"
          shortcut="stopWorkflow"
          variant="stop"
          className={isWorkflowRunning ? "active" : undefined}
          disabled={!(isWorkflowRunning || isPaused || isSuspended)}
          onClick={handleStop}
          aria-label="Stop workflow"
        />

        <ToolbarButton
          icon={<PlayArrow />}
          tooltip={isWorkflowRunning ? "Running..." : "Run"}
          shortcut="runWorkflow"
          variant="primary"
          onClick={handleRun}
          disabled={isWorkflowRunning}
          aria-label="Run workflow"
        />
      </Box>

      <Menu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: { minWidth: "200px", maxWidth: "280px" }
          }
        }}
      >
        <MenuItem
          onClick={() => {
            handleToggleTerminal();
            handleCloseActionsMenu();
          }}
        >
          <ListItemIcon>
            <TerminalIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={bottomPanelVisible ? "Hide Terminal" : "Show Terminal"}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleEditWorkflow();
            handleCloseActionsMenu();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Workflow Settings" />
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
        <MenuItem
          onClick={() => {
            handleRunAsApp();
            handleCloseActionsMenu();
          }}
        >
          <ListItemIcon>
            <RocketLaunchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Run as App" />
        </MenuItem>
      </Menu>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

export default FloatingToolBar;
