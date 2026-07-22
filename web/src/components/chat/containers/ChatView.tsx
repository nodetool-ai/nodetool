/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useMemo, memo } from "react";
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
import { SPACING, getSpacingPx, Z_INDEX } from "../../ui_primitives";
import ChatThreadView from "../thread/ChatThreadView";
import { ConversationHeader } from "./ConversationHeader";
import ChatInputSection, { type ChatComposerVariant } from "./ChatInputSection";
import ComposerSlot from "../composer/ComposerSlot";
import { TodoSidebar } from "../sidebar/TodoSidebar";
import { ThreadMemorySidebar } from "../sidebar/ThreadMemorySidebar";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  buildUiContext,
  type BuildUiContextOptions
} from "../../../lib/chat/uiContext";
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
      padding: theme.spacing(0, 0, 6, 6)
    },
    ".chat-main": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingRight: 8
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
      maxWidth: "1180px",
      alignSelf: "center"
    },
    ".chat-controls": {
      padding: `0 ${getSpacingPx(SPACING.xl)} 0 0`,
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
      maxWidth: "1180px",
      alignSelf: "center"
    }
  });

type ChatViewProps = {
  status:
  | "disconnected"
  | "connecting"
  | "connected"
  | "loading"
  | "error"
  | "streaming"
  | "reconnecting"
  | "disconnecting"
  | "failed";
  progress: number;
  total: number;
  messages: Array<Message>;
  model?: LanguageModel;
  showToolbar?: boolean;
  graph?: {
    nodes: Node[];
    edges: Edge[];
  };
  sendMessage: (message: Message) => Promise<void>;
  progressMessage: string | null;
  onModelChange?: (model: LanguageModel) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  workflowAssistant?: boolean;
  /** Context-specific system-prompt addendum appended to the base chat prompt. */
  systemPrompt?: string;
  /**
   * Overrides for the `ui_context` sent with each message. Surfaces that aren't
   * workspace tabs (the App Builder) name their focused document here; surfaces
   * with a selection worth telling the agent about pass it too. When omitted the
   * context is derived from the open workspace tabs.
   */
  uiContext?: BuildUiContextOptions;
  currentPlanningUpdate?: PlanningUpdate | null;
  currentTaskUpdate?: TaskUpdate | null;
  currentLogUpdate?: LogUpdate | null;
  runningToolCallId?: string | null;
  runningToolMessage?: string | null;
  /**
   * Optional React node to display when there are no messages yet.
   */
  noMessagesPlaceholder?: React.ReactNode;
  onInsertCode?: (text: string, language?: string) => void;
  allowedProviders?: string[];
  /** Hide non-tool-capable models in the composer's language model picker. */
  requireToolSupport?: boolean;
  workflowId?: string | null;
  /**
   * Controls which composer is rendered below the thread.
   * - "media" (default): full-featured MediaChatComposer with mode, model,
   *   and media-generation parameter chips.
   * - "simple": plain ChatComposer with just the textarea and action
   *   buttons — used by the Agent panel where provider/model live in a
   *   dedicated toolbar.
   */
  composerVariant?: ChatComposerVariant;
  /**
   * Extra node rendered in the composer footer (left of the action
   * buttons). Only used when composerVariant is "simple".
   */
  composerToolbar?: React.ReactNode;
  /** Override the composer's textarea placeholder. */
  composerPlaceholder?: string;
  /** Pure chat panel: hide the media mode picker and force chat mode. */
  hideModePicker?: boolean;
  /**
   * When true, ChatView does not render its own composer. Instead it renders a
   * bottom ComposerSlot wired to its send handler, and the shared
   * PersistentComposer (from ChatComposerLayout) is positioned over it. Used by
   * GlobalChat so the composer persists across /dashboard → /chat.
   */
  useExternalComposer?: boolean;
  /**
   * Show the per-conversation header strip (title + model/provider/runtime/
   * last-run) above the thread. Only meaningful where `GlobalChatStore`'s
   * `currentThreadId` is the authoritative open thread (i.e. GlobalChat) —
   * other surfaces (agent panel, editor modal) drive their own thread state,
   * so the title would not match. Defaults to off.
   */
  showConversationHeader?: boolean;
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

const ChatView = ({
  status,
  progress,
  total,
  messages,
  model,
  sendMessage,
  progressMessage,
  showToolbar = true,
  onModelChange,
  onStop,
  onNewChat,
  memoryEnabled,
  onMemoryToggle,
  systemPrompt,
  uiContext,
  currentPlanningUpdate,
  currentTaskUpdate,
  currentLogUpdate,
  noMessagesPlaceholder,
  graph,
  onInsertCode,
  runningToolCallId,
  runningToolMessage,
  allowedProviders,
  requireToolSupport,
  workflowId,
  composerVariant,
  composerToolbar,
  composerPlaceholder,
  hideModePicker,
  useExternalComposer = false,
  showConversationHeader = false,
  threadId
}: ChatViewProps) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const handleSendMessage = useCallback(
    async (
      content: MessageContent[],
      _prompt: string,
      mediaGeneration?: MediaGenerationRequest
    ) => {
      try {
        const outgoing: ChatOutgoingMessage = {
          type: "message",
          name: "",
          role: "user",
          provider:
            mediaGeneration && mediaGeneration.mode !== "chat"
              ? ((mediaGeneration.provider ??
                  model?.provider) as ChatOutgoingMessage["provider"])
              : model?.provider,
          model:
            mediaGeneration && mediaGeneration.mode !== "chat"
              ? mediaGeneration.model ?? model?.id
              : model?.id,
          content: content,
          system_prompt: systemPrompt,
          ui_context: buildUiContext(uiContext),
          graph: graph,
          workflow_id: workflowId ?? undefined,
          workflow_target: graph ? "workflow" : undefined,
          media_generation:
            mediaGeneration && mediaGeneration.mode !== "chat"
              ? mediaGeneration
              : null
        };
        await sendMessage(outgoing);
      } catch (error) {
        console.error("Error sending message:", error);
      }
    },
    [sendMessage, model, systemPrompt, uiContext, graph, workflowId]
  );

  const todos = useGlobalChatStore((state) => {
    const id = threadId ?? state.currentThreadId;
    return (id && state.todosByThread[id]) || NO_TODOS;
  });
  const showTodoSidebar = todos.length > 0;
  const effectiveThreadId = useGlobalChatStore(
    (state) => threadId ?? state.currentThreadId
  );

  return (
    <div className="chat-view" css={cssStyles}>
      <div className="chat-main">
        <div className="chat-thread-container">
          {showConversationHeader && (
            <ConversationHeader messages={messages} />
          )}
          {messages.length > 0 ? (
            <ChatThreadView
              messages={messages}
              status={status}
              progress={progress}
              total={total}
              progressMessage={progressMessage}
              runningToolCallId={runningToolCallId}
              runningToolMessage={runningToolMessage}
              currentPlanningUpdate={currentPlanningUpdate}
              currentTaskUpdate={currentTaskUpdate}
              currentLogUpdate={currentLogUpdate}
              onInsertCode={onInsertCode}
            />
          ) : (
            noMessagesPlaceholder ?? <div style={{ flex: 1 }} />
          )}
        </div>

        {useExternalComposer ? (
          <ComposerSlot
            className="chat-input-section"
            onSend={handleSendMessage}
          />
        ) : (
          <ChatInputSection
            status={status}
            showToolbar={showToolbar}
            onSendMessage={handleSendMessage}
            onStop={onStop}
            onNewChat={onNewChat}
            selectedModel={model}
            onModelChange={onModelChange}
            memoryEnabled={memoryEnabled}
            onMemoryToggle={onMemoryToggle}
            allowedProviders={allowedProviders}
            requireToolSupport={requireToolSupport}
            variant={composerVariant}
            composerToolbar={composerToolbar}
            placeholder={composerPlaceholder}
            hideModePicker={hideModePicker}
          />
        )}
      </div>
      {showTodoSidebar && <TodoSidebar todos={todos} />}
      {effectiveThreadId && (
        <ThreadMemorySidebar threadId={effectiveThreadId} />
      )}
    </div>
  );
};

export default memo(ChatView);
