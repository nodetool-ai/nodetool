/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { useMediaQuery } from "@mui/material";
import { EditorMenu } from "../ui_primitives";
import { CountBadge, Tooltip, MOTION, BORDER_RADIUS, SPACING, getSpacingPx, menuPaperStyles, reducedMotion } from "../ui_primitives";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import LayoutIcon from "@mui/icons-material/AutoFixHigh";
import MapIcon from "@mui/icons-material/Map";
import SaveIcon from "@mui/icons-material/Save";
import DownloadIcon from "@mui/icons-material/Download";
import LinearScaleIcon from "@mui/icons-material/LinearScale";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

import { useNodes } from "../../contexts/NodeContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import { useCombo } from "../../stores/KeyPressedStore";
import MobilePaneMenu from "../menus/MobilePaneMenu";
import { getShortcutTooltip } from "../../config/shortcuts";
import { cn } from "../editor_ui/editorUtils";
import { MenuItemPrimitive } from "../ui_primitives";
import { useFloatingToolbarState } from "../../hooks/useFloatingToolbarState";
import { useFloatingToolbarActions } from "../../hooks/useFloatingToolbarActions";
import { useFloatingToolbarPosition } from "../../hooks/useFloatingToolbarPosition";
import { useCanvasSideInsets } from "../../hooks/useCanvasSideInsets";
import { useWorkflowApp } from "../../hooks/useWorkflowApp";
import { useWorkflowScriptExport } from "../../hooks/useWorkflowScriptExport";
import { useRunningTime } from "../../hooks/useRunningTime";
import { formatRunningTime } from "../../utils/timeFormat";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useCanvasChatDockStore from "../../stores/CanvasChatDockStore";
import { HEADER_HEIGHT } from "../../config/constants";
import CanvasChatWindow from "./CanvasChatWindow";
import TriggerActivationButton from "./TriggerActivationButton";

const MOBILE_DOCK_LAYER_STYLE: React.CSSProperties = {
  bottom: "calc(8px + env(safe-area-inset-bottom, 0px))"
};

const RUNNING_TIME_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontFamily: "var(--fontFamily2)",
  letterSpacing: "-0.5px"
};

/** Live elapsed-time readout shown inside the Run button while a run is active. */
const RunningTime: React.FC<{ isRunning: boolean; timerKey?: string }> = memo(
  function RunningTime({ isRunning, timerKey }) {
    const theme = useTheme();
    const elapsedSeconds = useRunningTime(isRunning, timerKey);
    const { text } = formatRunningTime(elapsedSeconds);
    return (
      <span
        style={{
          ...RUNNING_TIME_STYLE,
          fontSize: theme.fontSizeSmaller
        }}
      >
        {text}
      </span>
    );
  }
);

// The workflow toolbar floats at the bottom centre of the canvas. This layer
// centres it and lets clicks fall through to the canvas everywhere the
// toolbar isn't. The chat lives in its own window (CanvasChatWindow).
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

const shortcutTooltip = (label: string, shortcut: string): React.ReactElement => (
  <span>{label} · {getShortcutTooltip(shortcut, undefined, "combo")}</span>
);

const dockStyles = (theme: Theme) =>
  css({
    display: "flex",
    pointerEvents: "auto",
    minWidth: 0,
    maxWidth: `calc(100% - ${getSpacingPx(SPACING.xl)})`,
    // The floating-bar surface shared with FloatingToolbar and menus.
    ...menuPaperStyles(theme),
    backdropFilter: "none",
    padding: getSpacingPx(SPACING.xs),
    [theme.breakpoints.down("sm")]: {
      ".composer-run-label": {
        display: "none"
      }
    }
  });

// Gap (px) between the canvas edges, the chat window and the toolbar.
const CHAT_WINDOW_GAP = 16;
// Height (px) the toolbar takes, with the gap above it.
const TOOLBAR_CLEARANCE = 64;

