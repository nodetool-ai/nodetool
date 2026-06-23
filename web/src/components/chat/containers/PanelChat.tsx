/** @jsxImportSource @emotion/react */
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import ChatView from "./ChatView";
import ChatErrorBanner from "./ChatErrorBanner";
import useGlobalChatStore, {
  useThreadsQuery
} from "../../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Text,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { ChatSidebar } from "../sidebar/ChatSidebar";
import type { ThreadInfo } from "../types/thread.types";
import type { Message, MessageTextContent } from "../../../stores/ApiTypes";

/**
 * PanelChat — the unified chat for the editor's left side panel.
 *
 * Renders the same smooth `ChatView` as the global chat, but binds the
 * conversation to the currently open workflow: each workflow gets its own
 * thread, so switching workflows switches the conversation. The composer's
 * mode selector exposes chat, media generation, and the Pi agent; the `ui_*`
 * workflow tools target the open workflow in every mode.
 */
const PanelChat: React.FC = () => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const {
    status,
    progress,
    statusMessage,
    error,
    currentLogUpdate,
    currentThreadId,
    threads,
    messageCache,
    selectedModel,
    setSelectedModel,
    memoryEnabled,
    setMemoryEnabled,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread,
    workflowId,
    runningToolCallId,
    runningToolMessage,
    sendMessage,
    stopGeneration,
    connect,
    openWorkflowThread,
    createNewThread,
    switchThread,
    deleteThread,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((s) => ({
      status: s.status,
      progress: s.progress,
      statusMessage: s.statusMessage,
      error: s.error,
      currentLogUpdate: s.currentLogUpdate,
      currentThreadId: s.currentThreadId,
      threads: s.threads,
      messageCache: s.messageCache,
      selectedModel: s.selectedModel,
      setSelectedModel: s.setSelectedModel,
      memoryEnabled: s.memoryEnabled,
      setMemoryEnabled: s.setMemoryEnabled,
      currentPlanningUpdate: s.currentPlanningUpdate,
      currentTaskUpdate: s.currentTaskUpdate,
      currentTaskUpdateThreadId: s.currentTaskUpdateThreadId,
      lastTaskUpdatesByThread: s.lastTaskUpdatesByThread,
      workflowId: s.workflowId,
      runningToolCallId: s.currentRunningToolCallId,
      runningToolMessage: s.currentToolMessage,
      sendMessage: s.sendMessage,
      stopGeneration: s.stopGeneration,
      connect: s.connect,
      openWorkflowThread: s.openWorkflowThread,
      createNewThread: s.createNewThread,
      switchThread: s.switchThread,
      deleteThread: s.deleteThread,
      getCurrentMessagesSync: s.getCurrentMessagesSync
    }))
  );

  // Load the thread list so the conversation sidebar is populated.
  useThreadsQuery();

  // Ensure the shared chat socket is up. Intentionally no disconnect on
  // unmount — the socket is a singleton shared across surfaces, and tearing it
  // down when the panel collapses would drop in-flight generations.
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect chat:", err);
    });
  }, [connect]);

  // Bind the conversation to the open workflow.
  useEffect(() => {
    if (!currentWorkflowId) {
      return;
    }
    openWorkflowThread(currentWorkflowId).catch((err) => {
      console.error("Failed to open workflow thread:", err);
    });
  }, [currentWorkflowId, openWorkflowThread]);

  const messages = getCurrentMessagesSync();

  const taskUpdateForDisplay = useMemo(() => {
    if (!currentThreadId) {
      return null;
    }
    if (currentTaskUpdate && currentTaskUpdateThreadId === currentThreadId) {
      return currentTaskUpdate;
    }
    return lastTaskUpdatesByThread[currentThreadId] ?? null;
  }, [
    currentThreadId,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread
  ]);

  // The conversation sidebar starts collapsed — the editor panel is narrow,
  // so it overlays the chat only when explicitly opened.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNewChat = useCallback(async () => {
    try {
      const id = await createNewThread();
      switchThread(id);
    } catch (err) {
      console.error("Failed to create new thread:", err);
    }
  }, [createNewThread, switchThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
    },
    [switchThread]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((err) => {
        console.error("Failed to delete thread:", err);
      });
    },
    [deleteThread]
  );

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

  const threadsWithMessages = useMemo<Record<string, ThreadInfo>>(
    () =>
      Object.fromEntries(
        Object.entries(threads).map(([id, thread]) => [
          id,
          {
            id: thread.id,
            title: thread.title ?? undefined,
            updatedAt: thread.updated_at,
            messages: messageCache[id] || []
          }
        ])
      ),
    [threads, messageCache]
  );

  const chatStatus = status === "stopping" ? "loading" : status;

  const placeholder = useMemo(
    () => (
      <FlexColumn
        align="center"
        justify="center"
        gap={1}
        sx={{ height: "100%", px: 3, textAlign: "center" }}
      >
        <Text size="normal" weight={500} family="secondary">
          Workflow chat
        </Text>
        <Caption size="small">
          Ask me to build or edit this workflow, generate media, or switch to
          the Pi agent. I can control nodes, connections, and runs directly.
        </Caption>
      </FlexColumn>
    ),
    []
  );

  return (
    <FlexColumn
      className="panel-chat"
      fullWidth
      fullHeight
      sx={{
        overflow: "hidden",
        minHeight: 0,
        pb: getSpacingPx(SPACING.xxl), // was 20px
        "& .chat-view": { paddingLeft: 0 },
        "& .chat-main": { paddingRight: 0 },
        "& .media-attach-btn": { display: "none" }
      }}
    >
      {error && (
        <ChatErrorBanner error={error} sx={{ m: 1, flexShrink: 0 }} />
      )}
      <FlexRow
        fullWidth
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflow: "hidden"
        }}
      >
        <ChatSidebar
          threads={threadsWithMessages}
          currentThreadId={currentThreadId}
          onNewChat={handleNewChat}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
          getThreadPreview={getThreadPreview}
          isOpen={sidebarOpen}
          onOpenChange={setSidebarOpen}
        />
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}
        >
          <ChatView
            status={chatStatus}
            messages={messages}
            sendMessage={sendMessage}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            runningToolCallId={runningToolCallId}
            runningToolMessage={runningToolMessage}
            model={selectedModel}
            onModelChange={setSelectedModel}
            onStop={stopGeneration}
            onNewChat={handleNewChat}
            memoryEnabled={memoryEnabled}
            onMemoryToggle={setMemoryEnabled}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={taskUpdateForDisplay}
            currentLogUpdate={currentLogUpdate}
            workflowId={workflowId}
            requireToolSupport
            composerPlaceholder="Ask anything…"
            noMessagesPlaceholder={error ? undefined : placeholder}
          />
        </FlexColumn>
      </FlexRow>
    </FlexColumn>
  );
};

export default memo(PanelChat);
