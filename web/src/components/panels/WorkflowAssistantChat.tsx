/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useState } from "react";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import { Message } from "../../stores/ApiTypes";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { NewChatButton } from "../chat/thread/NewChatButton";

const containerStyles = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  marginRight: "1em",
  ".chat-input-section": {
    backgroundColor: "transparent"
  },
  ".chat-controls": {
    flexDirection: "column",
    gap: "0",
    alignItems: "flex-start"
  },
  ".chat-composer-wrapper": {
    width: "100%",
    ".compose-message": {
      margin: "0 .5em 0 0"
    }
  }
});

/**
 * WorkflowAssistantChat embeds a ChatView that is automatically scoped to the
 * currently active workflow and with help mode enabled by default.
 */
const WorkflowAssistantChat: React.FC = () => {
  const {
    connect,
    disconnect,
    status,
    sendMessage,
    progress,
    statusMessage,
    error,
    stopGeneration,
    getCurrentMessages,
    createNewThread,
    currentThreadId
  } = useGlobalChatStore();

  const messages = getCurrentMessages();

  const total = progress.total;

  // Local UI state (model & toggles)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("selectedModel");
    return saved || DEFAULT_MODEL;
  });
  const [selectedTools] = useState<string[]>([]); // immutable; no selector UI
  const [selectedCollections] = useState<string[]>([]);
  const helpMode = true; // constant ON, toggle hidden

  // Connect once on mount and clean up on unmount
  useEffect(() => {
    connect().catch((err) => console.error("Failed to connect:", err));
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure a thread exists after connection
  useEffect(() => {
    if (!currentThreadId && status === "connected") {
      createNewThread();
    }
  }, [currentThreadId, status, createNewThread]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  return (
    <div css={containerStyles}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "4px 8px"
        }}
      >
        <NewChatButton onNewThread={createNewThread} />
      </div>
      {error && (
        <div style={{ color: "var(--palette-error-main)", padding: "0.5rem" }}>
          {error}
        </div>
      )}
      <ChatView
        status={status}
        progress={progress.current}
        total={total}
        messages={messages}
        sendMessage={handleSendMessage}
        progressMessage={statusMessage}
        model={selectedModel}
        selectedTools={selectedTools}
        selectedCollections={selectedCollections}
        onModelChange={setSelectedModel}
        helpMode={helpMode}
        onStop={stopGeneration}
      />
    </div>
  );
};

export default WorkflowAssistantChat;
