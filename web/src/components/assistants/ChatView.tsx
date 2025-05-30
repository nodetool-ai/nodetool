/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import { Message, MessageContent } from "../../stores/ApiTypes";
import ChatThreadView from "./ChatThreadView";
import ChatComposer from "./ChatComposer";
import ChatToolBar from "./ChatToolBar";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      width: "100%",
      display: "flex",
      flexGrow: 1,
      flexDirection: "column",
      padding: "1em"
    },
    ".chat-controls": {
      position: "relative",
      bottom: 0,
      padding: "0 1em",
      marginTop: "auto",
      zIndex: 1
    }
  });

type ChatViewProps = {
  status: "disconnected" | "connecting" | "connected" | "loading" | "error";
  progress: number;
  total: number;
  messages: Array<Message>;
  model?: string;
  sendMessage: (message: Message) => Promise<void>;
  progressMessage: string | null;
  selectedTools?: string[];
  onToolsChange?: (tools: string[]) => void;
  onModelChange?: (modelId: string) => void;
};

const ChatView = ({
  status,
  progress,
  total,
  messages,
  model,
  sendMessage,
  progressMessage,
  selectedTools = [],
  onToolsChange,
  onModelChange
}: ChatViewProps) => {
  const handleSendMessage = useCallback(
    async (content: MessageContent[], prompt: string) => {
      try {
        await sendMessage({
          type: "message",
          name: "",
          role: "user",
          model: model ? `help:${model}` : undefined,
          content: content,
          tools: selectedTools.length > 0 ? selectedTools : undefined
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
    },
    [sendMessage, model, selectedTools]
  );

  return (
    <div className="chat-view" css={styles}>
      <ChatThreadView
        messages={messages}
        status={status}
        progress={progress}
        total={total}
        progressMessage={progressMessage}
      />

      <div className="chat-controls">
        {onToolsChange && (
          <ChatToolBar
            selectedTools={selectedTools}
            onToolsChange={onToolsChange}
            selectedModel={model}
            onModelChange={onModelChange}
          />
        )}
        <ChatComposer
          status={status}
          onSendMessage={handleSendMessage}
          disabled={status === "loading" || status === "error"}
        />
      </div>
    </div>
  );
};

export default ChatView;

// Re-export Progress component for backward compatibility
export { Progress } from "./ChatThreadView";