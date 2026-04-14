/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";
import useMediaQuery from "@mui/material/useMediaQuery";

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
    // Mobile styles handled via separate CSS file

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

  // On mobile, only expose model selection + agent mode toggle inline in the
  // composer footer (omit tools/collections to keep the row compact).
  const toolbarNode = useMemo(() => showToolbar ? (
    <ChatToolBar
      selectedTools={selectedTools}
      onToolsChange={isMobile ? undefined : onToolsChange}
      selectedCollections={selectedCollections}
      onCollectionsChange={isMobile ? undefined : onCollectionsChange}
      selectedModel={selectedModel}
      onModelChange={onModelChange}
      agentMode={agentMode}
      onAgentModeToggle={onAgentModeToggle}
      allowedProviders={allowedProviders}
      embedded={true}
    />
  ) : null, [isMobile, showToolbar, selectedTools, onToolsChange, selectedCollections, onCollectionsChange, selectedModel, onModelChange, agentMode, onAgentModeToggle, allowedProviders]);

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
          toolbarNode={toolbarNode}
        />
      </div>
    </div>
  );
};

export default memo(ChatInputSection);
