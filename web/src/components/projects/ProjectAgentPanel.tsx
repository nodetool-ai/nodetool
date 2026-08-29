/**
 * The overview's left column: the conversation that builds the project.
 *
 * The thread is the project's own — `projects.thread` names it, creating one
 * on first ask — so the same conversation is here whether it was started from
 * the overview or from the new-project surface. Sends go straight to that
 * thread, which is what makes the column the project's agent rather than a
 * second chat that happens to be next to it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  Caption,
  FlexColumn,
  LoadingSpinner,
  SPACING,
  ScrollArea
} from "../ui_primitives";
import MediaChatComposer from "../chat/composer/MediaChatComposer";
import useGlobalChatStore, {
  useThreadRuntime
} from "../../stores/GlobalChatStore";
import type { Message, MessageContent } from "../../stores/ApiTypes";
import { resolveUiContext } from "../../lib/chat/uiContext";
import { trpc } from "../../trpc/client";
import ProjectAgentThread from "./ProjectAgentThread";
import { projectSystemPrompt, takeProjectFirstTurn } from "./projectAgent";

const NO_MESSAGES: Message[] = [];

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
  const setSelectedModel = useGlobalChatStore((state) => state.setSelectedModel);

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
        boundThreadId ??
        (await ensureThreadAsync({ id: projectId })).threadId;
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

  const handleSend = useCallback(
    (content: MessageContent[]) => {
      if (!threadId) return;
      sendMessage(
        {
          type: "message",
          name: "",
          role: "user",
          provider: selectedModel?.provider,
          model: selectedModel?.id,
          content,
          system_prompt: systemPrompt,
          ui_context: resolveUiContext(undefined, "workspace_chat")
        },
        threadId
      ).catch((error) => {
        console.error("Failed to send to the project agent:", error);
      });
    },
    [threadId, sendMessage, selectedModel, systemPrompt]
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
    const first = takeProjectFirstTurn(projectId);
    if (!first) {
      return;
    }
    firstTurnSent.current = true;
    handleSend(first);
  }, [threadId, historyLoaded, projectId, handleSend]);

  const handleStop = useCallback(() => {
    if (threadId) stopGeneration(threadId);
  }, [threadId, stopGeneration]);

  const isStreaming = runtime.status === "streaming";
  const isLoading = runtime.status === "loading";

  return (
    <FlexColumn fullHeight sx={{ minHeight: 0 }}>
      <Caption
        color="muted"
        sx={{ px: SPACING.xl, pt: SPACING.lg, textTransform: "uppercase" }}
      >
        Project agent
      </Caption>
      <ScrollArea sx={{ flex: 1, minHeight: 0, px: SPACING.xl }}>
        {threadId ? (
          <ProjectAgentThread
            messages={messages}
            runningToolMessage={runtime.toolMessage}
          />
        ) : (
          <LoadingSpinner />
        )}
      </ScrollArea>
      <FlexColumn sx={{ p: SPACING.lg }}>
        <MediaChatComposer
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSendMessage={handleSend}
          onStop={handleStop}
          disabled={!threadId}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          threadId={threadId}
          hideModePicker
          placeholder="Ask for a change to this project…"
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default ProjectAgentPanel;