// The workflow toolbar: canvas tools on the left, then Stop (while
// running), Run, and the ⋮ menu on the right.
const actionStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: getSpacingPx(SPACING.md),

    ".composer-tools, .composer-run-group": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.xs),
      minWidth: 0
    },

    "& button": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.pill,
      transition: `${MOTION.background}, color ${MOTION.fast}`,
      ...reducedMotion({ transition: MOTION.none }),
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: 2
      }
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
        backgroundColor: theme.vars.palette.background.paper,
        color: theme.vars.palette.grey[100]
      }
    },

    ".composer-stop": {
      width: "32px",
      height: "32px",
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[400],
      "& svg": { fontSize: "var(--fontSizeBig)" },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
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
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.grey[100]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
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
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.grey[100]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
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
        border: `2px solid ${theme.vars.palette.divider}`,
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
  const { t } = useTranslation();
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
    handleSave,
    handleDownload,
    handleAutoLayout,
    handleToggleNodeMenu,
    handleToggleMiniMap,
    isWorkflowRunning,
    isWorkflowActive,
    runControlLabel,
    runControlDetail,
    isStopping,
    queuePosition,
    pendingRunCount
  } = useFloatingToolbarActions();

  const {
    openWorkflowApp,
    hasApp,
    isPending: isAppPending
  } = useWorkflowApp();
  const { convertToJsScript, downloadNodeScript, isExporting } =
    useWorkflowScriptExport();
  const appActionLabel = hasApp ? t("i18n-cont-panels-12.toolbar.openApp") : t("i18n-cont-panels-12.toolbar.makeApp");
  const appActionTooltip = hasApp
    ? t("i18n-cont-panels-12.toolbar.openWorkflowApp")
    : t("i18n-cont-panels-12.toolbar.makeWorkflowApp");
  const translatedRunControlLabel = runControlLabel.startsWith("Error")
    ? t("i18n-cont-panels-12.toolbar.errorRetry")
    : runControlLabel.startsWith("Queued #")
      ? t("i18n-cont-panels-12.toolbar.queuedPosition", { position: queuePosition ?? 0 })
      : runControlLabel.startsWith("Running · ")
        ? t("i18n-cont-panels-12.toolbar.runningCountQueued", { count: pendingRunCount })
        : runControlLabel === "Running"
          ? t("i18n-cont-panels-12.toolbar.running")
          : runControlLabel === "Starting"
            ? t("i18n-cont-panels-12.toolbar.starting")
            : runControlLabel === "Stopping"
              ? t("i18n-cont-panels-12.toolbar.stopping")
              : t("i18n-cont-panels-12.toolbar.runEntireWorkflow");

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
  const { left: leftPanelWidth, right: inspectorWidth } = useCanvasSideInsets();

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

  const isRunningish = isWorkflowActive;

  // Chat window: floats over the canvas, showing the active chat thread and
  // the prompt. It opens whenever a message is sent or a generation starts,
  // and closes back to the toolbar's chat button. Only the canvas workflow
  // thread counts: a side-panel assistant (code, sketch, …) streams on its
  // own thread and must not open this window.
  const { conversationCount, chatBusy } =
    useGlobalChatStore(
      useShallow((state) => {
        const threadId =
          (workflow?.id ? state.workflowThreadId[workflow.id] : null) ??
          state.currentThreadId;
        const runtime = threadId ? state.threadRuntime[threadId] : undefined;
        return {
          conversationCount: threadId
            ? state.messageCache[threadId]?.length ?? 0
            : 0,
          chatBusy:
            runtime?.status === "loading" || runtime?.status === "streaming"
        };
      })
    );

  // Bind the canvas chat to the open workflow: chat threads are scoped per
  // workflow, so switching workflows switches to that workflow's most recent
  // conversation (or starts a fresh one). Waits for the thread list to load so
  // an existing conversation is reused instead of creating a duplicate.
  const { openWorkflowThread, threadsLoaded, fetchThreads } =
    useGlobalChatStore(
      useShallow((state) => ({
        openWorkflowThread: state.openWorkflowThread,
        threadsLoaded: state.threadsLoaded,
        fetchThreads: state.fetchThreads
      }))
    );
  const workflowId = workflow?.id ?? null;
  useEffect(() => {
    if (!workflowId) {
      return;
    }
    if (!threadsLoaded) {
      void fetchThreads();
      return;
    }
    void openWorkflowThread(workflowId);
  }, [workflowId, threadsLoaded, openWorkflowThread, fetchThreads]);

  // Leaving the editor clears the workflow binding so the full-page chat starts
  // workflow-agnostic (it lists every thread, not just the last workflow's).
  useEffect(() => {
    return () => {
      useGlobalChatStore.setState({ workflowId: null });
    };
  }, []);
  // The open flag lives in the dock store so the keyboard shortcut ("o") and
  // command menu can toggle the window too.
  const { conversationCollapsed, setConversationCollapsed, toggleConversation } =
    useCanvasChatDockStore(
      useShallow((state) => ({
        conversationCollapsed: state.conversationCollapsed,
        setConversationCollapsed: state.setConversationCollapsed,
        toggleConversation: state.toggleConversation
      }))
    );
  useEffect(() => {
    if (chatBusy) {
      setConversationCollapsed(false);
    }
  }, [chatBusy, setConversationCollapsed]);
  const conversationOpen = !conversationCollapsed;
  const handleCloseConversation = useCallback(
    () => setConversationCollapsed(true),
    [setConversationCollapsed]
  );

  // The window hangs from the canvas's top-right corner, clear of an open
  // inspector, and stops above the workflow toolbar.
  const toolbarBottom = toolbarPosition.bottom;
  const chatWindowAnchor = useMemo(() => {
    const top = HEADER_HEIGHT + CHAT_WINDOW_GAP;
    return {
      top,
      right: inspectorWidth + CHAT_WINDOW_GAP,
      maxHeight: isMobile
        ? `calc(100dvh - ${top + TOOLBAR_CLEARANCE + CHAT_WINDOW_GAP}px)`
        : `calc(100vh - ${top}px - ${toolbarBottom ?? "0px"} - ${TOOLBAR_CLEARANCE}px)`
    };
  }, [inspectorWidth, isMobile, toolbarBottom]);

  // Keyboard shortcuts: Ctrl/Cmd+Enter runs (queues while running), Escape stops.
  useCombo(["control", "enter"], handleRun, true, true, {
    allowInInputs: true
  });
  useCombo(["meta", "enter"], handleRun, true, true, {
    allowInInputs: true
  });
  useCombo(["escape"], handleStop, true, isRunningish, { scope: "canvas" });

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

  const runTooltip = isStopping
    ? t("i18n-cont-panels-12.toolbar.stoppingWorkflow")
    : runControlLabel.startsWith("Error")
      ? t("i18n-cont-panels-12.toolbar.retryWorkflow", { detail: runControlDetail ?? t("i18n-cont-panels-12.toolbar.workflowFailedToStart") })
      : queuePosition != null
        ? t("i18n-cont-panels-12.toolbar.queuedPosition", { position: queuePosition })
        : pendingRunCount > 0
          ? t("i18n-cont-panels-12.toolbar.runningQueued", { count: pendingRunCount })
          : isWorkflowActive
            ? t("i18n-cont-panels-12.toolbar.queueAnotherRun", { label: translatedRunControlLabel })
            : shortcutTooltip(t("i18n-cont-panels-12.toolbar.runWorkflow"), "runWorkflow");

  const runAriaLabel = isStopping
    ? t("i18n-cont-panels-12.toolbar.stoppingWorkflow")
    : runControlLabel.startsWith("Error")
      ? t("i18n-cont-panels-12.toolbar.retryEntireWorkflow", { label: translatedRunControlLabel })
      : isWorkflowActive
        ? t("i18n-cont-panels-12.toolbar.queueAnotherEntireRun", { label: translatedRunControlLabel })
        : translatedRunControlLabel;

  // The workflow toolbar: the composer's second row. Canvas tools sit on the
  // left after the drag handle, and the run controls on the right.
  const workflowActions = (
    <div css={actionStyles(theme)} className="composer-workflow-actions">
      <span className="composer-tools">
        {editorViewMode === "graph" && (
          <Tooltip
            title={shortcutTooltip(t("i18n-cont-panels-12.toolbar.addNode"), "openNodeMenu")}
            placement="top"
          >
            <button
              type="button"
              className="composer-action"
              onClick={handleToggleNodeMenu}
              aria-label={t("i18n-cont-panels-12.toolbar.addNode")}
            >
              <AddCircleIcon />
            </button>
          </Tooltip>
        )}

        <Tooltip
          title={conversationOpen ? t("i18n-cont-panels-12.toolbar.hideConversation") : t("i18n-cont-panels-12.toolbar.showConversation")}
          placement="top"
        >
          <button
            type="button"
            className={cn("composer-convo", conversationOpen && "active")}
            onClick={toggleConversation}
            aria-label={t("i18n-cont-panels-12.toolbar.toggleConversation")}
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

        {/* On mobile Auto Layout and Save move into the ⋮ menu to keep the
            toolbar within a phone-width row. */}
        {editorViewMode === "graph" && !isMobile && (
          <Tooltip
            title={t("i18n-cont-panels-12.toolbar.autoLayout")}
            placement="top"
          >
            <button
              type="button"
              className="composer-action"
              onClick={handleAutoLayout}
              aria-label={t("i18n-cont-panels-12.toolbar.autoLayout")}
            >
              <LayoutIcon />
            </button>
          </Tooltip>
        )}

        {!isMobile && (
          <Tooltip title={t("i18n-cont-panels-12.toolbar.save")} placement="top">
            <button
              type="button"
              className="composer-action"
              onClick={handleSave}
              aria-label={t("i18n-cont-panels-12.toolbar.saveWorkflow")}
            >
              <SaveIcon />
            </button>
          </Tooltip>
        )}

        {!isMobile && (
          <Tooltip
            title={appActionTooltip}
            placement="top"
          >
            <button
              type="button"
              className="composer-action"
              onClick={() => void openWorkflowApp()}
              aria-label={appActionLabel}
              disabled={isAppPending}
            >
              <DashboardCustomizeOutlinedIcon />
            </button>
          </Tooltip>
        )}

        {/* Shown at every width: arming and disarming a trigger is the whole
            point of the feature, and a phone browser needs it too. */}
        <TriggerActivationButton />
      </span>

      <span className="composer-run-group">
        {isRunningish && (
          <Tooltip
            title={shortcutTooltip(t("i18n-cont-panels-12.toolbar.stopWorkflow"), "stopWorkflow")}
            placement="top"
          >
            <button
              type="button"
              className="composer-stop"
              onClick={handleStop}
              aria-label={isStopping ? t("i18n-cont-panels-12.toolbar.stoppingWorkflow") : t("i18n-cont-panels-12.toolbar.stopWorkflow")}
              disabled={isStopping}
            >
              <StopIcon />
            </button>
          </Tooltip>
        )}

        <Tooltip title={runTooltip} placement="top">
          <button
            type="button"
            className={cn("composer-run", isWorkflowActive && "running")}
            onClick={handleRun}
            aria-label={runAriaLabel}
            disabled={isStopping}
          >
            {/* Instant-update mode runs on every keystroke, so its ticking
                timer would be noise. The visible state label remains stable
                instead. */}
            {isWorkflowRunning && !instantUpdate ? (
              <RunningTime isRunning timerKey={workflow?.id} />
            ) : !isWorkflowActive || runControlLabel.startsWith("Error") ? (
              <PlayArrow />
            ) : null}
            <span className="composer-run-label">{translatedRunControlLabel}</span>
            {pendingRunCount > 0 && (
              <CountBadge
                count={pendingRunCount}
                color="primary"
                size="small"
                max={Infinity}
                sx={{
                  position: "absolute",
                  top: `-${getSpacingPx(SPACING.micro)}`,
                  right: `-${getSpacingPx(SPACING.micro)}`,
                  border: "2px solid",
                  borderColor: "grey.900"
                }}
              />
            )}
          </button>
        </Tooltip>

        <Tooltip
          title={t("i18n-cont-panels-12.toolbar.workflowActions")}
          placement="top"
        >
          <button
            type="button"
            className={cn("composer-menu", actionsMenuAnchor && "active")}
            onClick={handleOpenActionsMenu}
            aria-label={t("i18n-cont-panels-12.toolbar.workflowActions")}
            aria-haspopup="menu"
            aria-expanded={Boolean(actionsMenuAnchor)}
          >
            <MoreVertIcon />
          </button>
        </Tooltip>
      </span>
    </div>
  );

  return (
    <>
      <div
        css={dockLayerStyles(theme)}
        style={isMobile ? MOBILE_DOCK_LAYER_STYLE : {
          ...toolbarPosition,
          right: inspectorWidth,
          left: leftPanelWidth
        }}
      >
        <div css={dockStyles(theme)} className="floating-toolbar canvas-chat-dock">
          {workflowActions}
        </div>
      </div>

      <CanvasChatWindow
        open={conversationOpen}
        onClose={handleCloseConversation}
        anchor={chatWindowAnchor}
        isMobile={isMobile}
      />

      <EditorMenu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        paperSx={{ minWidth: 220, maxWidth: 280 }}
      >
        <MenuItemPrimitive
          label={editorViewMode === "graph" ? t("i18n-cont-panels-12.toolbar.chainView") : t("i18n-cont-panels-12.toolbar.graphView")}
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
          label={t("i18n-cont-panels-12.toolbar.instantUpdate")}
          icon={<BoltIcon fontSize="small" />}
          secondary={instantUpdate ? t("i18n-cont-panels-12.toolbar.on") : t("i18n-cont-panels-12.toolbar.off")}
          onClick={runWithClose(handleToggleInstantUpdate)}
        />
        {isRunningish && (
          <MenuItemPrimitive
            label={t("i18n-cont-panels-12.toolbar.stop")}
            icon={<StopIcon fontSize="small" />}
            onClick={runWithClose(handleStop)}
          />
        )}
        {isMobile && editorViewMode === "graph" && (
          <MenuItemPrimitive
            label={t("i18n-cont-panels-12.toolbar.autoLayout")}
            icon={<LayoutIcon fontSize="small" />}
            onClick={runWithClose(handleAutoLayout)}
          />
        )}
        {isMobile && (
          <MenuItemPrimitive
            label={t("i18n-cont-panels-12.toolbar.save")}
            icon={<SaveIcon fontSize="small" />}
            onClick={runWithClose(handleSave)}
          />
        )}
        <MenuItemPrimitive
          label={appActionLabel}
          icon={<DashboardCustomizeOutlinedIcon fontSize="small" />}
          disabled={isAppPending}
          onClick={runWithClose(() => void openWorkflowApp())}
        />
        <MenuItemPrimitive
          label={t("i18n-cont-panels-12.toolbar.miniMap")}
          icon={<MapIcon fontSize="small" />}
          secondary={isMiniMapVisible ? t("i18n-cont-panels-12.toolbar.visible") : t("i18n-cont-panels-12.toolbar.hidden")}
          onClick={runWithClose(handleToggleMiniMap)}
        />
        <MenuItemPrimitive
          label={t("i18n-cont-panels-12.toolbar.downloadJson")}
          icon={<DownloadIcon fontSize="small" />}
          onClick={runWithClose(handleDownload)}
        />
        <MenuItemPrimitive
          label={t("i18n-cont-panels-12.toolbar.convertToJsScript")}
          icon={<DataObjectOutlinedIcon fontSize="small" />}
          disabled={isExporting}
          onClick={runWithClose(() => void convertToJsScript())}
        />
        <MenuItemPrimitive
          label={t("i18n-cont-panels-12.toolbar.downloadNodeScript")}
          icon={<TerminalIcon fontSize="small" />}
          disabled={isExporting}
          onClick={runWithClose(() => void downloadNodeScript())}
        />
        {isMobile && (
          <MenuItemPrimitive
            label={t("i18n-cont-panels-12.toolbar.panels")}
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
