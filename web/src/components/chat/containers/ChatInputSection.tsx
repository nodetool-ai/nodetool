/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";

const styles = css({
  width: "100%",
  minHeight: "120px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "transparent",
  padding: "1.5em 0.5em",
  marginTop: "auto",
  flexShrink: 0,

  ".chat-controls": {
    maxWidth: "1100px",
    width: "100%",
    display: "flex",
    alignItems: "flex-end",
    gap: "8px"
  },
  ".chat-composer-wrapper": {
    flex: 1,
    minWidth: 0
  }
});

type ChatInputSectionProps = {
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
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean
  ) => Promise<void> | void;
  onStop?: () => void;
  onNewChat?: () => void;
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedCollections?: string[];
  onCollectionsChange?: (collections: string[]) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
};

const ChatInputSection = ({
  status,
  onSendMessage,
  onStop,
  onNewChat,
  selectedTools,
  onToolsChange,
  selectedCollections,
  onCollectionsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle
}: ChatInputSectionProps) => {
  const isDisconnected = status === "disconnected" || status === "connecting";

  return (
    <div className="chat-input-section" css={styles}>
      <div className="chat-controls">
        <ChatToolBar
          selectedTools={selectedTools}
          onToolsChange={onToolsChange}
          selectedCollections={selectedCollections}
          onCollectionsChange={onCollectionsChange}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          agentMode={agentMode}
          onAgentModeToggle={onAgentModeToggle}
        />
        <div className="chat-composer-wrapper">
          <ChatComposer
            status={status}
            onSendMessage={onSendMessage}
            onStop={onStop}
            onNewChat={onNewChat}
            disabled={
              status === "loading" ||
              status === "streaming" ||
              status === "error" ||
              isDisconnected
            }
            agentMode={agentMode}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInputSection;
