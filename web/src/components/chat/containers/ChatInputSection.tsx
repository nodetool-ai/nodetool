/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import MediaChatComposer from "../composer/MediaChatComposer";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";

const styles = (_theme: Theme) =>
  css({
    width: "90%",
    maxWidth: "1000px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: "0",
    margin: "auto auto 0 auto", // Center horizontally, push to bottom
    flexShrink: 0,

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
    agentMode: boolean,
    mediaGeneration?: MediaGenerationRequest
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
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  allowedProviders
}: ChatInputSectionProps) => {
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const theme = useTheme();
  return (
    <div className="chat-input-section" css={styles(theme)}>
      <div className="chat-composer-wrapper">
        <MediaChatComposer
          isLoading={isLoading}
          isStreaming={isStreaming}
          onSendMessage={onSendMessage}
          onStop={onStop}
          onNewChat={onNewChat}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          agentMode={agentMode}
          onAgentModeToggle={onAgentModeToggle}
          allowedProviders={allowedProviders}
        />
      </div>
    </div>
  );
};

export default memo(ChatInputSection);
