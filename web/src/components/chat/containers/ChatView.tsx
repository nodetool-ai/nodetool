/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
import { Provider } from "../../../stores/ApiTypes";

const styles = () =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      width: "100%",
      display: "flex",
      flexGrow: 1,
      flexDirection: "column",
      overflow: "hidden"
    },
    ".chat-controls": {
      padding: "0 1em",
      marginTop: "auto",
      zIndex: 1,
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
  graph
}: ChatViewProps) => {
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
    <div className="chat-view" css={styles}>
      {messages.length > 0 ? (
        <ChatThreadView
          messages={messages}
          status={status}
          progress={progress}
          total={total}
          progressMessage={progressMessage}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
        />
      ) : (
        noMessagesPlaceholder ?? <div style={{ flex: 1 }} />
      )}

      <ChatInputSection
        status={status}
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
