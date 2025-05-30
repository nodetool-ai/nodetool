/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import ChatComposer from "./ChatComposer";
import ChatToolBar from "./ChatToolBar";
import { MessageContent } from "../../stores/ApiTypes";

const styles = css({
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

type ChatInputSectionProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  onSendMessage: (
    content: MessageContent[],
    prompt: string
  ) => Promise<void> | void;
  onStop?: () => void;
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  showToolbar?: boolean; // To conditionally render ChatToolBar
};

const ChatInputSection = ({
  status,
  onSendMessage,
  onStop,
  selectedTools,
  onToolsChange,
  selectedModel,
  onModelChange,
  showToolbar = true // Default to true
}: ChatInputSectionProps) => {
  return (
    <div css={styles}>
      <div className="chat-controls">
        {showToolbar && onToolsChange && (
          <ChatToolBar
            selectedTools={selectedTools}
            onToolsChange={onToolsChange}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
          />
        )}
        <div className="chat-composer-wrapper">
          <ChatComposer
            status={status}
            onSendMessage={onSendMessage}
            onStop={onStop}
            disabled={status === "loading" || status === "error"}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInputSection;
