/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CloseIcon from "@mui/icons-material/Close";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";

import {
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
import useCanvasChatDockStore from "../../stores/CanvasChatDockStore";
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

type ThreadStatus = React.ComponentProps<typeof ChatThreadView>["status"];

const EMPTY_MESSAGES: Message[] = [];

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: "hidden",
    // theme.palette.mode is fixed to the default scheme under the CSS-vars
    // theme, so the dark look goes through the `.dark` color-scheme selector.
    background: theme.vars.palette.background.paper,
    backdropFilter: "blur(16px)",
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    boxShadow: `0 1px 2px rgb(${theme.vars.palette.common.blackChannel} / 0.04), 0 8px 24px rgb(${theme.vars.palette.common.blackChannel} / 0.08)`,
    [theme.getColorSchemeSelector("dark")]: {
      background: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: `0 10px 40px rgb(${theme.vars.palette.common.blackChannel} / 0.45)`
    },

    ".convo-overlay-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.75),
      padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0,
      cursor: "grab",
      "&:active": { cursor: "grabbing" }
    },

    // The thread view paints `background.default` for the full-page chat;
    // inside the glass overlay that reads as a mismatched slab of black, so
    // let the overlay surface show through and tighten the vertical padding.
    ".chat-thread-view-root": {
      background: "transparent",
      padding: theme.spacing(1, 0)
    },

    ".convo-drag-grip": {
      display: "inline-flex",
      alignItems: "center",
      color: theme.vars.palette.grey[600],
      "& svg": { fontSize: "var(--fontSizeBig)" }
    },

    ".convo-overlay-body": {
      flex: 1,
      minHeight: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column"
    },

    // Friendly hint shown while the thread has no messages yet.
    ".convo-empty": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(4),
      textAlign: "center",
      color: theme.vars.palette.grey[500],
      "& > svg": {
        fontSize: 28,
        opacity: 0.4,
        marginBottom: theme.spacing(1)
      }
    },

    ".convo-icon-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "26px",
      height: "26px",
      border: "none",
      borderRadius: BORDER_RADIUS.pill,
      background: "transparent",
      color: theme.vars.palette.grey[400],
      cursor: "pointer",
      transition: `${MOTION.background}, color ${MOTION.fast}`,
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

    // Corner resize handles. The overlay grows upward from the composer, so
    // only the top corners resize height; they also resize the dock width.
    // The edges use ResizeHandle.
    ".convo-resize": {
      position: "absolute",
      zIndex: Z_INDEX.raised + 1,
      touchAction: "none"
    },
    ".convo-resize-tl": {
      top: 0,
      left: 0,
      width: 14,
      height: 14,
      cursor: "nwse-resize"
    },
    ".convo-resize-tr": {
      top: 0,
      right: 0,
      width: 14,
      height: 14,
      cursor: "nesw-resize"
    },

    // Inline thread list, overlaying the message area when toggled on.
    ".convo-threads-panel": {
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
    ".convo-threads-head": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    }
  });

interface ConversationOverlayProps {
  /** Collapse the overlay (the composer keeps a toggle to reopen it). */
  onCollapse: () => void;
}

/** Side edges stop short of the top corners, which have their own handles. */
const sideEdgeSx = {
  top: getSpacingPx(SPACING.lg),
  bottom: 0,
  zIndex: Z_INDEX.raised + 1
};

/**
 * Floating, auto-updating view of the active chat thread, shown above the
 * canvas composer. Reuses {@link ChatThreadView} so messages, media output and
 * streaming indicators render exactly as in a chat tab.
 *
 * The overlay header doubles as the dock's drag handle; the surrounding edges
 * resize it. A threads button reveals the conversation list inline, and an
 * expand button hands the thread off to a workspace chat tab.
 */
