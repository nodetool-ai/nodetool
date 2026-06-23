/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@mui/material";
import Draggable, { type DraggableData } from "react-draggable";
import { EditorMenu } from "../ui_primitives";
import { Tooltip, AlertBanner, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import BoltIcon from "@mui/icons-material/Bolt";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import LayoutIcon from "@mui/icons-material/AutoFixHigh";
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
import useCanvasChatDockStore, {
  MAX_DOCK_WIDTH,
  MIN_DOCK_WIDTH,
  type DockPosition
} from "../../stores/CanvasChatDockStore";
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

// The chat dock is the media composer (+ optional conversation overlay above
// it), floating over the canvas. The workflow controls live inside the
// composer footer (Run button + a ⋮ menu). The dock is draggable and the
// overlay resizable; this layer just centres it at the bottom by default and
// lets clicks fall through to the canvas everywhere the dock isn't.
const dockLayerStyles = (theme: Theme) =>
  css({
    position: "fixed",
    left: 0,
    right: 0,
    bottom: "20px",
    zIndex: theme.zIndex.drawer,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none"
  });

const dockStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: `${theme.spacing(1)}`,
    pointerEvents: "auto",

    // Grab affordance the user drags to move the whole dock. Rendered as a
    // span (not a button) so react-draggable's `cancel="button"` doesn't
    // exclude it while still excluding the real action buttons around it.
    ".composer-drag-handle": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      borderRadius: BORDER_RADIUS.pill,
      color: theme.vars.palette.grey[500],
      cursor: "grab",
      transition: `${MOTION.background}, color ${MOTION.fast}`,
      "& svg": { fontSize: "var(--fontSizeBig)" },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200]
      },
      "&:active": { cursor: "grabbing" }
    }
  });

