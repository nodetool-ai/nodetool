/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import { useCallback, useMemo, memo } from "react";
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
  FlexRow,
  SPACING,
  ToolbarIconButton,
  getSpacingPx,
  Z_INDEX
} from "../../ui_primitives";
import ChatThreadView from "../thread/ChatThreadView";
import ChatInputSection, { type ChatComposerVariant } from "./ChatInputSection";
import { TodoSidebar } from "../sidebar/TodoSidebar";
import { ThreadMemorySidebar } from "../sidebar/ThreadMemorySidebar";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useThreadMemoryPanelStore } from "../../../stores/ThreadMemoryPanelStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useClipboard } from "../../../hooks/browser/useClipboard";
import {
  resolveUiContext,
  type UiContextInput
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
      position: "relative",
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingRight: 8
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
  chatSource,
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
  hideModelPicker,
  showNewChatButton = false,
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
          ui_context: resolveUiContext(uiContext, chatSource),
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
    [sendMessage, model, systemPrompt, uiContext, chatSource, graph, workflowId]
  );

  const todos = useGlobalChatStore((state) => {
    const id = threadId ?? state.currentThreadId;
    return (id && state.todosByThread[id]) || NO_TODOS;
  });
  const effectiveThreadId = useGlobalChatStore(
    (state) => threadId ?? state.currentThreadId
  );
  // The two rails are 280px and 300px of fixed width. Below `md` they leave
  // the conversation itself almost no room, so they drop out entirely on
  // phones and narrow panels.
  const railsFit = useMediaQuery(theme.breakpoints.up("md"));
  const showTodoSidebar = railsFit && todos.length > 0;
  const memoryPanelOpen = useThreadMemoryPanelStore((state) => state.isOpen);
  const toggleMemoryPanel = useThreadMemoryPanelStore((state) => state.toggle);
  const closeMemoryPanel = useThreadMemoryPanelStore((state) => state.setOpen);
  const canShowMemorySidebar = railsFit && Boolean(effectiveThreadId);

  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const handleCopyConversation = useCallback(async () => {
    try {
      await writeClipboard(JSON.stringify(messages, null, 2), true);
      addNotification({
        type: "info",
        content: `Copied ${messages.length} messages as JSON.`
      });
    } catch (error) {
      console.error("Failed to copy the conversation:", error);
      addNotification({
        type: "error",
        content: "Could not copy the conversation."
      });
    }
  }, [messages, writeClipboard, addNotification]);

  return (
    <div className="chat-view" css={cssStyles}>
      <div className="chat-main">
        {(canShowMemorySidebar ||
          messages.length > 0 ||
          (showNewChatButton && onNewChat)) && (
          <FlexRow className="chat-overlay-actions" align="center" gap={2}>
            {messages.length > 0 && (
              <ToolbarIconButton
                onClick={handleCopyConversation}
                tooltip="Copy conversation as JSON"
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
          hideModelPicker={hideModelPicker}
          threadId={effectiveThreadId}
        />
      </div>
      {showTodoSidebar && <TodoSidebar todos={todos} />}
      {canShowMemorySidebar && memoryPanelOpen && effectiveThreadId && (
        <ThreadMemorySidebar
          threadId={effectiveThreadId}
          onClose={() => closeMemoryPanel(false)}
        />
      )}
    </div>
  );
};

export default memo(ChatView);
