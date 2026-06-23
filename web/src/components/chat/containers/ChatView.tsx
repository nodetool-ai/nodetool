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
import ChatThreadView from "../thread/ChatThreadView";
import { ConversationHeader } from "./ConversationHeader";
import ChatInputSection, { type ChatComposerVariant } from "./ChatInputSection";
import ComposerSlot from "../composer/ComposerSlot";
import { TodoSidebar } from "../sidebar/TodoSidebar";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
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
      paddingBottom: theme.spacing(6),
      width: "100%",
      maxWidth: "1180px",
      alignSelf: "center"
    },
    ".chat-controls": {
      padding: "0 16px 0 0",
      marginTop: "auto",
      zIndex: 10,
      display: "flex",
      alignItems: "center",
      gap: "8px"
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
  helpMode?: boolean;
  workflowAssistant?: boolean;
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
  helpMode = false,
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
  useExternalComposer = false,
  showConversationHeader = false
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
          help_mode: helpMode,
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
    [sendMessage, model, helpMode, graph, workflowId]
  );

  const todos = useGlobalChatStore((state) => {
    const id = state.currentThreadId;
    return (id && state.todosByThread[id]) || NO_TODOS;
  });
  const showTodoSidebar = todos.length > 0;

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
          />
        )}
      </div>
      {showTodoSidebar && <TodoSidebar todos={todos} />}
    </div>
  );
};

export default memo(ChatView);
