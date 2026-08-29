/** @jsxImportSource @emotion/react */
/**
 * The overview's left column: the conversation that builds the project.
 *
 * The thread is the project's own — `projects.thread` names it, creating one
 * on first ask — so the same conversation is here whether it was started from
 * the overview or from the new-project surface. Sends go straight to that
 * thread, which is what makes the column the project's agent rather than a
 * second chat that happens to be next to it.
 *
 * The turns render through `ChatView`, the same surface the full chat uses, so
 * tool calls, plans and media outputs look here the way they look everywhere.
 */

import { css } from "@emotion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  Caption,
  FlexColumn,
  LoadingSpinner,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import ChatView from "../chat/containers/ChatView";
import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message, MessageContent } from "../../stores/ApiTypes";
import { trpc } from "../../trpc/client";
import { projectSystemPrompt, takeProjectFirstTurn } from "./projectAgent";

const NO_MESSAGES: Message[] = [];

// The column is narrow, so the full chat's page padding and 800px thread
// column would leave the conversation almost no room.
const styles = css({
  "&": {
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column"
  },
  "& .chat-view": {
    padding: `0 ${getSpacingPx(SPACING.sm)} ${getSpacingPx(
      SPACING.sm
    )} ${getSpacingPx(SPACING.sm)}`
  },
  "& .chat-thread-container": {
    maxWidth: "100%",
    paddingBottom: getSpacingPx(SPACING.md)
  },
  "& .chat-composer-wrapper, & .chat-input-section": {
    width: "100%",
    maxWidth: "100%"
  }
});

interface ProjectAgentPanelProps {
  projectId: string;
  projectName: string;
  /** The thread the project already names, when it has one. */
  threadId: string | null;
}

const ProjectAgentPanel = ({
  projectId,
  projectName,
  threadId: boundThreadId
}: ProjectAgentPanelProps) => {
  const [threadId, setThreadId] = useState<string | null>(boundThreadId);
  /** True once this thread's persisted history is in the message cache. */
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const ensureThread = trpc.projects.thread.useMutation();
  const ensureThreadAsync = ensureThread.mutateAsync;

  const { connect, fetchThread, loadMessages, sendMessage, stopGeneration } =
    useGlobalChatStore(
      useShallow((state) => ({
        connect: state.connect,
        fetchThread: state.fetchThread,
        loadMessages: state.loadMessages,
        sendMessage: state.sendMessage,
        stopGeneration: state.stopGeneration
      }))
    );
  const messages = useGlobalChatStore((state) =>
    threadId ? (state.messageCache[threadId] ?? NO_MESSAGES) : NO_MESSAGES
  );
  const runtime = useThreadRuntime(threadId);
  const selectedModel = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore(
    (state) => state.setSelectedModel
  );

  // The shared chat socket is a singleton; other mounted surfaces depend on
  // it, so this never disconnects on unmount.
  useEffect(() => {
    connect().catch((error) => {
      console.error("Failed to connect chat:", error);
    });
  }, [connect]);

  useEffect(() => {
    let cancelled = false;
    const bind = async () => {
      // A project that already names its thread needs no write; only the
      // first visit creates one.
      const id =
        boundThreadId ?? (await ensureThreadAsync({ id: projectId })).threadId;
      if (cancelled) return;
      setThreadId(id);
      // The row exists on the server, so a fetch registers it with the store
      // rather than guessing at a local one.
      await fetchThread(id);
      if (cancelled) return;
      await loadMessages(id);
      if (cancelled) return;
      setHistoryLoaded(true);
    };
    bind().catch((error) => {
      console.error("Failed to open the project thread:", error);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, boundThreadId, ensureThreadAsync, fetchThread, loadMessages]);

  const systemPrompt = useMemo(
    () => projectSystemPrompt(projectName, projectId),
    [projectName, projectId]
  );

  // ChatView builds the outgoing message; this only routes it to the
  // project's own thread instead of the store's current one.
  const handleSend = useCallback(
    async (message: Message) => {
      if (!threadId) return;
      await sendMessage(message, threadId);
    },
    [threadId, sendMessage]
  );

  // A project started from the new-project surface arrives with its opening
  // turn staged. It is sent from here rather than there, and only once the
  // history has loaded: a full load replaces the message cache, so a turn sent
  // before it lands would be wiped by it.
  const firstTurnSent = useRef(false);
  useEffect(() => {
    if (!threadId || !historyLoaded || firstTurnSent.current) {
      return;
    }
    const first: MessageContent[] | null = takeProjectFirstTurn(projectId);
    if (!first) {
      return;
    }
    firstTurnSent.current = true;
    handleSend({
      type: "message",
      name: "",
      role: "user",
      provider: selectedModel?.provider,
      model: selectedModel?.id,
      content: first,
      system_prompt: systemPrompt
    }).catch((error) => {
      console.error("Failed to send to the project agent:", error);
    });
  }, [
    threadId,
    historyLoaded,
    projectId,
    handleSend,
    selectedModel,
    systemPrompt
  ]);

  // ChatView's status has no idle/stopping of its own.
  const chatStatus =
    runtime.status === "idle" || runtime.status === "stopping"
      ? "connected"
      : runtime.status;

  const handleStop = useCallback(() => {
    if (threadId) stopGeneration(threadId);
  }, [threadId, stopGeneration]);

  return (
    <div css={styles}>
      <Caption
        color="muted"
        sx={{ px: SPACING.lg, pt: SPACING.lg, textTransform: "uppercase" }}
      >
        Project agent
      </Caption>
      {threadId ? (
        <ChatView
          status={chatStatus}
          messages={messages}
          progress={runtime.progress.current}
          total={runtime.progress.total}
          progressMessage={runtime.statusMessage}
          model={selectedModel}
          onModelChange={setSelectedModel}
          sendMessage={handleSend}
          onStop={handleStop}
          threadId={threadId}
          systemPrompt={systemPrompt}
          chatSource="workspace_chat"
          currentPlanningUpdate={runtime.planningUpdate}
          currentTaskUpdate={runtime.taskUpdate}
          currentLogUpdate={runtime.logUpdate}
          runningToolCallId={runtime.runningToolCallId}
          runningToolMessage={runtime.toolMessage}
          hideModePicker
          composerPlaceholder="Ask for a change to this project…"
          noMessagesPlaceholder={
            <FlexColumn sx={{ flex: 1, px: SPACING.lg, pt: SPACING.lg }}>
              <Caption color="muted">
                Nothing here yet. Ask for a change and the agent builds it into
                this project.
              </Caption>
            </FlexColumn>
          }
        />
      ) : (
        <LoadingSpinner />
      )}
    </div>
  );
};

export default ProjectAgentPanel;
