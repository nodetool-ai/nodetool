/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery, Menu } from "@mui/material";
import { Tooltip, Box, AlertBanner } from "../ui_primitives";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import BoltIcon from "@mui/icons-material/Bolt";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import LayoutIcon from "@mui/icons-material/ViewModule";
import MapIcon from "@mui/icons-material/Map";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import LinearScaleIcon from "@mui/icons-material/LinearScale";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useLocation } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { useNodes } from "../../contexts/NodeContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useComfyUIStore } from "../../stores/ComfyUIStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useCombo } from "../../stores/KeyPressedStore";
import MobilePaneMenu from "../menus/MobilePaneMenu";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { getShortcutTooltip } from "../../config/shortcuts";
import { cn } from "../editor_ui/editorUtils";
import { MenuItemPrimitive } from "../ui_primitives/MenuItemPrimitive";
import { useFloatingToolbarState } from "../../hooks/useFloatingToolbarState";
import { useFloatingToolbarActions } from "../../hooks/useFloatingToolbarActions";
import { useFloatingToolbarPosition } from "../../hooks/useFloatingToolbarPosition";
import { useRunningTime } from "../../hooks/useRunningTime";
import { formatRunningTime } from "../../utils/timeFormat";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import CanvasMediaComposer from "./CanvasMediaComposer";
import ConversationOverlay from "./ConversationOverlay";

/** Live elapsed-time readout shown inside the Run button while a run is active. */
const RunningTime: React.FC<{ isRunning: boolean; timerKey?: string }> = memo(
  function RunningTime({ isRunning, timerKey }) {
    const theme = useTheme();
    const elapsedSeconds = useRunningTime(isRunning, timerKey);
    const { text, sizeKey } = formatRunningTime(elapsedSeconds);
    const fontSizeMap = {
      smaller: theme.fontSizeSmaller,
      tiny: theme.fontSizeTiny,
      tinyer: theme.fontSizeTinyer
    };
    return (
      <span
        style={{
          fontSize: fontSizeMap[sizeKey],
          fontWeight: 600,
          fontFamily: "monospace",
          letterSpacing: "-0.5px"
        }}
      >
        {text}
      </span>
    );
  }
);

// The toolbar is now just the media composer, centered at the bottom. The
// workflow controls live inside the composer footer (Run button + a ⋮ menu).
const containerStyles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: theme.zIndex.drawer,
    width: "min(820px, calc(100vw - 32px))",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "8px"
  });

// Workflow controls embedded in the composer footer: an always-visible Run
// button (+ contextual Stop while running) and a ⋮ button opening a normal
// dropdown menu for everything else. Kept compact so the composer doesn't grow.
const actionStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    marginLeft: "6px",
    paddingLeft: "8px",
    borderLeft: `1px solid ${theme.vars.palette.divider}`,

    "& button": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      cursor: "pointer",
      borderRadius: "999px",
      transition: "background-color 0.15s ease, color 0.15s ease"
    },

    ".composer-run": {
      position: "relative",
      minWidth: "36px",
      height: "36px",
      padding: "0 10px",
      gap: "4px",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      "& svg": { fontSize: "20px" },
      "&:hover": { backgroundColor: theme.vars.palette.primary.light },
      "&.running": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      },
      ".run-queue-badge": {
        position: "absolute",
        top: "-3px",
        right: "-3px",
        minWidth: "16px",
        height: "16px",
        padding: "0 4px",
        boxSizing: "border-box",
        borderRadius: "999px",
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        border: `2px solid ${theme.vars.palette.grey[900]}`,
        fontSize: "var(--fontSizeSmaller)",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1
      }
    },

    ".composer-stop": {
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "& svg": { fontSize: "18px" },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.warning.main
      }
    },

    ".composer-menu, .composer-action": {
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "& svg": { fontSize: "20px" },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    },

    ".composer-convo": {
      position: "relative",
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "& svg": { fontSize: "19px" },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      },
      ".convo-badge": {
        position: "absolute",
        top: "-2px",
        right: "-2px",
        minWidth: "15px",
        height: "15px",
        padding: "0 3px",
        boxSizing: "border-box",
        borderRadius: "999px",
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[50],
        border: `2px solid ${theme.vars.palette.grey[900]}`,
        fontSize: "var(--fontSizeTiny)",
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1
      }
    }
  });

