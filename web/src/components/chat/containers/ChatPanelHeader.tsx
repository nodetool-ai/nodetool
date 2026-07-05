/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import AddIcon from "@mui/icons-material/Add";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  FlexRow,
  Text,
  ToolbarIconButton,
  Popover,
  ScrollArea,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import ThreadList from "../thread/ThreadList";
import type { ThreadInfo } from "../types/thread.types";
import type { Message, MessageTextContent } from "../../../stores/ApiTypes";

interface ChatPanelHeaderProps {
  /** Start a fresh chat. Panel-specific (the app builder re-binds its workflow). */
  onNewChat: () => void;
  /** Select an existing thread. Defaults to the store's switchThread. */
  onSelectThread?: (id: string) => void;
  /** Optional label shown on the left of the header. */
  title?: React.ReactNode;
}

/**
 * Canonical action strip for the embedded chat panels (timeline editor, app
 * builder, …): new chat, thread list, and a jump to the fullscreen chat. All
 * three operate on the shared GlobalChatStore.
 */
const ChatPanelHeader: React.FC<ChatPanelHeaderProps> = ({
  onNewChat,
  onSelectThread,
  title
}) => {
  const navigate = useNavigate();
  const threadsAnchorRef = useRef<HTMLButtonElement>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);

  const { threads, currentThreadId, messageCache, switchThread, deleteThread } =
    useGlobalChatStore(
      useShallow((state) => ({
        threads: state.threads,
        currentThreadId: state.currentThreadId,
        messageCache: state.messageCache,
        switchThread: state.switchThread,
        deleteThread: state.deleteThread
      }))
    );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      const thread = threads?.[threadId];
      if (!thread) return "Empty conversation";
      if (thread.title) return thread.title;
      const threadMessages = messageCache[threadId];
      const firstUserMessage = threadMessages?.find(
        (msg: Message) => msg.role === "user"
      );
      if (!firstUserMessage) return "New conversation";
      const content =
        typeof firstUserMessage.content === "string"
          ? firstUserMessage.content
          : Array.isArray(firstUserMessage.content) &&
              firstUserMessage.content[0]?.type === "text"
            ? (firstUserMessage.content[0] as MessageTextContent).text
            : "[Media message]";
      return content
        ? content.substring(0, 50) + (content.length > 50 ? "..." : "")
        : "New conversation";
    },
    [threads, messageCache]
  );

  const threadsWithMessages: Record<string, ThreadInfo> = useMemo(() => {
    if (!threads) return {};
    return Object.fromEntries(
      Object.entries(threads).map(([id, thread]) => [
        id,
        {
          id: thread.id,
          title: thread.title ?? undefined,
          updatedAt: thread.updated_at,
          messages: messageCache[id] || []
        }
      ])
    );
  }, [threads, messageCache]);

  const handleSelectThread = useCallback(
    (id: string) => {
      (onSelectThread ?? switchThread)(id);
      setThreadsOpen(false);
    },
    [onSelectThread, switchThread]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((error) => {
        console.error("Failed to delete thread:", error);
      });
    },
    [deleteThread]
  );

  const handleOpenFullscreen = useCallback(() => {
    navigate(currentThreadId ? `/chat/${currentThreadId}` : "/chat");
  }, [navigate, currentThreadId]);

  const handleOpenInNewTab = useCallback(() => {
    const path = currentThreadId ? `/chat/${currentThreadId}` : "/chat";
    window.open(path, "_blank", "noopener,noreferrer");
  }, [currentThreadId]);

  return (
    <FlexRow
      align="center"
      justify="space-between"
      sx={{
        flexShrink: 0,
        px: getSpacingPx(SPACING.sm),
        py: getSpacingPx(SPACING.xs),
        borderBottom: 1,
        borderColor: "divider"
      }}
    >
      {title ? (
        <Text size="small" color="secondary" sx={{ pl: 0.5 }}>
          {title}
        </Text>
      ) : (
        <span />
      )}
      <FlexRow align="center" gap={0.25}>
        <ToolbarIconButton
          onClick={onNewChat}
          tooltip="New chat"
          icon={<AddIcon fontSize="small" />}
        />
        <ToolbarIconButton
          ref={threadsAnchorRef}
          onClick={() => setThreadsOpen(true)}
          tooltip="Conversations"
          icon={<ForumOutlinedIcon fontSize="small" />}
        />
        <ToolbarIconButton
          onClick={handleOpenFullscreen}
          tooltip="Open fullscreen chat"
          icon={<OpenInFullIcon fontSize="small" />}
        />
        <ToolbarIconButton
          onClick={handleOpenInNewTab}
          tooltip="Open in new tab"
          icon={<OpenInNewIcon fontSize="small" />}
        />
      </FlexRow>

      <Popover
        anchorEl={threadsAnchorRef.current}
        open={threadsOpen}
        onClose={() => setThreadsOpen(false)}
        placement="bottom-right"
        paperSx={{ width: 320, maxHeight: 420 }}
      >
        <ScrollArea style={{ maxHeight: 420 }}>
          <ThreadList
            threads={threadsWithMessages}
            currentThreadId={currentThreadId}
            onNewThread={onNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </ScrollArea>
      </Popover>
    </FlexRow>
  );
};

export default ChatPanelHeader;
