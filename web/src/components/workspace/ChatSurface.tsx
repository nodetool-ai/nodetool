import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { FlexColumn, Text } from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message, LanguageModel } from "../../stores/ApiTypes";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

interface ChatSurfaceProps {
  refId: string;
  active: boolean;
}

const NO_MESSAGES: Message[] = [];

/**
 * The document surface for a chat thread tab. `refId` is the thread id.
 *
 * Each tab is a live, independent session: messages, streaming status,
 * progress, and agent updates all come from the thread's own entry in
 * `GlobalChatStore.threadRuntime`, and sends/stops target `refId` explicitly.
 * Several chat tabs can generate concurrently — a tab keeps streaming while
 * hidden. Activating a tab additionally makes its thread the store's current
 * one so thread-global UI (sidebar selection, conversation header) follows
 * the focused tab.
 */
const ChatSurface = ({ refId, active }: ChatSurfaceProps) => {
  const [notFound, setNotFound] = useState(false);

  const runtime = useThreadRuntime(refId);

  const { currentThreadId, thread, messages } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      thread: state.threads[refId],
      messages: state.messageCache[refId] ?? NO_MESSAGES
    }))
  );

  const {
    connect,
    fetchThread,
    switchThread,
    loadMessages,
    createNewThread,
    sendMessage,
    stopGeneration,
    selectedModel,
    setSelectedModel
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      fetchThread: state.fetchThread,
      switchThread: state.switchThread,
      loadMessages: state.loadMessages,
      createNewThread: state.createNewThread,
      sendMessage: state.sendMessage,
      stopGeneration: state.stopGeneration,
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel
    }))
  );

  const workflowId = useGlobalChatStore(
    (state) =>
      state.threads[refId]?.workflow_id ?? state.threadWorkflowId[refId] ?? null
  );

  // The pi transport drives the legacy top-level status (single-thread), not
  // threadRuntime — fall back to it so a pi run still shows as streaming.
  const piStatus = useGlobalChatStore((state) =>
    state.mode === "pi" && state.currentThreadId === refId
      ? state.status
      : null
  );

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);

  // Connect the shared chat WebSocket. Deliberately no disconnect on unmount:
  // the connection is a singleton shared by every mounted chat tab, so closing
  // one tab must not sever the others.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect chat:", err);
    });
  }, [connect]);

  // Hydrate the thread on mount: a restored tab may reference a thread the
  // store hasn't seen yet. Mark the tab when the thread no longer exists.
  const threadKnown = thread !== undefined;
  useEffect(() => {
    if (notFound) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
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
        await loadMessages(refId);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat thread:", error);
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [notFound, threadKnown, refId, fetchThread, loadMessages]);

  // The active tab's thread becomes the store's current one (sidebar
  // selection, header, persistent composer default). Generation itself is
  // per-thread and does not depend on this.
  useEffect(() => {
    if (active && threadKnown && currentThreadId !== refId) {
      switchThread(refId);
    }
  }, [active, threadKnown, currentThreadId, refId, switchThread]);

  // Keep the tab title in sync with the thread title (the server names a
  // thread after its first exchange).
  const threadTitle = thread?.title;
  useEffect(() => {
    if (threadTitle) {
      setTitle(refId, "chat", threadTitle);
    }
  }, [threadTitle, refId, setTitle]);

  const handleSendMessage = useCallback(
    (message: Message) => sendMessage(message, refId),
    [sendMessage, refId]
  );

  const handleStop = useCallback(() => {
    stopGeneration(refId);
  }, [stopGeneration, refId]);

  const handleModelChange = useCallback(
    (model: LanguageModel) => setSelectedModel(model),
    [setSelectedModel]
  );

  const handleNewChat = useCallback(async () => {
    try {
      const threadId = await createNewThread();
      openTab({ type: "chat", ref: threadId, mode: "view", title: "New chat" });
    } catch (error) {
      console.error("Failed to create new chat thread:", error);
    }
  }, [createNewThread, openTab]);

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
        threadId={refId}
        status={(() => {
          const status = piStatus ?? runtime.status;
          if (status === "idle") return "connected";
          if (status === "stopping") return "loading";
          return status;
        })()}
        messages={messages}
        sendMessage={handleSendMessage}
        progress={runtime.progress.current}
        total={runtime.progress.total}
        progressMessage={runtime.statusMessage}
        runningToolCallId={runtime.runningToolCallId}
        runningToolMessage={runtime.toolMessage}
        model={selectedModel}
        onModelChange={handleModelChange}
        onStop={handleStop}
        onNewChat={() => void handleNewChat()}
        currentPlanningUpdate={runtime.planningUpdate}
        currentTaskUpdate={runtime.taskUpdate}
        currentLogUpdate={runtime.logUpdate}
        workflowId={workflowId}
        showConversationHeader={currentThreadId === refId}
      />
    </FlexColumn>
  );
};

export default ChatSurface;
