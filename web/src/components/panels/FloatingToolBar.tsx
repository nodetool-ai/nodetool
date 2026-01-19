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
import BoltIcon from "@mui/icons-material/Bolt";
import { useLocation, useNavigate } from "react-router-dom";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../../stores/SettingsStore";

import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCombo } from "../../stores/KeyPressedStore";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MobilePaneMenu from "../menus/MobilePaneMenu";
import LayoutIcon from "@mui/icons-material/ViewModule";
import MapIcon from "@mui/icons-material/Map";
import SaveIcon from "@mui/icons-material/Save";
import TerminalIcon from "@mui/icons-material/Terminal";
import DownloadIcon from "@mui/icons-material/Download";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { cn } from "../editor_ui/editorUtils";

interface ToolbarButtonProps {
  icon: React.ReactNode;
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
  tooltip,
  shortcut,
  variant = "neutral",
  className,
  onClick,
  disabled,
  "aria-label": ariaLabel
}) {
  const title = shortcut ? getShortcutTooltip(shortcut) : tooltip;

  const fabElement = (
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
  );

  return (
    <Tooltip
      title={title}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="top"
    >
      {disabled ? <span style={{ display: "inline-flex" }}>{fabElement}</span> : fabElement}
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
    padding: "8px 12px",
    backgroundColor: theme.vars.palette.grey[900],
    borderRadius: "16px",
    border: `1px solid ${theme.vars.palette.grey[700]}`,
    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.1)`,

    ".floating-action-button": {
      width: "44px",
      height: "44px",
      position: "relative",
      borderRadius: "16px",
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
      borderRadius: "16px",
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
      backgroundColor: theme.vars.palette.grey[700],
      color: theme.vars.palette.grey[400],
      "&:hover": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText
      },
      "&.active": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText
      }
    },

    /* Node menu button: secondary prominent, distinct color */
    ".floating-action-button.node-menu": {
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[300],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[100]
      }
    },

    ".floating-action-button.node-menu-attention": {
      animation: "node-menu-attention 2.4s ease-in-out infinite",
      "&:hover": {
        animation: "none",
        backgroundColor: theme.vars.palette.info.main,
        color: theme.vars.palette.info.contrastText,
        boxShadow: `0 6px 16px rgba(0,0,0,.35), 0 0 20px ${theme.vars.palette.info.main}25`
      },
      "@media (prefers-reduced-motion: reduce)": {
        animation: "none",
        backgroundColor: theme.vars.palette.info.main,
        color: theme.vars.palette.info.contrastText,
        boxShadow: `0 4px 12px ${theme.vars.palette.info.main}30`
      }
    },

    /* Mini app button: vibrant inviting color */
    ".floating-action-button.mini-app": {
      backgroundColor: "info.main",
      color: "info.contrastText",
      borderColor: "info.main",
      boxShadow: `0 4px 14px rgba(0,0,0,.35), 0 0 16px rgba(0,188,212,0.3)`,
      filter: "saturate(1.1)",
      "&:hover": {
        backgroundColor: "info.dark",
        borderColor: "info.dark",
        boxShadow: `0 6px 18px rgba(0,0,0,.4), 0 0 24px rgba(0,188,212,0.4)`,
        transform: "scale(1.06)"
      }
    },

/* Instant update button: glowing effect when active */
    ".floating-action-button.instant-update": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText,
        boxShadow: `0 0 12px ${theme.vars.palette.warning.main}`,
        "&:hover": {
          backgroundColor: "warning.dark",
          boxShadow: `0 0 16px ${theme.vars.palette.warning.main}`
        }
      }
    },

    "@keyframes pulse-scale": {
      "0%": { transform: "scale(1)" },
      "50%": { transform: "scale(1.1)" },
      "100%": { transform: "scale(1)" }
    },
    "@keyframes node-menu-attention": {
      "0%, 100%": {
        backgroundColor: "transparent",
        color: theme.vars.palette.grey[400],
        boxShadow: "none"
      },
      "50%": {
        backgroundColor: theme.vars.palette.info.main,
        color: theme.vars.palette.info.contrastText,
        boxShadow: `0 0 16px ${theme.vars.palette.info.main}40`
      }
    },

    ".minimap-active": {
      backgroundColor: `${theme.vars.palette.primary.main}20`,
      color: theme.vars.palette.primary.main,
      "&:hover": {
        backgroundColor: `${theme.vars.palette.primary.main}30`
      }
    }
  });

const FloatingToolBar: React.FC = memo(function FloatingToolBar() {
  const theme = useTheme();
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] =
    useState<null | HTMLElement>(null);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] =
    useState<null | HTMLElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { isRightPanelVisible, rightPanelSize, toggleWorkflowPanel } = useRightPanelStore(
    (state) => ({
      isRightPanelVisible: state.panel.isVisible,
      rightPanelSize: state.panel.panelSize,
      toggleWorkflowPanel: () => state.handleViewChange("workflow")
    })
  );
  const bottomPanelVisible = useBottomPanelStore(
    (state) => state.panel.isVisible
  );
  const bottomPanelSize = useBottomPanelStore((state) => state.panel.panelSize);
  const toggleBottomPanel = useBottomPanelStore(
    (state) => state.handleViewChange
  );

  const { instantUpdate, setInstantUpdate } = useSettingsStore((state) => ({
    instantUpdate: state.settings.instantUpdate,
    setInstantUpdate: state.setInstantUpdate
  }));

  const { visible: isMiniMapVisible, toggleVisible: toggleMiniMap } = useMiniMapStore(
    (state) => ({
      visible: state.visible,
      toggleVisible: state.toggleVisible
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

  const _handlePause = useCallback(() => {
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

  const _handleOpenInMiniApp = useCallback(() => {
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
    toggleWorkflowPanel();
  }, [toggleWorkflowPanel]);

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

  const isEmptyWorkflow = nodes.length === 0 && edges.length === 0;
  const shouldHighlightNodeMenu =
    isEmptyWorkflow && workflow?.name === "New Workflow";

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

  const handleOpenAdvancedMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      setAdvancedMenuAnchor(e.currentTarget);
    },
    []
  );

  const handleCloseAdvancedMenu = useCallback(() => {
    setAdvancedMenuAnchor(null);
  }, []);

  const handleToggleTerminal = useCallback(() => {
    toggleBottomPanel("terminal");
  }, [toggleBottomPanel]);

  const handleToggleInstantUpdate = useCallback(() => {
    setInstantUpdate(!instantUpdate);
  }, [instantUpdate, setInstantUpdate]);

  const handleToggleMiniMap = useCallback(() => {
    toggleMiniMap();
  }, [toggleMiniMap]);

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
          icon={<AddCircleIcon />}
          tooltip="Add Node"
          shortcut="openNodeMenu"
          variant={shouldHighlightNodeMenu ? "neutral" : "secondary"}
          className={cn(
            !shouldHighlightNodeMenu && "node-menu",
            shouldHighlightNodeMenu && "node-menu-attention"
          )}
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
          icon={<BoltIcon />}
          tooltip={instantUpdate ? "Instant Update: ON - Property changes trigger execution" : "Instant Update: OFF - Click to enable"}
          variant="neutral"
          className={cn("instant-update", instantUpdate && "active")}
          onClick={handleToggleInstantUpdate}
          aria-label="Toggle instant update"
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

        <Box
          css={css({
            width: "1px",
            height: "24px",
            backgroundColor: theme.vars.palette.grey[700],
            margin: "0 4px"
          })}
        />

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
        <MenuItem onClick={handleOpenAdvancedMenu}>
          <ListItemIcon>
            <MapIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Advanced" />
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

      <Menu
        anchorEl={advancedMenuAnchor}
        open={Boolean(advancedMenuAnchor)}
        onClose={handleCloseAdvancedMenu}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          paper: {
            sx: { minWidth: "180px", maxWidth: "220px" }
          }
        }}
      >
        <MenuItem
          className={cn(isMiniMapVisible && "minimap-active")}
          onClick={() => {
            handleToggleMiniMap();
            handleCloseAdvancedMenu();
          }}
        >
          <ListItemIcon>
            <MapIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Mini Map"
            secondary={isMiniMapVisible ? "Visible" : "Hidden"}
          />
        </MenuItem>
      </Menu>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

export default FloatingToolBar;
