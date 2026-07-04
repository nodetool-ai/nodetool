import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { FlexColumn, Text } from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

interface ChatSurfaceProps {
  refId: string;
  active: boolean;
}

const NO_MESSAGES: never[] = [];

/**
 * The document surface for a chat thread tab. `refId` is the thread id.
 *
 * GlobalChatStore is a single-active-thread store: streaming state, the
 * composer, and `sendMessage` all target `currentThreadId`. All workspace tabs
 * stay mounted in the shell, so only the *active* chat tab claims the store's
 * current thread (via `switchThread`); inactive tabs render their cached
 * message history and re-claim the thread when re-activated.
 */
const ChatSurface = ({ refId, active }: ChatSurfaceProps) => {
  const [notFound, setNotFound] = useState(false);

  const {
    currentThreadId,
    thread,
    cachedMessages,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      thread: state.threads[refId],
      cachedMessages: state.messageCache[refId],
      getCurrentMessagesSync: state.getCurrentMessagesSync
    }))
  );

  const {
    connect,
    fetchThread,
    switchThread,
    createNewThread,
    sendMessage,
    stopGeneration
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      fetchThread: state.fetchThread,
      switchThread: state.switchThread,
      createNewThread: state.createNewThread,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration
    }))
  );

  const {
    status,
    progress,
    statusMessage,
    currentLogUpdate,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread,
    currentRunningToolCallId,
    currentToolMessage,
    selectedModel,
    setSelectedModel,
    workflowId
  } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      progress: state.progress,
      statusMessage: state.statusMessage,
      currentLogUpdate: state.currentLogUpdate,
      currentPlanningUpdate: state.currentPlanningUpdate,
      currentTaskUpdate: state.currentTaskUpdate,
      currentTaskUpdateThreadId: state.currentTaskUpdateThreadId,
      lastTaskUpdatesByThread: state.lastTaskUpdatesByThread,
      currentRunningToolCallId: state.currentRunningToolCallId,
      currentToolMessage: state.currentToolMessage,
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel,
      workflowId: state.workflowId
    }))
  );

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);

  const isCurrent = currentThreadId === refId;

  // Connect the shared chat WebSocket. Deliberately no disconnect on unmount:
  // the connection is a singleton shared by every mounted chat tab, so closing
  // one tab must not sever the others.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect chat:", err);
    });
  }, [connect]);

  // The active chat tab owns the store's current thread. A restored tab may
  // reference a thread the store hasn't seen yet — fetch it first, and mark
  // the tab when the thread no longer exists on the server.
  const threadKnown = thread !== undefined;
  useEffect(() => {
    if (!active || isCurrent || notFound) {
      return;
    }
    let cancelled = false;
    const claim = async () => {
      try {
        if (!threadKnown) {
          const fetched = await fetchThread(refId);
          if (cancelled) {
            return;
          }
          if (!fetched) {
            setNotFound(true);
            return;
          }
        }
        switchThread(refId);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to open chat thread:", error);
        }
      }
    };
    void claim();
    return () => {
      cancelled = true;
    };
  }, [active, isCurrent, notFound, threadKnown, refId, fetchThread, switchThread]);

  // Keep the tab title in sync with the thread title (the server names a
  // thread after its first exchange).
  const threadTitle = thread?.title;
  useEffect(() => {
    if (threadTitle) {
      setTitle(refId, "chat", threadTitle);
    }
  }, [threadTitle, refId, setTitle]);

  const handleNewChat = useCallback(async () => {
    try {
      const threadId = await createNewThread();
      openTab({ type: "chat", ref: threadId, mode: "view", title: "New chat" });
    } catch (error) {
      console.error("Failed to create new chat thread:", error);
    }
  }, [createNewThread, openTab]);

  const messages = isCurrent
    ? getCurrentMessagesSync()
    : cachedMessages ?? NO_MESSAGES;

  const taskUpdateForDisplay = useMemo(() => {
    if (currentTaskUpdate && currentTaskUpdateThreadId === refId) {
      return currentTaskUpdate;
    }
    return lastTaskUpdatesByThread[refId] ?? null;
  }, [currentTaskUpdate, currentTaskUpdateThreadId, lastTaskUpdatesByThread, refId]);

  if (notFound) {
    return (
      <FlexColumn fullWidth fullHeight align="center" justify="center">
        <Text size="normal" weight={600}>
          Conversation not found
        </Text>
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight sx={{ minHeight: 0, overflow: "hidden" }}>
      <ChatView
        status={
          isCurrent
            ? status === "stopping"
              ? "loading"
              : status
            : "connected"
        }
        messages={messages}
        sendMessage={sendMessage}
        progress={isCurrent ? progress.current : 0}
        total={isCurrent ? progress.total : 0}
        progressMessage={isCurrent ? statusMessage : null}
        runningToolCallId={isCurrent ? currentRunningToolCallId : null}
        runningToolMessage={isCurrent ? currentToolMessage : null}
        model={selectedModel}
        onModelChange={setSelectedModel}
        onStop={stopGeneration}
        onNewChat={() => void handleNewChat()}
        currentPlanningUpdate={isCurrent ? currentPlanningUpdate : null}
        currentTaskUpdate={taskUpdateForDisplay}
        currentLogUpdate={isCurrent ? currentLogUpdate : null}
        workflowId={workflowId}
        showConversationHeader={isCurrent}
      />
    </FlexColumn>
  );
};

export default ChatSurface;
