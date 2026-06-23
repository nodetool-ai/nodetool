/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CloseIcon from "@mui/icons-material/Close";

import {
  Text,
  Tooltip,
  FlexRow,
  ScrollArea,
  SearchInput,
  MOTION,
  BORDER_RADIUS,
  Z_INDEX
} from "../ui_primitives";
import useGlobalChatStore, {
  useThreadsQuery
} from "../../stores/GlobalChatStore";
import useCanvasChatDockStore from "../../stores/CanvasChatDockStore";
import { useCanvasDockResize } from "../../hooks/handlers/useCanvasDockResize";
import ChatThreadView from "../chat/thread/ChatThreadView";
import ThreadList from "../chat/thread/ThreadList";
import type { ThreadInfo } from "../chat/types/thread.types";
import type { Message, MessageTextContent } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
    background:
      theme.palette.mode === "light"
        ? theme.vars.palette.background.paper
        : theme.vars.palette.grey[900],
    backdropFilter: "blur(16px)",
    border: `1px solid ${
      theme.palette.mode === "light"
        ? theme.vars.palette.grey[600]
        : theme.vars.palette.divider
    }`,
    boxShadow:
      theme.palette.mode === "light"
        ? "0 1px 2px rgba(26,23,21,0.04), 0 8px 24px rgba(26,23,21,0.08)"
        : "0 10px 40px rgba(0,0,0,0.45)",

    ".convo-overlay-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: `${theme.spacing(0.75)} ${theme.spacing(1.5)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0,
      cursor: "grab",
      "&:active": { cursor: "grabbing" }
    },

    ".convo-drag-grip": {
      display: "inline-flex",
      alignItems: "center",
      color: theme.vars.palette.grey[600],
      "& svg": { fontSize: "18px" }
    },

    ".convo-overlay-body": {
      flex: 1,
      minHeight: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column"
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

    // Resize handles around the overlay edges. The overlay grows upward from
    // the composer, so only the top edge / top corners resize height; the side
    // edges resize the whole dock width.
    ".convo-resize": {
      position: "absolute",
      zIndex: 2,
      touchAction: "none"
    },
    ".convo-resize-top": {
      top: 0,
      left: 10,
      right: 10,
      height: 8,
      cursor: "ns-resize"
    },
    ".convo-resize-left": {
      top: 10,
      bottom: 0,
      left: 0,
      width: 8,
      cursor: "ew-resize"
    },
    ".convo-resize-right": {
      top: 10,
      bottom: 0,
      right: 0,
      width: 8,
      cursor: "ew-resize"
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
      background:
        theme.palette.mode === "light"
          ? theme.vars.palette.background.paper
          : theme.vars.palette.grey[900]
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

/**
 * Floating, auto-updating view of the active chat thread, shown above the
 * canvas composer. Reuses {@link ChatThreadView} so messages, media output and
 * streaming indicators render exactly as in the global chat.
 *
 * The overlay header doubles as the dock's drag handle; the surrounding edges
 * resize it. A threads button reveals the conversation list inline, and an
 * expand button hands off to the full-screen `/chat` view.
 */
const ConversationOverlay: React.FC<ConversationOverlayProps> = ({
  onCollapse
}) => {
  const theme = useTheme();
  const overlayRef = useRef<HTMLDivElement>(null);
  const startResize = useCanvasDockResize(overlayRef);

  const overlayHeight = useCanvasChatDockStore((s) => s.overlayHeight);
  const { threadsOpen, setThreadsOpen } = useCanvasChatDockStore(
    useShallow((s) => ({
      threadsOpen: s.threadsOpen,
      setThreadsOpen: s.setThreadsOpen
    }))
  );

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Keep the thread list populated for the inline threads panel.
  useThreadsQuery();

  const messages = useGlobalChatStore((state) =>
    state.currentThreadId
      ? state.messageCache[state.currentThreadId] ?? EMPTY_MESSAGES
      : EMPTY_MESSAGES
  );
  const rawStatus = useGlobalChatStore((state) => state.status);
  const { current, total } = useGlobalChatStore(
    useShallow((state) => state.progress)
  );
  const statusMessage = useGlobalChatStore((state) => state.statusMessage);
  const runningToolCallId = useGlobalChatStore(
    (state) => state.currentRunningToolCallId
  );
  const runningToolMessage = useGlobalChatStore(
    (state) => state.currentToolMessage
  );
  const currentPlanningUpdate = useGlobalChatStore(
    (state) => state.currentPlanningUpdate
  );
  const currentTaskUpdate = useGlobalChatStore(
    (state) => state.currentTaskUpdate
  );
  const currentLogUpdate = useGlobalChatStore((state) => state.currentLogUpdate);

  const {
    currentThreadId,
    threads,
    messageCache,
    title,
    createNewThread,
    switchThread,
    deleteThread
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      threads: state.threads,
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
    rawStatus === "stopping" ? "loading" : (rawStatus as ThreadStatus);

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
      });
    },
    [deleteThread]
  );

  const handleExpand = useCallback(() => {
    navigate(currentThreadId ? `/chat/${currentThreadId}` : "/chat");
  }, [navigate, currentThreadId]);

  const getThreadPreview = useCallback(
    (threadId: string) => {
      const thread = threads[threadId];
      if (!thread) {
        return "Empty conversation";
      }
      if (thread.title) {
        return thread.title;
      }
      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }
      const firstUserMessage = threadMessages.find(
        (msg: Message) => msg.role === "user"
      );
      if (firstUserMessage) {
        const content =
          typeof firstUserMessage.content === "string"
            ? firstUserMessage.content
            : Array.isArray(firstUserMessage.content) &&
                firstUserMessage.content[0]?.type === "text"
              ? (firstUserMessage.content[0] as MessageTextContent).text
              : "[Media message]";
        return content?.substring(0, 50) + (content?.length > 50 ? "..." : "");
      }
      return "New conversation";
    },
    [threads, messageCache]
  );

  const threadsWithMessages = useMemo<Record<string, ThreadInfo>>(() => {
    const query = searchQuery.trim().toLowerCase();
    return Object.fromEntries(
      Object.entries(threads)
        .map(([id, thread]): [string, ThreadInfo] => [
          id,
          {
            id: thread.id,
            title: thread.title ?? undefined,
            updatedAt: thread.updated_at,
            messages: messageCache[id] || []
          }
        ])
        .filter(([id, thread]) => {
          if (!query) {
            return true;
          }
          const preview = getThreadPreview(id).toLowerCase();
          return (
            preview.includes(query) ||
            (thread.title || "").toLowerCase().includes(query)
          );
        })
    );
  }, [threads, messageCache, searchQuery, getThreadPreview]);

  return (
    <div
      ref={overlayRef}
      css={styles(theme)}
      className="conversation-overlay"
      style={{ height: `clamp(160px, ${overlayHeight}px, 78vh)` }}
    >
      {/* Edge / corner resize handles */}
      <div
        className="convo-resize convo-resize-top"
        onMouseDown={startResize("top")}
        role="separator"
        aria-label="Resize conversation height"
      />
      <div
        className="convo-resize convo-resize-left"
        onMouseDown={startResize("left")}
        aria-hidden
      />
      <div
        className="convo-resize convo-resize-right"
        onMouseDown={startResize("right")}
        aria-hidden
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
            color: theme.vars.palette.grey[300],
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {title || "Conversation"}
        </Text>
        <FlexRow gap={0.5} align="center" sx={{ ml: "auto" }}>
          <Tooltip title="Show threads" delay={TOOLTIP_ENTER_DELAY}>
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
          <Tooltip title="Open in full chat" delay={TOOLTIP_ENTER_DELAY}>
            <button
              type="button"
              className="convo-icon-btn"
              onClick={handleExpand}
              aria-label="Open in full chat"
            >
              <OpenInFullIcon />
            </button>
          </Tooltip>
          <Tooltip title="New conversation" delay={TOOLTIP_ENTER_DELAY}>
            <button
              type="button"
              className="convo-icon-btn"
              onClick={() => void handleNewConversation()}
              aria-label="New conversation"
            >
              <AddCommentOutlinedIcon />
            </button>
          </Tooltip>
          <Tooltip title="Hide conversation" delay={TOOLTIP_ENTER_DELAY}>
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
        <ChatThreadView
          messages={messages}
          status={status}
          progress={current}
          total={total}
          progressMessage={statusMessage}
          runningToolCallId={runningToolCallId}
          runningToolMessage={runningToolMessage}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
        />
        {threadsOpen && (
          <div className="convo-threads-panel">
            <div className="convo-threads-head">
              <SearchInput
                placeholder="Search threads…"
                value={searchQuery}
                onChange={setSearchQuery}
                fullWidth
                showClear={false}
              />
              <Tooltip title="Close threads" delay={TOOLTIP_ENTER_DELAY}>
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
