/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import type { ChatSource } from "@nodetool-ai/protocol";
import {
  Node,
  Edge,
  Message,
  MessageContent,
  PlanningUpdate,
  TaskUpdate,
  LogUpdate,
  LanguageModel,
  TodoItem
} from "../../../stores/ApiTypes";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import {
  FlexColumn,
  FlexRow,
  SPACING,
  ToolbarIconButton,
  getSpacingPx,
  Z_INDEX
} from "../../ui_primitives";
import ChatThreadView from "../thread/ChatThreadView";
import ChatInputSection from "./ChatInputSection";
import ChatErrorBanner from "./ChatErrorBanner";
import MobileRailTabs, { type MobileRail } from "./MobileRailTabs";
import { TodoSidebar } from "../sidebar/TodoSidebar";
import { MemorySidebar } from "../sidebar/MemorySidebar";
import { TaskUpdateSidebar } from "../sidebar/TaskUpdateSidebar";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { getThreadRuntime } from "../../../core/chat/threadRuntime";
import { useMemoryPanelStore } from "../../../stores/MemoryPanelStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useCombo } from "../../../stores/KeyPressedStore";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import { canTakeFocus, isTextInputActive } from "../../../utils/browser";
import {
  resolveUiContext,
  type UiContextInput
} from "../../../lib/chat/uiContext";
import { CHAT_COLUMN_MAX_WIDTH, type ChatStatus } from "../types/chat.types";
import { conversationToMarkdown } from "../utils/conversationMarkdown";
import type {
  ChatOutgoingMessage,
  MediaGenerationRequest
} from "../types/media.types";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      maxHeight: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "row",
      overflow: "hidden",
      minHeight: 0,
      padding: theme.spacing(0, 6, 6, 6)
    },
    ".chat-main": {
      position: "relative",
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingRight: 0
    },
    // Floats over the thread rather than reserving a row of its own.
    ".chat-overlay-actions": {
      position: "absolute",
      top: getSpacingPx(SPACING.md),
      right: getSpacingPx(SPACING.lg),
      zIndex: Z_INDEX.dropdown
    },
    "&::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background: `radial-gradient(circle at top center, rgb(${theme.vars.palette.common.whiteChannel} / 0.035), transparent 38%)`
    },
    ".chat-thread-container": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      paddingBottom: theme.spacing(2),
      width: "100%",
      maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
      alignSelf: "center"
    },
    // The rails size themselves for the desktop column; full width is the
    // only thing that changes when one takes the conversation's place.
    ".chat-mobile-rail > aside": {
      width: "100%",
      borderLeft: "none"
    },
    ".chat-controls": {
      padding: "0",
      marginTop: "auto",
      zIndex: Z_INDEX.dropdown,
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md)
    },
    ".chat-composer-wrapper": {
      flex: 1,
      minWidth: 0,
      width: "100%",
      maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
      alignSelf: "center"
    }
  });

type ChatViewProps = {
  status: ChatStatus;
  progress: number;
  total: number;
  messages: Array<Message>;
  model?: LanguageModel;
  graph?: {
    nodes: Node[];
    edges: Edge[];
  };
  sendMessage: (message: Message) => Promise<void>;
  progressMessage: string | null;
  onModelChange?: (model: LanguageModel) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  workflowAssistant?: boolean;
  /** Context-specific system-prompt addendum appended to the base chat prompt. */
  systemPrompt?: string;
  /**
   * Overrides for the `ui_context` sent with each message. Surfaces that aren't
   * workspace tabs (the App Builder) name their focused document here; surfaces
   * with a selection worth telling the agent about pass it too. When omitted the
   * context is derived from the open workspace tabs. Pass a function to read
   * the selection at send time.
   */
  uiContext?: UiContextInput;
  /** Chat surface that sent this turn. Always attached to `ui_context.source`. */
  chatSource?: ChatSource;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  runningToolCallId?: string | null;
  /**
   * Optional React node to display when there are no messages yet.
   */
  noMessagesPlaceholder?: React.ReactNode;
  onInsertCode?: (text: string, language?: string) => void;
  allowedProviders?: string[];
  /** Hide non-tool-capable models in the composer's language model picker. */
  requireToolSupport?: boolean;
  workflowId?: string | null;
  /** Override the composer's textarea placeholder. */
  composerPlaceholder?: string;
  /** Pure chat panel: hide the media mode picker and force chat mode. */
  hideModePicker?: boolean;
  /** Hide the language-model chip (the Studio shell pins the model). */
  hideModelPicker?: boolean;
  /**
   * Show a "New chat" button above the thread. For surfaces with no chrome of
   * their own (the workspace chat tab); panels that already carry a header
   * with its own new-chat button leave it off. Defaults to off.
   */
  showNewChatButton?: boolean;
  /**
   * Bind thread-scoped store reads (todos) to this thread instead of the
   * store's current one. Pass it when the surface renders a specific thread
   * (e.g. a workspace chat tab) that may not be `currentThreadId`.
   */
  threadId?: string | null;
};