const FloatingToolBar: React.FC = memo(function FloatingToolBar() {
  const theme = useTheme();
  const location = useLocation();
  const path = location.pathname;
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const {
    paneMenuOpen,
    actionsMenuAnchor,
    handleOpenPaneMenu,
    handleClosePaneMenu,
    handleOpenActionsMenu,
    handleCloseActionsMenu
  } = useFloatingToolbarState();

  const {
    handleRun,
    handleStop,
    handleResume,
    handleSave,
    handleDownload,
    handleAutoLayout,
    handleToggleNodeMenu,
    handleToggleMiniMap,
    isWorkflowRunning,
    isPaused,
    isSuspended,
    queuePosition,
    pendingRunCount
  } = useFloatingToolbarActions();

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

  const { instantUpdate, setInstantUpdate, editorViewMode, setEditorViewMode } =
    useSettingsStore(
      useShallow((state) => ({
        instantUpdate: state.settings.instantUpdate,
        setInstantUpdate: state.setInstantUpdate,
        editorViewMode: state.settings.editorViewMode,
        setEditorViewMode: state.setEditorViewMode
      }))
    );

  const isMiniMapVisible = useMiniMapStore((state) => state.visible);

  const workflow = useNodes((state) => state.workflow);
  const isComfyWorkflow = useNodes((state) => state.isComfyWorkflow());
  const { comfyIsConnected, comfyIsConnecting, comfyConnectionError } =
    useComfyUIStore(
      useShallow((state) => ({
        comfyIsConnected: state.isConnected,
        comfyIsConnecting: state.isConnecting,
        comfyConnectionError: state.connectionError
      }))
    );

  // Auto-connect to ComfyUI when a comfy workflow is loaded (once per workflow).
  useEffect(() => {
    if (
      isComfyWorkflow &&
      !comfyIsConnected &&
      !comfyIsConnecting &&
      !comfyConnectionError
    ) {
      useComfyUIStore.getState().connect().catch(() => {});
    }
  }, [isComfyWorkflow, comfyIsConnected, comfyIsConnecting, comfyConnectionError]);

  const isRunningish = isWorkflowRunning || isPaused || isSuspended;

  // Conversation overlay: floats above the composer, showing the active chat
  // thread. It surfaces dynamically — auto-opening whenever a new message
  // arrives or a generation starts — and can be collapsed back to a toggle.
  const conversationCount = useGlobalChatStore((state) =>
    state.currentThreadId
      ? state.messageCache[state.currentThreadId]?.length ?? 0
      : 0
  );
  const chatBusy = useGlobalChatStore(
    (state) => state.status === "loading" || state.status === "streaming"
  );
  // Chat/media-generation errors land in the store but the canvas has no thread
  // view to surface them, so show them as a dismissible banner above the composer.
  const chatError = useGlobalChatStore((state) => state.error);
  const clearChatError = useGlobalChatStore((state) => state.clearError);
  const [conversationCollapsed, setConversationCollapsed] = useState(false);
  const prevCount = useRef(conversationCount);
  useEffect(() => {
    if (conversationCount > prevCount.current || chatBusy) {
      setConversationCollapsed(false);
    }
    prevCount.current = conversationCount;
  }, [conversationCount, chatBusy]);

  const hasConversation = conversationCount > 0 || chatBusy;
  const conversationOpen = hasConversation && !conversationCollapsed;

  // Keyboard shortcuts: Ctrl/Cmd+Enter runs (queues while running), Escape stops.
  useCombo(["control", "enter"], handleRun, true);
  useCombo(["meta", "enter"], handleRun, true);
  useCombo(["escape"], handleStop, true, isRunningish);

  const runWithClose = useCallback(
    (fn: () => void) => () => {
      fn();
      handleCloseActionsMenu();
    },
    [handleCloseActionsMenu]
  );

  const handleToggleInstantUpdate = useCallback(() => {
    setInstantUpdate(!instantUpdate);
  }, [instantUpdate, setInstantUpdate]);

  const handleToggleViewMode = useCallback(() => {
    setEditorViewMode(editorViewMode === "graph" ? "chain" : "graph");
  }, [editorViewMode, setEditorViewMode]);

  // Shown in the legacy editor (/editor) and the unified workspace (/workspace).
  if (!path.startsWith("/editor") && !path.startsWith("/workspace")) {
    return null;
  }

  const runTooltip =
    pendingRunCount > 0
      ? `Running — ${pendingRunCount} queued (click to queue another)`
      : queuePosition != null
        ? `Queued (#${queuePosition})`
        : isWorkflowRunning
          ? "Running (click to queue another run)"
          : getShortcutTooltip("runWorkflow");

  const workflowActions = (
    <span css={actionStyles(theme)} className="composer-workflow-actions">
      {editorViewMode === "graph" && (
        <Tooltip
          title={getShortcutTooltip("openNodeMenu")}
          placement="top"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <button
            type="button"
            className="composer-action"
            onClick={handleToggleNodeMenu}
            aria-label="Add node"
          >
            <AddCircleIcon />
          </button>
        </Tooltip>
      )}

      {hasConversation && (
        <Tooltip
          title={conversationOpen ? "Hide conversation" : "Show conversation"}
          placement="top"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <button
            type="button"
            className={cn("composer-convo", conversationOpen && "active")}
            onClick={() => setConversationCollapsed((v) => !v)}
            aria-label="Toggle conversation"
            aria-pressed={conversationOpen}
          >
            <ForumOutlinedIcon />
            {conversationCount > 0 && (
              <span className="convo-badge" aria-hidden>
                {conversationCount}
              </span>
            )}
          </button>
        </Tooltip>
      )}

      {isRunningish && (
        <Tooltip
          title={getShortcutTooltip("stopWorkflow")}
          placement="top"
          delay={TOOLTIP_ENTER_DELAY}
        >
          <button
            type="button"
            className="composer-stop"
            onClick={handleStop}
            aria-label="Stop workflow"
          >
            <StopIcon />
          </button>
        </Tooltip>
      )}

      <Tooltip title={runTooltip} placement="top" delay={TOOLTIP_ENTER_DELAY}>
        <button
          type="button"
          className={cn("composer-run", isWorkflowRunning && "running")}
          onClick={handleRun}
          aria-label="Run workflow"
        >
          {isWorkflowRunning ? (
            <RunningTime isRunning timerKey={workflow?.id} />
          ) : (
            <PlayArrow />
          )}
          {pendingRunCount > 0 && (
            <span className="run-queue-badge" aria-hidden>
              {pendingRunCount}
            </span>
          )}
        </button>
      </Tooltip>

      {editorViewMode === "graph" && (
        <Tooltip title="Auto Layout" placement="top" delay={TOOLTIP_ENTER_DELAY}>
          <button
            type="button"
            className="composer-action"
            onClick={handleAutoLayout}
            aria-label="Auto layout"
          >
            <LayoutIcon />
          </button>
        </Tooltip>
      )}

      <Tooltip title="Save" placement="top" delay={TOOLTIP_ENTER_DELAY}>
        <button
          type="button"
          className="composer-action"
          onClick={handleSave}
          aria-label="Save workflow"
        >
          <SaveIcon />
        </button>
      </Tooltip>

      <Tooltip
        title="Workflow actions"
        placement="top"
        delay={TOOLTIP_ENTER_DELAY}
      >
        <button
          type="button"
          className={cn("composer-menu", actionsMenuAnchor && "active")}
          onClick={handleOpenActionsMenu}
          aria-label="Workflow actions"
          aria-haspopup="menu"
          aria-expanded={Boolean(actionsMenuAnchor)}
        >
          <MoreVertIcon />
        </button>
      </Tooltip>
    </span>
  );

  return (
    <>
      <Box
        css={containerStyles(theme)}
        className="floating-toolbar"
        data-comfy-workflow={isComfyWorkflow ? "true" : "false"}
        style={toolbarPosition}
      >
        {conversationOpen && (
          <ConversationOverlay
            onCollapse={() => setConversationCollapsed(true)}
          />
        )}
        {chatError && (
          <AlertBanner
            severity="error"
            compact
            onClose={clearChatError}
            sx={{ borderRadius: "12px" }}
          >
            {chatError}
          </AlertBanner>
        )}
        <CanvasMediaComposer trailingActions={workflowActions} />
      </Box>

      <Menu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: "220px", maxWidth: "280px" } } }}
      >
        <MenuItemPrimitive
          label={editorViewMode === "graph" ? "Chain View" : "Graph View"}
          icon={
            editorViewMode === "graph" ? (
              <LinearScaleIcon fontSize="small" />
            ) : (
              <AccountTreeIcon fontSize="small" />
            )
          }
          onClick={runWithClose(handleToggleViewMode)}
        />
        <MenuItemPrimitive
          label="Instant Update"
          icon={<BoltIcon fontSize="small" />}
          secondary={instantUpdate ? "On" : "Off"}
          onClick={runWithClose(handleToggleInstantUpdate)}
        />
        {(isPaused || isSuspended) && (
          <MenuItemPrimitive
            label="Resume"
            icon={<PlayCircleIcon fontSize="small" />}
            onClick={runWithClose(handleResume)}
          />
        )}
        {isRunningish && (
          <MenuItemPrimitive
            label="Stop"
            icon={<StopIcon fontSize="small" />}
            onClick={runWithClose(handleStop)}
          />
        )}
        <MenuItemPrimitive
          label="Mini Map"
          icon={<MapIcon fontSize="small" />}
          secondary={isMiniMapVisible ? "Visible" : "Hidden"}
          onClick={runWithClose(handleToggleMiniMap)}
        />
        <MenuItemPrimitive
          label="Download JSON"
          icon={<DownloadIcon fontSize="small" />}
          onClick={runWithClose(handleDownload)}
        />
        {isMobile && (
          <MenuItemPrimitive
            label="Panels…"
            icon={<MoreHorizIcon fontSize="small" />}
            onClick={runWithClose(handleOpenPaneMenu)}
          />
        )}
      </Menu>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

FloatingToolBar.displayName = "FloatingToolBar";

export default FloatingToolBar;
