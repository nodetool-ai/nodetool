/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography } from "@mui/material";
import ChatComposer from "../composer/ChatComposer";
import ChatToolBar from "../controls/ChatToolBar";
import { MessageContent } from "../../../stores/ApiTypes";

const styles = css({
  width: "calc(100% - 1em)",
  minHeight: "60px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "var(--palette-background-default)",
  padding: "1.5em 0.5em",

  ".chat-controls": {
    maxWidth: "1100px",
    position: "absolute",
    bottom: "1em",
    width: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginTop: "auto",
    zIndex: 1,
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
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedCollections?: string[];
  onCollectionsChange?: (collections: string[]) => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  helpMode?: boolean;
  onHelpModeToggle?: (enabled: boolean) => void;
};

const ChatInputSection = ({
  status,
  onSendMessage,
  onStop,
  selectedTools,
  onToolsChange,
  selectedCollections,
  onCollectionsChange,
  selectedModel,
  onModelChange,
  agentMode,
  onAgentModeToggle,
  helpMode,
  onHelpModeToggle
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
          helpMode={helpMode}
          onHelpModeToggle={onHelpModeToggle}
        />
        <div className="chat-composer-wrapper">
          <ChatComposer
            status={status}
            onSendMessage={onSendMessage}
            onStop={onStop}
            disabled={
              status === "loading" || status === "error" || isDisconnected
            }
            agentMode={agentMode}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInputSection;
