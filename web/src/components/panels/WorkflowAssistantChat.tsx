/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useState } from "react";
import ChatView from "../chat/containers/ChatView";
import { DEFAULT_MODEL } from "../../config/constants";
import { Message, WorkflowAttributes } from "../../stores/ApiTypes";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const containerStyles = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden"
});

/**
 * WorkflowAssistantChat embeds a ChatView that is automatically scoped to the
 * currently active workflow and with help mode enabled by default.
 */
const WorkflowAssistantChat: React.FC = () => {
  // Access the currently active workflow (full object)
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.getWorkflow(state.currentWorkflowId)
      : undefined
  );

  // Chat store
  const {
    connect,
    disconnect,
    status,
    sendMessage,
    progress,
    total,
    messages,
    progressMessage,
    error
  } = useWorkflowChatStore();

  // Local UI state (model & toggles)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("selectedModel");
    return saved || DEFAULT_MODEL;
  });
  const [selectedTools] = useState<string[]>([]); // immutable; no selector UI
  const [selectedCollections] = useState<string[]>([]);
  const helpMode = true; // constant ON, toggle hidden

  // Establish / tear-down websocket connection when workflow changes
  useEffect(() => {
    if (!currentWorkflow) {
      return;
    }

    // Connect with minimal attributes (id only) to establish chat session
    connect({ id: currentWorkflow.id } as unknown as WorkflowAttributes);
    return () => disconnect();
    // We intentionally depend only on workflow ID to avoid infinite reconnects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkflow?.id]);

  // Wrap sendMessage to ensure workflow_id is attached
  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!currentWorkflow) {
        console.error("No active workflow. Cannot send message.");
        return;
      }
      await sendMessage({ ...message, workflow_id: currentWorkflow.id });
    },
    [sendMessage, currentWorkflow]
  );

  return (
    <div css={containerStyles}>
      {error && (
        <div style={{ color: "var(--palette-error-main)", padding: "0.5rem" }}>
          {error}
        </div>
      )}
      <ChatView
        status={status}
        progress={progress}
        total={total}
        messages={messages}
        sendMessage={handleSendMessage}
        progressMessage={progressMessage || ""}
        model={selectedModel}
        selectedTools={selectedTools}
        selectedCollections={selectedCollections}
        onModelChange={setSelectedModel}
        helpMode={helpMode}
      />
    </div>
  );
};

export default WorkflowAssistantChat;