const ConversationOverlay: React.FC<ConversationOverlayProps> = ({
  onCollapse
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startResize = useCanvasDockResize(overlayRef);
  const edgeResize = useCanvasDockEdgeResize(overlayRef);

  const overlayHeight = useCanvasChatDockStore((s) => s.overlayHeight);
  const { threadsOpen, setThreadsOpen } = useCanvasChatDockStore(
    useShallow((s) => ({
      threadsOpen: s.threadsOpen,
      setThreadsOpen: s.setThreadsOpen
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
        ? state.messageCache[state.currentThreadId] ?? EMPTY_MESSAGES
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
        ? state.threads[state.currentThreadId]?.title ?? null
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
          content: "Could not delete the conversation. Please try again."
        });
      });
    },
    [deleteThread, addNotification]
  );

  const handleExpand = useCallback(() => {
    if (currentThreadId) {
      openTab({
        type: "chat",
        ref: currentThreadId,
        mode: "view",
        projectId: useGlobalChatStore.getState().threads[currentThreadId]?.project_id
      });
    }
    navigate("/workspace");
  }, [openTab, navigate, currentThreadId]);

  const getThreadPreview = useCallback(
    (threadId: string) =>
      threads[threadId]
        ? threadPreview(threads[threadId].title, messageCache[threadId])
        : "Empty conversation",
    [threads, messageCache]
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
        ) continue;
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
      ref={overlayRef}
      css={cssStyles}
      className="conversation-overlay"
      style={{ height: `clamp(160px, ${overlayHeight}px, 78vh)` }}
    >
      {/* Edge / corner resize handles */}
      <ResizeHandle
        orientation="horizontal"
        edge="start"
        invert
        invisible
        thickness={SPACING.md}
        ariaLabel="Resize conversation height"
        sx={{
          left: getSpacingPx(SPACING.lg),
          right: getSpacingPx(SPACING.lg),
          zIndex: Z_INDEX.raised + 1
        }}
        {...edgeResize.top}
      />
      <ResizeHandle
        orientation="vertical"
        edge="start"
        invert
        invisible
        thickness={SPACING.md}
        ariaLabel="Resize conversation width from the left"
        sx={sideEdgeSx}
        {...edgeResize.side}
      />
      <ResizeHandle
        orientation="vertical"
        edge="end"
        invisible
        thickness={SPACING.md}
        ariaLabel="Resize conversation width from the right"
        sx={sideEdgeSx}
        {...edgeResize.side}
      />
      <div
        className="convo-resize convo-resize-tl"
        onMouseDown={startResize("top-left")}
        aria-hidden
      />
      <div
        className="convo-resize convo-resize-tr"
        onMouseDown={startResize("top-right")}
        aria-hidden
      />

      <div className="convo-overlay-header dock-drag-handle">
        <span className="convo-drag-grip" aria-hidden>
          <DragIndicatorIcon />
        </span>
        <Text
          size="small"
          sx={{
            color: theme.vars.palette.text.primary,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {title || "Conversation"}
        </Text>
        <FlexRow gap={0.5} align="center" sx={{ ml: "auto" }}>
          <Tooltip title="Show threads">
            <button
              type="button"
              className={`convo-icon-btn${threadsOpen ? " active" : ""}`}
              onClick={() => setThreadsOpen(!threadsOpen)}
              aria-label="Show threads"
              aria-pressed={threadsOpen}
            >
              <FormatListBulletedIcon />
            </button>
          </Tooltip>
          <Tooltip title="Open in a workspace tab">
            <button
              type="button"
              className="convo-icon-btn"
              onClick={handleExpand}
              aria-label="Open in a workspace tab"
            >
              <OpenInNewIcon />
            </button>
          </Tooltip>
          <Tooltip title="New conversation">
            <button
              type="button"
              className="convo-icon-btn"
              onClick={() => void handleNewConversation()}
              aria-label="New conversation"
            >
              <AddCommentOutlinedIcon />
            </button>
          </Tooltip>
          <Tooltip title="Hide conversation">
            <button
              type="button"
              className="convo-icon-btn"
              onClick={onCollapse}
              aria-label="Hide conversation"
            >
              <KeyboardArrowDownIcon />
            </button>
          </Tooltip>
        </FlexRow>
      </div>
      <div className="convo-overlay-body">
        {messages.length === 0 &&
        status !== "loading" &&
        status !== "streaming" ? (
          <div className="convo-empty">
            <ForumOutlinedIcon />
            <Text
              size="small"
              sx={{ color: theme.vars.palette.grey[200], fontWeight: 500 }}
            >
              Start a conversation
            </Text>
            <Text size="small" sx={{ color: "inherit" }}>
              Ask about this workflow, or type @ to reference an asset.
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
          <div className="convo-threads-panel">
            <div className="convo-threads-head">
              <SearchInput
                placeholder="Search threads"
                value={searchQuery}
                onChange={setSearchQuery}
                fullWidth
                showClear={false}
              />
              <Tooltip title="Close threads">
                <button
                  type="button"
                  className="convo-icon-btn"
                  onClick={() => setThreadsOpen(false)}
                  aria-label="Close threads"
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
    </div>
  );
};

export default memo(ConversationOverlay);
