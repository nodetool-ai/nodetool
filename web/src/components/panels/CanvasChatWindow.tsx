/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import EditNoteIcon from "@mui/icons-material/EditNote";
import HistoryIcon from "@mui/icons-material/History";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";

import {
  AlertBanner,
  Text,
  Tooltip,
  FlexRow,
  ScrollArea,
  SearchInput,
  MOTION,
  BORDER_RADIUS,
  Z_INDEX,
  SPACING,
  getSpacingPx,
  ResizeHandle
} from "../ui_primitives";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useCanvasChatDockStore, {
  type DockPosition
} from "../../stores/CanvasChatDockStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  useCanvasDockResize,
  useCanvasDockEdgeResize
} from "../../hooks/handlers/useCanvasDockResize";
import ChatThreadView from "../chat/thread/ChatThreadView";
import ThreadList from "../chat/thread/ThreadList";
import type { ThreadInfo } from "../chat/types/thread.types";
import { threadPreview } from "../chat/utils/threadUtils";
import type { Message } from "../../stores/ApiTypes";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useDraggable } from "../../hooks/useDraggable";
import { cn } from "../editor_ui/editorUtils";
import ProviderFailureReportButton from "../support/ProviderFailureReportButton";
import CanvasMediaComposer from "./CanvasMediaComposer";

type ThreadStatus = React.ComponentProps<typeof ChatThreadView>["status"];

const EMPTY_MESSAGES: Message[] = [];

