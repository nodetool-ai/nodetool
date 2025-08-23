/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import MobileChatToolbar from "../controls/MobileChatToolbar";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import useMediaQuery from "@mui/material/useMediaQuery";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: "1.5em 0.5em",
    marginTop: "auto",
    flexShrink: 0,
    // Mobile styles handled via separate CSS file

    ".chat-controls": {
      maxWidth: "100%",
      width: "100%",
      flexShrink: 0
    },
    ".chat-composer-wrapper": {
      flex: 1,
      minWidth: 0,
      width: "100%",
      order: 1,
      minHeight: "44px",
      maxHeight: "120px",
      display: "flex",
      flexDirection: "column",
      overflow: "visible",
      contain: "none"
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <div className="chat-input-section" css={styles(theme)}>
      <div className="chat-controls">
        {isMobile ? (
          <MobileChatToolbar
            selectedTools={selectedTools}
            onToolsChange={onToolsChange}
            selectedCollections={selectedCollections}
            onCollectionsChange={onCollectionsChange}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            agentMode={agentMode}
            onAgentModeToggle={onAgentModeToggle}
          />
        ) : (
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
        )}
      </div>
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
  );
};

export default ChatInputSection;
