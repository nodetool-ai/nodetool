/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import MobileChatToolbar from "../controls/MobileChatToolbar";
import { LanguageModel, MessageContent } from "../../../stores/ApiTypes";

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: isMobile ? "row" : "column", // Single row on mobile
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: isMobile
      ? `${theme.vars.palette.grey[900]}F0`
      : "transparent",
    padding: isMobile ? "12px 12px 8px 12px" : "1.5em 0.5em", // More top padding for spacing from border
    marginTop: "auto",
    flexShrink: 0,

    ".chat-controls": {
      maxWidth: isMobile ? "auto" : "100%", // Auto width for inline
      width: isMobile ? "auto" : "100%", // Auto width for inline
      flexShrink: 0 // Don't shrink the controls
    },
    ".chat-composer-wrapper": {
      flex: 1,
      minWidth: 0,
      width: isMobile ? "auto" : "100%", // Auto width for flex grow
      order: isMobile ? 2 : 1, // Composer second on mobile
      minHeight: isMobile ? "40px" : "44px", // Single row height
      maxHeight: isMobile ? "40px" : "120px", // Single row constraint
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
    <div className="chat-input-section" css={styles(theme, isMobile)}>
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
            isMobile={isMobile}
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
