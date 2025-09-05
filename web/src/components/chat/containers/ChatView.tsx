/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback } from "react";
import {
  Node,
  Edge,
  Message,
  MessageContent,
  PlanningUpdate,
  TaskUpdate,
  LanguageModel
} from "../../../stores/ApiTypes";
import ChatThreadView from "../thread/ChatThreadView";
import ChatInputSection from "./ChatInputSection";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      maxHeight: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      minHeight: 0
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
  /**
   * Optional React node to display when there are no messages yet.
   */
  noMessagesPlaceholder?: React.ReactNode;
  onInsertCode?: (text: string, language?: string) => void;
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
  workflowAssistant = false,
  onAgentModeToggle,
  helpMode = false,
  currentPlanningUpdate,
  currentTaskUpdate,
  noMessagesPlaceholder,
  graph,
  onInsertCode
}: ChatViewProps) => {
  const theme = useTheme();
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
          workflow_assistant: workflowAssistant,
          graph: graph
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
      workflowAssistant,
      graph
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
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
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
      />
    </div>
  );
};

export default ChatView;
