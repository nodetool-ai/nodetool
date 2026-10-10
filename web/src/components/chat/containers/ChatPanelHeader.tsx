/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import AddIcon from "@mui/icons-material/Add";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  DocsHelpLink,
  PanelHeader,
  ToolbarIconButton,
  Popover,
  ScrollArea
} from "../../ui_primitives";
import type { DocsTopic } from "../../../config/docsLinks";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import ThreadList from "../thread/ThreadList";
import type { ThreadInfo } from "../types/thread.types";
import { threadPreview } from "../utils/threadUtils";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

interface ChatPanelHeaderProps {
  /** Start a fresh chat. Panel-specific (the app builder re-binds its workflow). */
  onNewChat: () => void;
  /** Select an existing thread. Defaults to the store's switchThread. */
  onSelectThread?: (id: string) => void;
  /** Conversation displayed by this panel instance. */
  threadId?: string | null;
  /** Optional label shown on the left of the header. */
  title?: React.ReactNode;
  /** Short explanation shown when the title is hovered. */
  description?: string;
  /** Docs page the help icon points at. Defaults to the agents guide. */
  docsTopic?: DocsTopic;
  /** Name the help icon's tooltip uses. */
  docsLabel?: string;
  /** Limit the conversation picker to one project's threads. */
  projectId?: string;
}

/**
 * Canonical action strip for the embedded chat panels (timeline editor, app
 * builder, …): new chat, thread list, and a hand-off of the open thread to a
 * workspace chat tab. All three operate on the shared GlobalChatStore.
 */
const ChatPanelHeader: React.FC<ChatPanelHeaderProps> = ({
  onNewChat,
  onSelectThread,
  threadId,
  title,
  description,
  docsTopic = "agents",
  docsLabel = "Chat & agents",
  projectId
}) => {
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const threadsAnchorRef = useRef<HTMLButtonElement>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

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
  const selectedThreadId = threadId ?? currentThreadId;

  const getThreadPreview = useCallback(
    (threadId: string) =>
      threads?.[threadId]
        ? threadPreview(threads[threadId].title, messageCache[threadId])
        : "Empty conversation",
    [threads, messageCache]
  );

  const threadsWithMessages: Record<string, ThreadInfo> = useMemo(() => {
    if (!threads) return {};
    return Object.fromEntries(
      Object.entries(threads)
        .filter(
          ([, thread]) =>
            projectId === undefined ||
            (thread.project_id ?? "default") === projectId
        )
        .map(([id, thread]) => [
          id,
          {
            id: thread.id,
            title: thread.title ?? undefined,
            updatedAt: thread.updated_at,
            messages: messageCache[id] || []
          }
        ])
    );
  }, [threads, messageCache, projectId]);

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
        addNotification({
          type: "error",
          content: "Could not delete the conversation. Please try again."
        });
      });
    },
    [deleteThread, addNotification]
  );

  const handleOpenAsTab = useCallback(() => {
    if (selectedThreadId) {
      openTab({
        type: "chat",
        ref: selectedThreadId,
        mode: "view",
        projectId: useGlobalChatStore.getState().threads[selectedThreadId]?.project_id
      });
    }
    navigate("/workspace");
  }, [openTab, navigate, selectedThreadId]);

  return (
    <PanelHeader
      title={title}
      description={description}
      actions={
        <>
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
            onClick={handleOpenAsTab}
            tooltip="Open in a workspace tab"
            icon={<OpenInNewIcon fontSize="small" />}
          />
          <DocsHelpLink topic={docsTopic} label={docsLabel} />
        </>
      }
    >
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
            currentThreadId={selectedThreadId}
            onNewThread={onNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </ScrollArea>
      </Popover>
    </PanelHeader>
  );
};

export default ChatPanelHeader;
