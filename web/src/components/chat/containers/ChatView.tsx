/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, memo } from "react";
import {
  Node,
  Edge,
  Message,
  MessageContent,
  PlanningUpdate,
  TaskUpdate,
  LogUpdate,
  LanguageModel
} from "../../../stores/ApiTypes";
import ChatThreadView from "../thread/ChatThreadView";
import ChatInputSection, { type ChatComposerVariant } from "./ChatInputSection";
import type {
  ChatOutgoingMessage,
  MediaGenerationRequest
} from "../types/media.types";
import log from "loglevel";

const styles = (_theme: Theme) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      maxHeight: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minHeight: 0,
      padding: "0 20px 20px 20px",
    },
    ".chat-thread-container": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      paddingBottom: "16px"
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
      minWidth: 0
    },
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
  selectedTools?: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedCollections?: string[];
  onCollectionsChange?: (collections: string[]) => void;
  onModelChange?: (model: LanguageModel) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
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
};

const ChatView = ({
  status,
  progress,
  total,
  messages,
  model,
  sendMessage,
  progressMessage,
  selectedTools = [],
  showToolbar = true,
  onToolsChange,
  selectedCollections = [],
  onCollectionsChange,
  onModelChange,
  onStop,
  onNewChat,
  agentMode,
  onAgentModeToggle,
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
  workflowId,
  composerVariant,
  composerToolbar
}: ChatViewProps) => {
  const theme = useTheme();
  const handleSendMessage = useCallback(
    async (
      content: MessageContent[],
      prompt: string,
      messageAgentMode: boolean,
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
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined,
          agent_mode: messageAgentMode,
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
        log.error("Error sending message:", error);
      }
    },
    [
      sendMessage,
      model,
      selectedTools,
      selectedCollections,
      helpMode,
      graph,
      workflowId
    ]
  );

  return (
    <div className="chat-view" css={styles(theme)}>
      <div className="chat-thread-container">
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

      <ChatInputSection
        status={status}
        showToolbar={showToolbar}
        onSendMessage={handleSendMessage}
        onStop={onStop}
        onNewChat={onNewChat}
        selectedTools={selectedTools}
        onToolsChange={onToolsChange}
        selectedCollections={selectedCollections}
        onCollectionsChange={onCollectionsChange}
        selectedModel={model}
        onModelChange={onModelChange}
        agentMode={agentMode}
        onAgentModeToggle={onAgentModeToggle}
        allowedProviders={allowedProviders}
        variant={composerVariant}
        composerToolbar={composerToolbar}
      />
    </div>
  );
};

export default memo(ChatView);