// Workflow controls embedded in the composer footer: an always-visible Run
// button (+ contextual Stop while running) and a ⋮ button opening a normal
// dropdown menu for everything else. Kept compact so the composer doesn't grow.
const actionStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.xs),
    marginLeft: getSpacingPx(SPACING.sm),
    paddingLeft: getSpacingPx(SPACING.md),
    borderLeft: `1px solid ${theme.vars.palette.divider}`,

    "& button": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.pill,
      transition: `${MOTION.background}, color ${MOTION.fast}`
    },

    ".composer-run": {
      position: "relative",
      minWidth: "36px",
      height: "36px",
      padding: `0 ${getSpacingPx(SPACING.lg)}`, // was 0 10px
      gap: getSpacingPx(SPACING.xs),
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      "& svg": { fontSize: "var(--fontSizeBig)" },
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
        padding: `0 ${getSpacingPx(SPACING.xs)}`,
        boxSizing: "border-box",
        borderRadius: BORDER_RADIUS.pill,
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
      "& svg": { fontSize: "var(--fontSizeBig)" },
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
      "& svg": { fontSize: "var(--fontSizeBig)" },
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
      "& svg": { fontSize: "var(--fontSizeBig)" },
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
        padding: `0 ${getSpacingPx(SPACING.xs)}`, // was 0 3px
        boxSizing: "border-box",
        borderRadius: BORDER_RADIUS.pill,
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[50],
        border: `2px solid ${theme.vars.palette.grey[900]}`,
        fontSize: "var(--fontSizeSmaller)",
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

  const isRunningish = isWorkflowRunning || isPaused || isSuspended;

  // Conversation overlay: floats above the composer, showing the active chat
  // thread. It surfaces dynamically — auto-opening whenever a new message
  // arrives or a generation starts — and can be collapsed back to a toggle.
  const { conversationCount, chatBusy, chatError, clearChatError } =
    useGlobalChatStore(
      useShallow((state) => ({
        conversationCount: state.currentThreadId
          ? state.messageCache[state.currentThreadId]?.length ?? 0
          : 0,
        chatBusy:
          state.status === "loading" || state.status === "streaming",
        chatError: state.error,
        clearChatError: state.clearError
      }))
    );
  // Start collapsed so opening a workflow with existing conversation history
  // doesn't pop the overlay. It auto-reveals only when chat becomes busy in
  // this session (the user sent a message / a generation is streaming). The
  // collapse flag lives in the dock store so the keyboard shortcut ("o") and
  // command menu can toggle it too.
  const {
    conversationCollapsed,
    setConversationCollapsed,
    dockWidth,
    storePosition,
    setStorePosition,
    resetPosition
  } = useCanvasChatDockStore(
    useShallow((state) => ({
      conversationCollapsed: state.conversationCollapsed,
      setConversationCollapsed: state.setConversationCollapsed,
      dockWidth: state.dockWidth,
      storePosition: state.position,
      setStorePosition: state.setPosition,
      resetPosition: state.resetPosition
    }))
  );
  useEffect(() => {
    if (chatBusy) {
      setConversationCollapsed(false);
    }
  }, [chatBusy, setConversationCollapsed]);

  // The composer is the canvas chat entry point now that the left chat panel
  // is gone, so the conversation toggle is always available — opening the
  // overlay reaches the thread (even empty), the thread list, and full chat.
  const conversationOpen = !conversationCollapsed;

  // Draggable dock position. Kept in local state during the gesture for smooth
  // movement, persisted to the store (clamped on-screen) when the drag ends.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<DockPosition>(storePosition);
  useEffect(() => {
    setDragPos(storePosition);
  }, [storePosition]);

  const clampToViewport = useCallback((pos: DockPosition): DockPosition => {
    const node = dockRef.current;
    if (!node || typeof window === "undefined") {
      return pos;
    }
    const rect = node.getBoundingClientRect();
    const margin = 8;
    let { x, y } = pos;
    if (rect.left < margin) x += margin - rect.left;
    if (rect.right > window.innerWidth - margin)
      x -= rect.right - (window.innerWidth - margin);
    if (rect.top < margin) y += margin - rect.top;
    if (rect.bottom > window.innerHeight - margin)
      y -= rect.bottom - (window.innerHeight - margin);
    return { x, y };
  }, []);

  const handleDragStop = useCallback(
    (_e: unknown, data: DraggableData) => {
      const next = clampToViewport({ x: data.x, y: data.y });
      setDragPos(next);
      setStorePosition(next);
    },
    [clampToViewport, setStorePosition]
  );

  // Keep the dock on-screen when the viewport shrinks (e.g. window resize).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onResize = () => {
      const clamped = clampToViewport(
        useCanvasChatDockStore.getState().position
      );
      setDragPos(clamped);
      setStorePosition(clamped);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToViewport, setStorePosition]);

  const dockWidthCss =
    dockWidth != null
      ? `clamp(${MIN_DOCK_WIDTH}px, ${dockWidth}px, min(${MAX_DOCK_WIDTH}px, calc(100vw - 32px)))`
      : "min(820px, calc(100vw - 32px))";

  const dragHandle = (
    <Tooltip
      title="Drag to move • double-click to reset"
      placement="top"
      delay={TOOLTIP_ENTER_DELAY}
    >
      <span
        role="button"
        tabIndex={-1}
        aria-label="Move chat dock"
        className="dock-drag-handle composer-drag-handle"
        onDoubleClick={resetPosition}
      >
        <DragIndicatorIcon />
      </span>
    </Tooltip>
  );

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

      <Tooltip
        title={conversationOpen ? "Hide conversation" : "Show conversation"}
        placement="top"
        delay={TOOLTIP_ENTER_DELAY}
      >
        <button
          type="button"
          className={cn("composer-convo", conversationOpen && "active")}
          onClick={() => setConversationCollapsed(!conversationCollapsed)}
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
          {/* Instant-update mode runs on every keystroke; the ticking timer
              (and its setInterval re-render churn via useRunningTime) is pure
              noise there, so show a static Play icon. The button stays a live
              run control — clicking still queues another run. */}
          {isWorkflowRunning && !instantUpdate ? (
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
      <div css={dockLayerStyles(theme)} style={toolbarPosition}>
        <Draggable
          nodeRef={dockRef as React.RefObject<HTMLElement>}
          handle=".dock-drag-handle"
          cancel="button, input, textarea, .dock-no-drag"
          position={dragPos}
          onDrag={(_e, data) => setDragPos({ x: data.x, y: data.y })}
          onStop={handleDragStop}
        >
          <div
            ref={dockRef}
            css={dockStyles(theme)}
            className="floating-toolbar canvas-chat-dock"
            style={{ width: dockWidthCss }}
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
                sx={{ borderRadius: BORDER_RADIUS.xl }}
              >
                {chatError}
              </AlertBanner>
            )}
            <CanvasMediaComposer
              leadingActions={dragHandle}
              trailingActions={workflowActions}
            />
          </div>
        </Draggable>
      </div>

      <EditorMenu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        paperSx={{ minWidth: "220px", maxWidth: "280px" }}
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
      </EditorMenu>

      <MobilePaneMenu open={paneMenuOpen} onClose={handleClosePaneMenu} />
    </>
  );
});

FloatingToolBar.displayName = "FloatingToolBar";

export default FloatingToolBar;