// Stable empty-array sentinel so the Zustand selector below returns the same
// reference across renders when the current thread has no todos — returning a
// fresh `[]` triggered React's "Maximum update depth exceeded" loop.
const NO_TODOS: TodoItem[] = [];

/** A thought block is the model's, not the user's; a resend carries the rest. */
const isSendableBlock = (
  block: Extract<Message["content"], unknown[]>[number]
): block is MessageContent => block.type !== "thought";

/** A user turn's content, normalized to the block list a resend needs. */
const messageBlocks = (message: Message): MessageContent[] | null => {
  if (Array.isArray(message.content)) {
    return message.content.filter(isSendableBlock);
  }
  if (typeof message.content === "string") {
    return [{ type: "text", text: message.content }];
  }
  return null;
};

const ChatView = ({
  status,
  progress,
  total,
  messages,
  model,
  sendMessage,
  progressMessage,
  onModelChange,
  onStop,
  onNewChat,
  systemPrompt,
  uiContext,
  chatSource,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  noMessagesPlaceholder,
  graph,
  onInsertCode,
  runningToolCallId,
  allowedProviders,
  requireToolSupport,
  workflowId,
  composerPlaceholder,
  hideModePicker,
  hideModelPicker,
  showNewChatButton = false,
  threadId
}: ChatViewProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const rootRef = useRef<HTMLDivElement>(null);

  const buildOutgoing = useCallback(
    (
      content: MessageContent[],
      mediaGeneration?: MediaGenerationRequest | null
    ): ChatOutgoingMessage => {
      const isMedia = Boolean(
        mediaGeneration && mediaGeneration.mode !== "chat"
      );
      return {
        type: "message",
        name: "",
        role: "user",
        provider: isMedia
          ? ((mediaGeneration?.provider ??
              model?.provider) as ChatOutgoingMessage["provider"])
          : model?.provider,
        model: isMedia ? mediaGeneration?.model ?? model?.id : model?.id,
        content: content,
        system_prompt: systemPrompt,
        ui_context: resolveUiContext(uiContext, chatSource),
        graph: graph,
        workflow_id: workflowId ?? undefined,
        workflow_target: graph ? "workflow" : undefined,
        media_generation: isMedia ? mediaGeneration ?? null : null
      };
    },
    [model, systemPrompt, uiContext, chatSource, graph, workflowId]
  );

  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleSendMessage = useCallback(
    async (
      content: MessageContent[],
      _prompt: string,
      mediaGeneration?: MediaGenerationRequest
    ) => {
      try {
        await sendMessage(buildOutgoing(content, mediaGeneration));
      } catch (error) {
        console.error("Error sending message:", error);
        addNotification({
          type: "error",
          content: `Could not send the message: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },
    [sendMessage, buildOutgoing, addNotification]
  );

  const todos = useGlobalChatStore((state) => {
    const id = threadId ?? state.currentThreadId;
    return (id && state.todosByThread[id]) || NO_TODOS;
  });
  const effectiveThreadId = useGlobalChatStore(
    (state) => threadId ?? state.currentThreadId
  );
  // The thread's own error, plus the top-level one when this surface renders
  // the current thread — a protocol error that arrives without a thread id
  // lands there and nowhere else.
  const chatError = useGlobalChatStore((state) => {
    const id = threadId ?? state.currentThreadId;
    return (
      getThreadRuntime(state, id).error ??
      (id === state.currentThreadId ? state.error : null)
    );
  });
  const clearError = useGlobalChatStore((state) => state.clearError);

  // Right rails use fixed widths. Below `md` they leave the conversation
  // almost no room, so they move behind the segmented picker instead.
  const railsFit = useMediaQuery(theme.breakpoints.up("md"));
  // Copying a conversation is a desktop gesture and the button crowds the
  // phone header. New chat stays: the composer has no new-chat action.
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const hasAgentExecutionMessages = useMemo(
    () => messages.some((message) => message.role === "agent_execution"),
    [messages]
  );
  const isBusy = status === "loading" || status === "streaming";
  const hasTaskRail =
    isBusy && Boolean(currentTaskUpdate) && !hasAgentExecutionMessages;
  const showTaskSidebar = railsFit && hasTaskRail;
  const showTodoSidebar = railsFit && !showTaskSidebar && todos.length > 0;
  const memoryPanelOpen = useMemoryPanelStore((state) => state.isOpen);
  const toggleMemoryPanel = useMemoryPanelStore((state) => state.toggle);
  const closeMemoryPanel = useMemoryPanelStore((state) => state.setOpen);
  const canShowMemorySidebar =
    railsFit && !showTaskSidebar && Boolean(effectiveThreadId);

  const [mobileRail, setMobileRail] = useState<MobileRail>("chat");
  const mobileRails = useMemo<MobileRail[]>(() => {
    const rails: MobileRail[] = ["chat"];
    if (todos.length > 0) {
      rails.push("todos");
    }
    if (hasTaskRail) {
      rails.push("task");
    }
    if (effectiveThreadId) {
      rails.push("memory");
    }
    return rails;
  }, [todos.length, hasTaskRail, effectiveThreadId]);
  const showMobileRails = !railsFit && mobileRails.length > 1;
  // A rail whose content went away leaves the conversation hidden behind an
  // option that is no longer offered.
  useEffect(() => {
    if (!mobileRails.includes(mobileRail)) {
      setMobileRail("chat");
    }
  }, [mobileRails, mobileRail]);
  const activeMobileRail = showMobileRails ? mobileRail : "chat";

  const { writeClipboard } = useClipboard();
  const handleCopyConversation = useCallback(async () => {
    try {
      await writeClipboard(conversationToMarkdown(messages), true);
      addNotification({
        type: "info",
        content: `Copied ${messages.length} messages as Markdown.`
      });
    } catch (error) {
      console.error("Failed to copy the conversation:", error);
      addNotification({
        type: "error",
        content: "Could not copy the conversation."
      });
    }
  }, [messages, writeClipboard, addNotification]);

  const lastUserMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      if (messages[index].role === "user") {
        return messages[index] as ChatOutgoingMessage;
      }
    }
    return null;
  }, [messages]);

  const handleDismissError = useCallback(() => {
    clearError(effectiveThreadId ?? undefined);
  }, [clearError, effectiveThreadId]);

  const handleRetry = useCallback(() => {
    if (!lastUserMessage) {
      return;
    }
    const content = messageBlocks(lastUserMessage);
    if (!content) {
      return;
    }
    void handleSendMessage(
      content,
      "",
      lastUserMessage.media_generation ?? undefined
    );
  }, [lastUserMessage, handleSendMessage]);

  // Every open workspace tab stays mounted and inactive ones are `inert`, so
  // a shortcut must only act for the ChatView the user can actually see.
  const shortcutTarget = useCallback(() => rootRef.current, []);

  const handleNewChatShortcut = useCallback(() => {
    onNewChat?.();
  }, [onNewChat]);
  useCombo(["Control", "Shift", "O"], handleNewChatShortcut, true, Boolean(onNewChat), {
    target: shortcutTarget,
    allowInInputs: true
  });
  useCombo(["Meta", "Shift", "O"], handleNewChatShortcut, true, Boolean(onNewChat), {
    target: shortcutTarget,
    allowInInputs: true
  });

  const handleFocusComposer = useCallback(() => {
    // The shared focus contract for a key listener that moves focus: never
    // steal a keystroke from a field, never focus into a hidden tab.
    if (isTextInputActive()) {
      return;
    }
    const textarea = rootRef.current?.querySelector<HTMLTextAreaElement>(
      "textarea.media-compose-input"
    );
    if (!canTakeFocus(textarea)) {
      return;
    }
    textarea?.focus();
  }, []);
  useCombo(["Control", "Shift", "L"], handleFocusComposer, true, true, {
    target: shortcutTarget
  });
  useCombo(["Meta", "Shift", "L"], handleFocusComposer, true, true, {
    target: shortcutTarget
  });

  return (
    <div className="chat-view" css={cssStyles} ref={rootRef}>
      <div className="chat-main">
        {(canShowMemorySidebar ||
          (!isMobile && messages.length > 0) ||
          (showNewChatButton && onNewChat)) && (
          <FlexRow className="chat-overlay-actions" align="center" gap={2}>
            {!isMobile && messages.length > 0 && (
              <ToolbarIconButton
                onClick={handleCopyConversation}
                tooltip="Copy conversation as Markdown"
                icon={<ContentCopyIcon fontSize="small" />}
              />
            )}
            {canShowMemorySidebar && (
              <ToolbarIconButton
                onClick={toggleMemoryPanel}
                tooltip={memoryPanelOpen ? "Hide memory" : "Show memory"}
                active={memoryPanelOpen}
                icon={<PsychologyOutlinedIcon fontSize="small" />}
              />
            )}
            {showNewChatButton && onNewChat && (
              <ToolbarIconButton
                onClick={onNewChat}
                tooltip="New chat"
                icon={<AddIcon fontSize="small" />}
              />
            )}
          </FlexRow>
        )}
        {showMobileRails && (
          <FlexRow
            justify="center"
            sx={{
              width: "100%",
              maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
              alignSelf: "center",
              pb: SPACING.sm
            }}
          >
            <MobileRailTabs
              value={activeMobileRail}
              available={mobileRails}
              onChange={setMobileRail}
            />
          </FlexRow>
        )}
        {activeMobileRail === "chat" ? (
          <div className="chat-thread-container">
            {messages.length > 0 ? (
              <ChatThreadView
                threadId={effectiveThreadId}
                messages={messages}
                status={status}
                progress={progress}
                total={total}
                progressMessage={progressMessage}
                runningToolCallId={runningToolCallId}
                currentPlanningUpdate={currentPlanningUpdate}
                currentTaskUpdate={currentTaskUpdate}
                currentLogUpdate={currentLogUpdate}
                onInsertCode={onInsertCode}
                showTaskUpdate={false}
              />
            ) : (
              noMessagesPlaceholder ?? <div style={{ flex: 1 }} />
            )}
          </div>
        ) : (
          <FlexColumn
            className="chat-mobile-rail"
            sx={{ flex: 1, minHeight: 0, width: "100%" }}
          >
            {activeMobileRail === "todos" && <TodoSidebar todos={todos} />}
            {activeMobileRail === "task" && currentTaskUpdate && (
              <TaskUpdateSidebar taskUpdate={currentTaskUpdate} />
            )}
            {activeMobileRail === "memory" && effectiveThreadId && (
              <MemorySidebar
                threadId={effectiveThreadId}
                onClose={() => setMobileRail("chat")}
              />
            )}
          </FlexColumn>
        )}

        {chatError && (
          <FlexColumn
            fullWidth
            sx={{
              maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
              alignSelf: "center",
              pb: SPACING.sm
            }}
          >
            <ChatErrorBanner
              error={chatError}
              onDismiss={handleDismissError}
              onRetry={!isBusy && lastUserMessage ? handleRetry : undefined}
            />
          </FlexColumn>
        )}

        <ChatInputSection
          status={status}
          onSendMessage={handleSendMessage}
          onStop={onStop}
          selectedModel={model}
          onModelChange={onModelChange}
          allowedProviders={allowedProviders}
          requireToolSupport={requireToolSupport}
          placeholder={composerPlaceholder}
          hideModePicker={hideModePicker}
          hideModelPicker={hideModelPicker}
          threadId={effectiveThreadId}
        />
      </div>
      {showTaskSidebar && currentTaskUpdate && (
        <TaskUpdateSidebar taskUpdate={currentTaskUpdate} />
      )}
      {showTodoSidebar && <TodoSidebar todos={todos} />}
      {canShowMemorySidebar && memoryPanelOpen && effectiveThreadId && (
        <MemorySidebar
          threadId={effectiveThreadId}
          onClose={() => closeMemoryPanel(false)}
        />
      )}
    </div>
  );
};

export default memo(ChatView);
