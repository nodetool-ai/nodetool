/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useRef, useState, memo } from "react";
import { isEqual } from "lodash";
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
import ChatInputSection from "./ChatInputSection";

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
      overflow: "auto",
      minHeight: 0,
      paddingBottom: "16px",
      // Prevent scroll jumping on mobile keyboard
      WebkitOverflowScrolling: "touch",
      scrollBehavior: "smooth"
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
};

const ChatView = memo(({
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
  workflowId
}: ChatViewProps) => {
  const theme = useTheme();
  const chatThreadContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );
  const handleChatThreadContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      chatThreadContainerRef.current = node;
      setScrollContainer(node);
    },
    []
  );
  const handleSendMessage = useCallback(
    async (
      content: MessageContent[],
      prompt: string,
      messageAgentMode: boolean
    ) => {
      try {
        await sendMessage({
          type: "message",
          name: "",
          role: "user",
          provider: model?.provider,
          model: model?.id,
          content: content,
          tools: selectedTools.length > 0 ? selectedTools : undefined,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined,
          agent_mode: messageAgentMode,
          help_mode: helpMode,
          graph: graph,
          workflow_id: workflowId ?? undefined,
          workflow_target: graph ? "workflow" : undefined
        });
      } catch (error) {
        console.error("Error sending message:", error);
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
      <div
        className="chat-thread-container"
        ref={handleChatThreadContainerRef}
      >
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
            scrollContainer={scrollContainer}
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
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for ChatView to prevent unnecessary re-renders
  return (
    prevProps.status === nextProps.status &&
    prevProps.progress === nextProps.progress &&
    prevProps.total === nextProps.total &&
    prevProps.messages === nextProps.messages &&
    prevProps.model === nextProps.model &&
    prevProps.progressMessage === nextProps.progressMessage &&
    isEqual(prevProps.selectedTools, nextProps.selectedTools) &&
    prevProps.showToolbar === nextProps.showToolbar &&
    isEqual(prevProps.selectedCollections, nextProps.selectedCollections) &&
    prevProps.agentMode === nextProps.agentMode &&
    prevProps.helpMode === nextProps.helpMode &&
    prevProps.currentPlanningUpdate === nextProps.currentPlanningUpdate &&
    prevProps.currentTaskUpdate === nextProps.currentTaskUpdate &&
    prevProps.currentLogUpdate === nextProps.currentLogUpdate &&
    prevProps.graph === nextProps.graph &&
    prevProps.runningToolCallId === nextProps.runningToolCallId &&
    prevProps.runningToolMessage === nextProps.runningToolMessage &&
    prevProps.workflowId === nextProps.workflowId
    // Note: function props (sendMessage, onToolsChange, etc.) are assumed to be stable
  );
});
ChatView.displayName = "ChatView";

export default ChatView;
