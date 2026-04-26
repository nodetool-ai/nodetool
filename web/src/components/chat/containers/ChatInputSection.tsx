/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import MediaChatComposer from "../composer/MediaChatComposer";
import ChatComposer from "../composer/ChatComposer";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";
import type { AgentPlanner } from "../composer/AgentModeSelector";

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
  agentPlanner?: AgentPlanner;
  onAgentPlannerChange?: (planner: AgentPlanner) => void;
  allowedProviders?: string[];
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
  agentMode,
  onAgentModeToggle,
  agentPlanner,
  onAgentPlannerChange,
  allowedProviders,
  variant = "media",
  composerToolbar
}: ChatInputSectionProps) => {
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const theme = useTheme();
  return (
    <div className="chat-input-section" css={styles(theme)}>
      <div className="chat-composer-wrapper">
        {variant === "simple" ? (
          <ChatComposer
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSendMessage={onSendMessage}
            onStop={onStop}
            onNewChat={onNewChat}
            agentMode={agentMode}
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
            agentMode={agentMode}
            onAgentModeToggle={onAgentModeToggle}
            agentPlanner={agentPlanner}
            onAgentPlannerChange={onAgentPlannerChange}
            allowedProviders={allowedProviders}
          />
        )}
      </div>
    </div>
  );
};

export default memo(ChatInputSection);