/** Shift a drag offset so the window's rect stays inside the viewport. */
const clampToViewport = (
  node: HTMLElement | null,
  pos: DockPosition
): DockPosition => {
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
};

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    zIndex: theme.zIndex.drawer,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    pointerEvents: "auto",
    borderRadius: BORDER_RADIUS.xl,
    overflow: "hidden",
    // theme.palette.mode is fixed to the default scheme under the CSS-vars
    // theme, so the dark look goes through the `.dark` color-scheme selector.
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    boxShadow: `0 1px 2px rgb(${theme.vars.palette.common.blackChannel} / 0.04), 0 12px 32px rgb(${theme.vars.palette.common.blackChannel} / 0.12)`,
    [theme.getColorSchemeSelector("dark")]: {
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      boxShadow: `0 16px 48px rgb(${theme.vars.palette.common.blackChannel} / 0.55)`
    },
    // Closed windows stay mounted so a draft prompt, its attachments and the
    // auto-add of finished generations survive.
    "&.closed": { display: "none" },

    ".chat-window-header": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      minHeight: "44px",
      padding: `0 ${getSpacingPx(SPACING.sm)} 0 ${getSpacingPx(SPACING.md)}`,
      flexShrink: 0,
      cursor: "grab",
      userSelect: "none",
      "&:active": { cursor: "grabbing" }
    },
    "&.mobile .chat-window-header": { cursor: "default" },
    ".chat-window-mark": {
      display: "inline-flex",
      color: theme.vars.palette.primary.main,
      "& svg": { fontSize: "var(--fontSizeBig)" }
    },

    // The thread view paints `background.default` for the full-page chat;
    // inside the window that reads as a mismatched slab, so let the window
    // surface show through.
    ".chat-thread-view-root": {
      background: "transparent",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.sm)}`
    },

    ".chat-window-body": {
      flex: 1,
      minHeight: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },

    // Friendly hint shown while the thread has no messages yet.
    ".chat-window-empty": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: getSpacingPx(SPACING.xs),
      padding: getSpacingPx(SPACING.xxl),
      textAlign: "center",
      color: theme.vars.palette.grey[500],
      "& > svg": {
        fontSize: "var(--fontSizeHuge)",
        opacity: 0.4,
        marginBottom: getSpacingPx(SPACING.sm)
      }
    },

    // The prompt sits at the foot of the window, inset like a card.
    ".chat-window-composer": {
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm),
      padding: getSpacingPx(SPACING.sm)
    },
    ".chat-window-composer .media-compose-card": {
      background: theme.vars.palette.grey[50],
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: BORDER_RADIUS.lg,
      [theme.getColorSchemeSelector("dark")]: {
        background: theme.vars.palette.grey[1000],
        border: `1px solid ${theme.vars.palette.grey[800]}`
      },
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    // The generation chips scroll sideways instead of wrapping in a narrow
    // window, so the send button keeps its place at the end of the row.
    ".chat-window-composer .media-chip-main": {
      flexWrap: "nowrap",
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": { display: "none" },
      "> *": { flexShrink: 0 },
      // Important because the phone touch-target rule in styles/mobile.css
      // sets its own important minimum.
      "> .media-control-chip-grow": {
        flexShrink: 1,
        minWidth: "112px !important"
      }
    },

    ".chat-window-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      border: "none",
      borderRadius: BORDER_RADIUS.md,
      background: "transparent",
      color: theme.vars.palette.grey[400],
      cursor: "pointer",
      transition: `${MOTION.background}, color ${MOTION.fast}`,
      "& svg": { fontSize: "var(--fontSizeBig)" },
      "&:hover, &.active": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: 1
      }
    },

    // Bottom-left corner handle. The window is anchored top-right, so it is
    // the one corner that resizes both axes. The edges use ResizeHandle.
    ".chat-window-resize-corner": {
      position: "absolute",
      left: 0,
      bottom: 0,
      width: "14px",
      height: "14px",
      zIndex: Z_INDEX.raised + 1,
      cursor: "nesw-resize",
      touchAction: "none"
    },

    // Inline thread list, overlaying the message area when toggled on.
    ".chat-window-threads": {
      position: "absolute",
      inset: 0,
      zIndex: Z_INDEX.overlay,
      display: "flex",
      flexDirection: "column",
      background: theme.vars.palette.background.paper,
      [theme.getColorSchemeSelector("dark")]: {
        background: theme.vars.palette.grey[900]
      }
    },
    ".chat-window-threads-head": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    }
  });

interface CanvasChatWindowProps {
  /** Whether the window is shown. A closed window stays mounted. */
  open: boolean;
  onClose: () => void;
  /** Anchor offsets (px) of the window's top-right corner in the viewport,
   *  and the most height the canvas leaves it above the workflow toolbar. */
  anchor: { top: number; right: number; maxHeight: string };
  /** Phones pin the window as a sheet above the toolbar; no drag or resize. */
  isMobile: boolean;
}

/** Edges stop short of the bottom-left corner, which has its own handle. */
const leftEdgeSx = {
  top: 0,
  bottom: getSpacingPx(SPACING.lg),
  zIndex: Z_INDEX.raised + 1
};
const bottomEdgeSx = {
  left: getSpacingPx(SPACING.lg),
  right: 0,
  zIndex: Z_INDEX.raised + 1
};

const MOBILE_POSITION: DockPosition = { x: 0, y: 0 };

/**
 * The canvas chat as its own floating window: a header with the thread
 * title and thread controls, the live thread (reusing {@link ChatThreadView}
 * so messages, media output and streaming indicators render as in a chat
 * tab), and the prompt at the foot.
 *
 * The header drags the window, the left and bottom edges resize it, and the
 * threads button reveals the conversation list inline. The expand button hands
 * the thread off to a workspace chat tab.
 */
const CanvasChatWindow: React.FC<CanvasChatWindowProps> = ({
  open,
  onClose,
  anchor,
  isMobile
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const {
    windowWidth,
    windowHeight,
    storePosition,
    setStorePosition,
    resetPosition,
    threadsOpen,
    setThreadsOpen
  } = useCanvasChatDockStore(
    useShallow((s) => ({
      windowWidth: s.windowWidth,
      windowHeight: s.windowHeight,
      storePosition: s.position,
      setStorePosition: s.setPosition,
      resetPosition: s.resetPosition,
      threadsOpen: s.threadsOpen,
      setThreadsOpen: s.setThreadsOpen
    }))
  );

  // Draggable window. `useDraggable` owns the transform; the final offset is
  // clamped on-screen and persisted on release so it survives reloads.
  const windowRef = useDraggable<HTMLDivElement>({
    handle: ".chat-window-header",
    cancel: "button, input, textarea",
    position: isMobile ? MOBILE_POSITION : storePosition,
    disabled: isMobile,
    onStop: (pos) => setStorePosition(clampToViewport(windowRef.current, pos))
  });
  const startResize = useCanvasDockResize(windowRef);
  const edgeResize = useCanvasDockEdgeResize(windowRef);

  // Keep the window on-screen when the viewport shrinks. Skipped on mobile,
  // where the window is pinned and a desktop offset must not be overwritten.
  useEffect(() => {
    if (typeof window === "undefined" || isMobile) {
      return undefined;
    }
    const onResize = () => {
      setStorePosition(
        clampToViewport(
          windowRef.current,
          useCanvasChatDockStore.getState().position
        )
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setStorePosition, windowRef, isMobile]);

  const { chatError, clearChatError } = useGlobalChatStore(
    useShallow((state) => ({
      chatError: state.error,
      clearChatError: state.clearError
    }))
  );

  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const [searchQuery, setSearchQuery] = useState("");

  // Keep the thread list populated for the inline threads panel. `fetchThreads`
  // is the one loader: the query hook that used to live here fetched the same
  // rows and wrote them into this store, so the two raced on the same state.
  const { threadsLoaded, fetchThreads } = useGlobalChatStore(
    useShallow((state) => ({
      threadsLoaded: state.threadsLoaded,
      fetchThreads: state.fetchThreads
    }))
  );
  useEffect(() => {
    if (!threadsLoaded) {
      void fetchThreads();
    }
  }, [threadsLoaded, fetchThreads]);

  const {
    messages,
    rawStatus,
    current,
    total,
    statusMessage,
    runningToolCallId,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate
  } = useGlobalChatStore(
    useShallow((state) => ({
      messages: state.currentThreadId
        ? (state.messageCache[state.currentThreadId] ?? EMPTY_MESSAGES)
        : EMPTY_MESSAGES,
      rawStatus: state.status,
      current: state.progress.current,
      total: state.progress.total,
      statusMessage: state.statusMessage,
      runningToolCallId: state.currentRunningToolCallId,
      currentPlanningUpdate: state.currentPlanningUpdate,
      currentTaskUpdate: state.currentTaskUpdate,
      currentLogUpdate: state.currentLogUpdate
    }))
  );

  const {
    currentThreadId,
    threads,
    threadWorkflowId,
    workflowId,
    messageCache,
    title,
    createNewThread,
    switchThread,
    deleteThread
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      threads: state.threads,
      threadWorkflowId: state.threadWorkflowId,
      workflowId: state.workflowId,
      messageCache: state.messageCache,
      title: state.currentThreadId
        ? (state.threads[state.currentThreadId]?.title ?? null)
        : null,
      createNewThread: state.createNewThread,
      switchThread: state.switchThread,
      deleteThread: state.deleteThread
    }))
  );

  // ChatThreadView's status union excludes "stopping" — map it like GlobalChat.
  const status: ThreadStatus =
    rawStatus === "stopping" ? "connected" : rawStatus;

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleNewConversation = useCallback(async () => {
    try {
      const id = await createNewThread();
      switchThread(id);
      setThreadsOpen(false);
    } catch (err) {
      console.error("Failed to create new conversation:", err);
    }
  }, [createNewThread, switchThread, setThreadsOpen]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setThreadsOpen(false);
    },
    [switchThread, setThreadsOpen]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((err) => {
        console.error("Failed to delete conversation:", err);
        addNotification({
          type: "error",
          content: t("i18n-next5.conversation.deleteFailed")
        });
      });
    },
    [deleteThread, addNotification, t]
  );

  const handleExpand = useCallback(() => {
    if (currentThreadId) {
      openTab({
        type: "chat",
        ref: currentThreadId,
        mode: "view",
        projectId:
          useGlobalChatStore.getState().threads[currentThreadId]?.project_id
      });
    }
    navigate("/workspace");
  }, [openTab, navigate, currentThreadId]);

  const getThreadPreview = useCallback(
    (threadId: string) =>
      threads[threadId]
        ? threadPreview(threads[threadId].title, messageCache[threadId])
        : t("i18n-next5.conversation.emptyPreview"),
    [threads, messageCache, t]
  );

  // Scope the editor's thread list to the open workflow: a thread belongs to
  // it if the server bound it (`workflow_id`) or the client did before it was
  // persisted (`threadWorkflowId`). With no workflow bound, show everything.
  const threadsWithMessages = useMemo<Record<string, ThreadInfo>>(() => {
    const query = searchQuery.trim().toLowerCase();
    const result: Record<string, ThreadInfo> = {};
    for (const [id, thread] of Object.entries(threads)) {
      if (workflowId) {
        const threadWorkflow =
          thread.workflow_id ?? threadWorkflowId[id] ?? null;
        if (threadWorkflow !== workflowId) continue;
      }
      if (query) {
        const preview = getThreadPreview(id).toLowerCase();
        if (
          !preview.includes(query) &&
          !(thread.title || "").toLowerCase().includes(query)
        )
          continue;
      }
      result[id] = {
        id: thread.id,
        title: thread.title ?? undefined,
        updatedAt: thread.updated_at,
        messages: messageCache[id] || []
      };
    }
    return result;
  }, [
    threads,
    threadWorkflowId,
    workflowId,
    messageCache,
    searchQuery,
    getThreadPreview
  ]);

  return (
    <div
      ref={windowRef}
      css={cssStyles}
      className={cn(
        "canvas-chat-window",
        !open && "closed",
        isMobile && "mobile"
      )}
      role="dialog"
      aria-label={t("i18n-next5.conversation.title")}
      style={
        isMobile
          ? {
              left: getSpacingPx(SPACING.sm),
              right: getSpacingPx(SPACING.sm),
              top: anchor.top,
              height: `min(${windowHeight}px, ${anchor.maxHeight})`
            }
          : {
              top: anchor.top,
              right: anchor.right,
              width: `min(${windowWidth}px, calc(100vw - 32px))`,
              height: `min(${windowHeight}px, ${anchor.maxHeight})`
            }
      }
    >
      {!isMobile && (
        <>
          <ResizeHandle
            orientation="vertical"
            edge="start"
            invert
            invisible
            thickness={SPACING.md}
            ariaLabel={t("i18n-next5.conversation.resizeWidth")}
            sx={leftEdgeSx}
            {...edgeResize.left}
          />
          <ResizeHandle
            orientation="horizontal"
            edge="end"
            invisible
            thickness={SPACING.md}
            ariaLabel={t("i18n-next5.conversation.resizeHeight")}
            sx={bottomEdgeSx}
            {...edgeResize.bottom}
          />
          <div
            className="chat-window-resize-corner"
            onMouseDown={startResize("bottom-left")}
            aria-hidden
          />
        </>
      )}

      <div
        className="chat-window-header"
        onDoubleClick={isMobile ? undefined : resetPosition}
      >
        <span className="chat-window-mark" aria-hidden>
          <AutoAwesomeIcon />
        </span>
        <Text
          size="small"
          sx={{
            color: theme.vars.palette.text.primary,
            fontWeight: 500,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {title || t("i18n-next5.conversation.title")}
        </Text>
        <FlexRow gap={0.25} align="center" sx={{ ml: "auto", flexShrink: 0 }}>
          <Tooltip title={t("i18n-next5.conversation.openWorkspaceTab")}>
            <button
              type="button"
              className="chat-window-btn"
              onClick={handleExpand}
              aria-label={t("i18n-next5.conversation.openWorkspaceTab")}
            >
              <OpenInFullIcon />
            </button>
          </Tooltip>
          <Tooltip title={t("i18n-next5.conversation.showThreads")}>
            <button
              type="button"
              className={cn("chat-window-btn", threadsOpen && "active")}
              onClick={() => setThreadsOpen(!threadsOpen)}
              aria-label={t("i18n-next5.conversation.showThreads")}
              aria-pressed={threadsOpen}
            >
              <HistoryIcon />
            </button>
          </Tooltip>
          <Tooltip title={t("i18n-next5.conversation.newConversation")}>
            <button
              type="button"
              className="chat-window-btn"
              onClick={() => void handleNewConversation()}
              aria-label={t("i18n-next5.conversation.newConversation")}
            >
              <EditNoteIcon />
            </button>
          </Tooltip>
          <Tooltip title={t("i18n-next5.conversation.close")}>
            <button
              type="button"
              className="chat-window-btn"
              onClick={onClose}
              aria-label={t("i18n-next5.conversation.close")}
            >
              <CloseIcon />
            </button>
          </Tooltip>
        </FlexRow>
      </div>

      <div className="chat-window-body">
        {messages.length === 0 &&
        status !== "loading" &&
        status !== "streaming" ? (
          <div className="chat-window-empty">
            <ForumOutlinedIcon />
            <Text
              size="small"
              sx={{ color: theme.vars.palette.grey[200], fontWeight: 500 }}
            >
              {t("i18n-next5.conversation.startPrompt")}
            </Text>
            <Text size="small" sx={{ color: "inherit" }}>
              {t("i18n-next5.conversation.startDescription")}
            </Text>
          </div>
        ) : (
          <ChatThreadView
            messages={messages}
            status={status}
            progress={current}
            total={total}
            progressMessage={statusMessage}
            runningToolCallId={runningToolCallId}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
            currentLogUpdate={currentLogUpdate}
          />
        )}
        {threadsOpen && (
          <div className="chat-window-threads">
            <div className="chat-window-threads-head">
              <SearchInput
                placeholder={t("i18n-next5.conversation.searchThreads")}
                value={searchQuery}
                onChange={setSearchQuery}
                fullWidth
                showClear={false}
              />
              <Tooltip title={t("i18n-next5.conversation.closeThreads")}>
                <button
                  type="button"
                  className="chat-window-btn"
                  onClick={() => setThreadsOpen(false)}
                  aria-label={t("i18n-next5.conversation.closeThreads")}
                >
                  <CloseIcon />
                </button>
              </Tooltip>
            </div>
            <ScrollArea fullHeight>
              <ThreadList
                threads={threadsWithMessages}
                currentThreadId={currentThreadId}
                onNewThread={() => void handleNewConversation()}
                onSelectThread={handleSelectThread}
                onDeleteThread={handleDeleteThread}
                getThreadPreview={getThreadPreview}
              />
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="chat-window-composer">
        {chatError && (
          <AlertBanner
            severity="error"
            compact
            onClose={() => clearChatError()}
            sx={{ borderRadius: BORDER_RADIUS.lg }}
          >
            <FlexRow align="center" gap={SPACING.sm}>
              <span>{chatError}</span>
              <ProviderFailureReportButton errorText={chatError} />
            </FlexRow>
          </AlertBanner>
        )}
        <CanvasMediaComposer />
      </div>
    </div>
  );
};

export default memo(CanvasChatWindow);
