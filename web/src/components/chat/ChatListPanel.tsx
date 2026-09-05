/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import AddIcon from "@mui/icons-material/Add";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import ThreadList from "./thread/ThreadList";
import type { ThreadInfo } from "./types/thread.types";
import { threadPreview } from "./utils/threadUtils";
import {
  EmptyState,
  FlexColumn,
  ScrollArea,
  ShimmerText,
  Text,
  Tooltip,
  ToolbarIconButton
} from "../ui_primitives";

/** Opens a thread as a chat tab, leaving the rest of the workspace in place. */
const useOpenThreadTab = () => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (threadId: string, title?: string) => {
      openTab({
        type: "chat",
        ref: threadId,
        mode: "view",
        title: title || "New chat"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
    },
    [location.pathname, navigate, openTab]
  );
};

export const CreateChatButton = memo(function CreateChatButton() {
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const openThreadTab = useOpenThreadTab();

  const handleCreate = useCallback(async () => {
    try {
      const threadId = await createNewThread();
      openThreadTab(threadId);
    } catch (error) {
      console.error("Failed to create new chat thread:", error);
      addNotification({
        type: "error",
        content: "Could not start a new conversation. Please try again."
      });
    }
  }, [createNewThread, openThreadTab, addNotification]);

  return (
    <Tooltip title="New chat" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New chat"
        onClick={() => void handleCreate()}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

/**
 * Left-panel list of chat threads. Selecting one opens it as a chat tab, so a
 * conversation is a workspace document like every other — the panel keeps the
 * thread list of the old fullscreen chat without taking over the screen.
 */
const ChatListPanel = () => {
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();

  useEffect(() => {
    if (autoFocusEnabled) {
      searchRef.current?.focus();
    }
  }, [autoFocusEnabled]);

  const { isLoading, threadsError, threads, messageCache, deleteThread } =
    useGlobalChatStore(
      useShallow((state) => ({
        isLoading: state.isLoadingThreads,
        threadsError: state.error,
        threads: state.threads,
        messageCache: state.messageCache,
        deleteThread: state.deleteThread
      }))
    );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openThreadTab = useOpenThreadTab();

  const activeThreadId = activeTabId?.startsWith("chat:")
    ? activeTabId.slice("chat:".length)
    : null;

  const getThreadPreview = useCallback(
    (threadId: string) =>
      threads[threadId]
        ? threadPreview(threads[threadId].title, messageCache[threadId])
        : "Empty conversation",
    [threads, messageCache]
  );

  const threadsWithMessages = useMemo<Record<string, ThreadInfo>>(() => {
    const needle = filterValue.trim().toLowerCase();
    const result: Record<string, ThreadInfo> = {};
    for (const [id, thread] of Object.entries(threads)) {
      const preview = threadPreview(thread.title, messageCache[id]);
      if (needle && !preview.toLowerCase().includes(needle)) {
        continue;
      }
      result[id] = {
        id: thread.id,
        title: thread.title ?? undefined,
        updatedAt: thread.updated_at,
        messages: messageCache[id] ?? []
      };
    }
    return result;
  }, [threads, messageCache, filterValue]);

  const handleSelectThread = useCallback(
    (id: string) => {
      openThreadTab(id, threads[id]?.title ?? undefined);
      setVisibility(false);
    },
    [openThreadTab, threads, setVisibility]
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

  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const handleNewThread = useCallback(async () => {
    try {
      openThreadTab(await createNewThread());
    } catch (error) {
      console.error("Failed to create new chat thread:", error);
    }
  }, [createNewThread, openThreadTab]);

  const isEmpty = Object.keys(threadsWithMessages).length === 0;

  return (
    <FlexColumn fullHeight fullWidth gap={0} sx={{ minHeight: 0 }}>
      <FlexColumn sx={{ pb: 1 }}>
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search conversations..."
        />
      </FlexColumn>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <Text
            size="small"
            color="secondary"
            role="status"
            aria-live="polite"
          >
            <ShimmerText>Loading conversations…</ShimmerText>
          </Text>
        </FlexColumn>
      ) : threadsError ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            variant="error"
            title="Could not load conversations"
            description={threadsError}
          />
        </FlexColumn>
      ) : isEmpty && !filterValue ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title="No conversations yet"
            description="Start a new chat with the + button above."
          />
        </FlexColumn>
      ) : (
        <ScrollArea fullHeight>
          <ThreadList
            threads={threadsWithMessages}
            currentThreadId={activeThreadId}
            onNewThread={() => void handleNewThread()}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
            isFiltered={filterValue.trim().length > 0}
          />
        </ScrollArea>
      )}
    </FlexColumn>
  );
};

export default memo(ChatListPanel);
