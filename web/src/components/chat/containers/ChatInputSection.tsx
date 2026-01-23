/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import MobileChatToolbar from "../controls/MobileChatToolbar";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import useMediaQuery from "@mui/material/useMediaQuery";

const styles = (_theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: "1.5em",
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
      minHeight: "44px",
      display: "flex",
      flexDirection: "column"
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
  showToolbar?: boolean;
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
  allowedProviders?: string[];
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
  onAgentModeToggle,
  showToolbar = true,
  allowedProviders
}: ChatInputSectionProps) => {
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <div className="chat-input-section" css={styles(theme)}>
      <div className="chat-composer-wrapper">
        <ChatComposer
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onStop={onStop}
          onNewChat={onNewChat}
          agentMode={agentMode}
        />
      </div>
      {showToolbar && (
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
              allowedProviders={allowedProviders}
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
              allowedProviders={allowedProviders}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ChatInputSection;
