/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import MediaChatComposer from "../composer/MediaChatComposer";
import ChatComposer from "../composer/ChatComposer";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";

export type ChatComposerVariant = "media" | "simple";

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
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  allowedProviders?: string[];
  requireToolSupport?: boolean;
  variant?: ChatComposerVariant;
  /**
   * Extra node rendered in the composer footer (left of the action
   * buttons). Only used by the "simple" variant.
   */
  composerToolbar?: React.ReactNode;
};

const ChatInputSection = ({
  status,
  onSendMessage,
  onStop,
  onNewChat,
  selectedModel,
  onModelChange,
  memoryEnabled,
  onMemoryToggle,
  allowedProviders,
  requireToolSupport,
  selectedTools,
  onToolsChange,
  variant = "media",
  composerToolbar
}: ChatInputSectionProps) => {
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const theme = useTheme();
  return (
    <div
      className="chat-input-section"
      css={styles(theme)}
      data-onboarding-target="chat-composer"
    >
      <div className="chat-composer-wrapper">
        {variant === "simple" ? (
          <ChatComposer
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSendMessage={onSendMessage}
            onStop={onStop}
            onNewChat={onNewChat}
            toolbarNode={composerToolbar}
          />
        ) : (
          <MediaChatComposer
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSendMessage={onSendMessage}
            onStop={onStop}
            onNewChat={onNewChat}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            memoryEnabled={memoryEnabled}
            onMemoryToggle={onMemoryToggle}
            allowedProviders={allowedProviders}
            requireToolSupport={requireToolSupport}
            selectedTools={selectedTools}
            onToolsChange={onToolsChange}
          />
        )}
      </div>
    </div>
  );
};

export default memo(ChatInputSection);
