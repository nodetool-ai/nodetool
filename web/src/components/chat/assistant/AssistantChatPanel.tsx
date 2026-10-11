/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useEffect, useMemo } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { ChatSource, UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import { FlexColumn, Text, SPACING, getSpacingPx } from "../../ui_primitives";
import ChatView from "../containers/ChatView";
import ChatPanelHeader from "../containers/ChatPanelHeader";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useChatViewThread } from "../../../hooks/chat/useChatViewThread";
import useThreadModel from "../../../hooks/chat/useThreadModel";
import { useInStudio } from "../../../studio/StudioContext";
import type { DocsTopic } from "../../../config/docsLinks";
import type { BuildUiContextOptions } from "../../../lib/chat/uiContext";

const styles = (_theme: Theme) =>
  css({
    "&": {
      height: "100%",
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    "& .chat-view": {
      padding: `0 ${getSpacingPx(SPACING.xs)} ${getSpacingPx(
        SPACING.xs
      )} ${getSpacingPx(SPACING.xs)}`
    },
    "& .chat-input-section": {
      width: "100%",
      maxWidth: "100%"
    },
    "& .chat-thread-container": {
      maxWidth: "100%",
      paddingBottom: getSpacingPx(SPACING.md)
    }
  });

interface AssistantChatPanelProps {
  chatSource: ChatSource;
  focused?: UiDocumentRef | null;
  getSelection?: () => UiContext["selection"];
  workflowId?: string | null;
  systemPrompt?: string;
  welcomeTitle: string;
  welcomeBody: string;
  WelcomeIcon?: typeof AutoAwesomeIcon;
  docsTopic?: DocsTopic;
  docsLabel?: string;
  composerPlaceholder?: string;
  requireToolSupport?: boolean;
  onThreadId?: (threadId: string | null) => void;
  focusMessage?: { threadId: string; messageId: string; requestId: number } | null;
}

/**
 * Shared chat chrome for every editor assistant. Each location only supplies
 * its welcome copy, focused document, and a send-time selection snapshot.
 */
const AssistantChatPanel = ({
  chatSource,
  focused,
  getSelection,
  workflowId,
  systemPrompt,
  welcomeTitle,
  welcomeBody,
  WelcomeIcon = AutoAwesomeIcon,
  docsTopic,
  docsLabel,
  composerPlaceholder,
  requireToolSupport = true,
  onThreadId,
  focusMessage
}: AssistantChatPanelProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const hideModelPicker = useInStudio();

  const connect = useGlobalChatStore((state) => state.connect);
  const loadMessages = useGlobalChatStore((state) => state.loadMessages);
  const {
    threadId,
    messages,
    runtime,
    selectThread,
    createThread,
    sendMessage,
    stopGeneration
  } = useChatViewThread({ isolated: true });

  // This panel's conversation keeps its own model, independent of the chat
  // tabs and the other assistant panels.
  const { model, setModel } = useThreadModel(threadId);

  useEffect(() => { onThreadId?.(threadId); }, [onThreadId, threadId]);

  useEffect(() => {
    if (!focusMessage?.threadId) return;
    const targetThread = focusMessage.threadId;
    const targetMessage = focusMessage.messageId;
    let cancelled = false;
    selectThread(targetThread);
    const loadUntilFound = async () => {
      const seenCursors = new Set<string>();
      let state = useGlobalChatStore.getState();
      if (!state.messageCache[targetThread]?.some((message) => message.id === targetMessage)) {
        await loadMessages(targetThread);
        state = useGlobalChatStore.getState();
      }
      while (!cancelled && !state.messageCache[targetThread]?.some((message) => message.id === targetMessage)) {
        const cursor = state.messageCursors[targetThread];
        if (!cursor || seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
        await loadMessages(targetThread, cursor);
        state = useGlobalChatStore.getState();
      }
    };
    void loadUntilFound().catch((error) => console.error("Failed to load chat message:", error));
    return () => { cancelled = true; };
  }, [focusMessage?.threadId, focusMessage?.messageId, focusMessage?.requestId, loadMessages, selectThread]);

  useEffect(() => {
    connect().catch((err) => {
      console.error(`Failed to connect ${chatSource} chat:`, err);
    });
  }, [connect, chatSource]);

  const chatStatus =
    runtime.status === "idle" || runtime.status === "stopping"
      ? "connected"
      : runtime.status;

  const handleNewChat = useCallback(async () => {
    try {
      await createThread();
    } catch (err) {
      console.error(`Failed to start new ${chatSource} chat:`, err);
    }
  }, [createThread, chatSource]);

  const uiContext = useCallback((): BuildUiContextOptions => {
    return {
      focused: focused ?? undefined,
      selection: getSelection?.() ?? undefined
    };
  }, [focused, getSelection]);

  const welcomePlaceholder = useMemo(
    () => (
      <FlexColumn
        align="center"
        justify="center"
        fullHeight
        padding={3}
        sx={{ textAlign: "center" }}
      >
        <WelcomeIcon fontSize="large" sx={{ mb: 1.5, opacity: 0.5 }} />
        <Text size="big" sx={{ mb: 1 }}>
          {welcomeTitle}
        </Text>
        <Text size="small" color="secondary" sx={{ maxWidth: 280 }}>
          {welcomeBody}
        </Text>
      </FlexColumn>
    ),
    [WelcomeIcon, welcomeTitle, welcomeBody]
  );

  return (
    <div css={cssStyles}>
      <ChatPanelHeader
        onNewChat={handleNewChat}
        onSelectThread={selectThread}
        threadId={threadId}
        docsTopic={docsTopic}
        docsLabel={docsLabel}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={chatStatus}
          messages={messages}
          workflowId={workflowId}
          sendMessage={sendMessage}
          progress={runtime.progress.current}
          total={runtime.progress.total}
          progressMessage={runtime.statusMessage}
          model={model}
          onModelChange={setModel}
          hideModelPicker={hideModelPicker}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          requireToolSupport={requireToolSupport}
          hideModePicker
          noMessagesPlaceholder={welcomePlaceholder}
          threadId={threadId}
          focusMessage={threadId === focusMessage?.threadId ? focusMessage : null}
          currentPlanningUpdate={runtime.planningUpdate}
          currentTaskUpdate={runtime.taskUpdate}
          currentLogUpdate={runtime.logUpdate}
          runningToolCallId={runtime.runningToolCallId}
          systemPrompt={systemPrompt}
          composerPlaceholder={composerPlaceholder}
          chatSource={chatSource}
          uiContext={uiContext}
        />
      </div>
    </div>
  );
};

export default memo(AssistantChatPanel);
