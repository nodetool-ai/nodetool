import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { FlexColumn } from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import ProjectDocumentsSidebar from "../chat/sidebar/ProjectDocumentsSidebar";
import { clearChatTurn, peekChatTurn } from "../chat/pendingChatTurn";
import WelcomePlaceholder from "../chat/containers/WelcomePlaceholder";
import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import useChatDraftStore from "../../stores/ChatDraftStore";
import useThreadModel from "../../hooks/chat/useThreadModel";
import type { Message } from "../../stores/ApiTypes";
import {
  LOOSE_PROJECT_ID,
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import DocumentLoadStatus from "./DocumentLoadStatus";
import { buildUiContext } from "../../lib/chat/uiContext";

const whenChatStoreHydrated = (): Promise<void> => {
  const persistApi = useGlobalChatStore.persist;
  if (persistApi.hasHydrated()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    persistApi.onFinishHydration(() => resolve());
  });
};

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
  const runtime = useThreadRuntime(refId);
  // Until the thread's messages are in, an empty cache is indistinguishable
  // from an empty conversation, and the tab greets the user with the welcome
  // screen for a thread that has history.
  const [loadingThread, setLoadingThread] = useState(true);

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
    ensureLocalThread,
    switchThread,
    loadMessages,
    createNewThread,
    sendMessage,
    trySendMessage,
    stopGeneration
  } = useGlobalChatStore(
    useShallow((state) => ({
      connect: state.connect,
      fetchThread: state.fetchThread,
      ensureLocalThread: state.ensureLocalThread,
      switchThread: state.switchThread,
      loadMessages: state.loadMessages,
      createNewThread: state.createNewThread,
      sendMessage: state.sendMessage,
      trySendMessage: state.trySendMessage,
      stopGeneration: state.stopGeneration
    }))
  );

  // Each tab keeps its own model: a pick here never moves another tab's.
  const { model, setModel } = useThreadModel(refId);
  const connectionStatus = useGlobalChatStore((state) => state.status);
  const pendingTurnInFlight = useRef(false);

  const workflowId = useGlobalChatStore(
    (state) =>
      state.threads[refId]?.workflow_id ?? state.threadWorkflowId[refId] ?? null
  );

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const activeProjectId = useWorkspaceTabsStore((state) => state.activeProjectId);
  const personalProjectId = useWorkspaceTabsStore((state) => state.personalProjectId);
  const projectId = activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
    ? activeProjectId
    : personalProjectId;

  // Connect the shared chat WebSocket. Deliberately no disconnect on unmount:
  // the connection is a singleton shared by every mounted chat tab, so closing
  // one tab must not sever the others.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect chat:", err);
    });
  }, [connect]);

  // Hydrate after persist so a locally-created thread is not treated as
  // missing while rehydration is still in flight. The server creates the
  // row on the first message, so a 404 is an empty conversation.
  const threadKnown = thread !== undefined;
  useEffect(() => {
    let cancelled = false;
    setLoadingThread(true);
    const hydrate = async () => {
      try {
        await whenChatStoreHydrated();
        if (cancelled) {
          return;
        }
        if (!useGlobalChatStore.getState().threads[refId]) {
          const fetched = await fetchThread(refId);
          if (cancelled) {
            return;
          }
          if (!fetched && !useGlobalChatStore.getState().threads[refId]) {
            ensureLocalThread(refId);
          }
        }
        await loadMessages(refId);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat thread:", error);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [refId, fetchThread, ensureLocalThread, loadMessages]);

  // The home composer hands its turn to the normal chat after this tab has
  // loaded history, so the initial refresh cannot replace the optimistic send.
  useEffect(() => {
    if (loadingThread || pendingTurnInFlight.current) return;
    const content = peekChatTurn(refId);
    if (!content) return;
    pendingTurnInFlight.current = true;
    void trySendMessage(
      {
        type: "message",
        name: "",
        role: "user",
        provider: model.provider,
        model: model.id,
        content,
        ui_context: buildUiContext({ source: "workspace_chat" })
      },
      refId
    )
      .then((outcome) => {
        if (outcome.ok) clearChatTurn(refId);
      })
      .catch((error) => {
        // A thrown send has already placed the turn in the local transcript.
        clearChatTurn(refId);
        console.error("Failed to send the opening chat turn:", error);
      })
      .finally(() => {
        pendingTurnInFlight.current = false;
      });
  }, [loadingThread, refId, model, connectionStatus, trySendMessage]);

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

  // A suggestion is a starting point, not a finished turn: "Analyze an image"
  // used to go out with no image attached. Seed the composer and let the user
  // add what it needs.
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      useChatDraftStore.getState().setDraft(refId, suggestion);
    },
    [refId]
  );

  const noMessagesPlaceholder = useMemo(
    () =>
      loadingThread ? (
        <DocumentLoadStatus state="loading" label="conversation" />
      ) : (
        <WelcomePlaceholder onSuggestionClick={handleSuggestionClick} />
      ),
    [loadingThread, handleSuggestionClick]
  );

  const handleNewChat = useCallback(async () => {
    try {
      const projectId = creationProjectId();
      const threadId = await createNewThread(undefined, undefined, {
        projectId
      });
      openTab({
        type: "chat",
        ref: threadId,
        mode: "view",
        title: "New chat",
        projectId
      });
    } catch (error) {
      console.error("Failed to create new chat thread:", error);
    }
  }, [createNewThread, openTab]);

  return (
    <FlexColumn fullWidth fullHeight sx={{ minHeight: 0, overflow: "hidden" }}>
      <ChatView
        threadId={refId}
        status={(() => {
          const status = runtime.status;
          if (status === "idle") return "connected";
          if (status === "stopping") return "connected";
          return status;
        })()}
        messages={messages}
        sendMessage={handleSendMessage}
        progress={runtime.progress.current}
        total={runtime.progress.total}
        progressMessage={runtime.statusMessage}
        runningToolCallId={runtime.runningToolCallId}
        model={model}
        onModelChange={setModel}
        onStop={handleStop}
        onNewChat={() => void handleNewChat()}
        currentPlanningUpdate={runtime.planningUpdate}
        currentTaskUpdate={runtime.taskUpdate}
        currentLogUpdate={runtime.logUpdate}
        workflowId={workflowId}
        chatSource="workspace_chat"
        noMessagesPlaceholder={noMessagesPlaceholder}
        showNewChatButton
        projectDocumentsSidebar={
          <ProjectDocumentsSidebar projectId={projectId} active={active} />
        }
      />
    </FlexColumn>
  );
};

export default ChatSurface;
