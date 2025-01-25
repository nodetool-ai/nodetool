import React, { useCallback, useEffect, useMemo, useState } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { useNodeStore } from "../../stores/NodeStore";
import { Alert, Box, Fade } from "@mui/material";
import { ChatHeader } from "./chat/ChatHeader";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

interface WorkflowChatProps {
  workflow_id: string;
  onClose?: () => void;
  isOpen?: boolean;
}

const WorkflowChat: React.FC<WorkflowChatProps> = ({
  workflow_id,
  onClose,
  isOpen = true
}) => {
  const [isMinimized, setIsMinimized] = React.useState(true);
  const { nodes } = useNodeStore();

  const {
    messages,
    status,
    connect,
    sendMessage,
    resetMessages,
    currentNodeName,
    progress,
    total,
    error
  } = useWorkflowChatStore();

  useEffect(() => {
    connect(workflow_id);
  }, [connect, workflow_id]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (workflow_id) {
        message.workflow_id = workflow_id;
        await sendMessage(message);
      } else {
        console.error("Workflow ID is not set");
      }
    },
    [workflow_id, sendMessage]
  );

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow_id);
  }, [resetMessages, connect, workflow_id]);

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const hasChatInput = useMemo(
    () => nodes.some((node) => node.type === "nodetool.input.ChatInput"),
    [nodes]
  );

  if (!hasChatInput) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1000
      }}
    >
      <Box
        className="workflow-chat-container"
        sx={{
          position: "relative",
          width: isMinimized ? "120px" : "400px",
          maxHeight: "600px",
          height: isMinimized ? "56px" : "500px",
          transform: "translate(0, 0)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: isOpen
            ? "rgba(8, 8, 8, 0.9)"
            : "rgba(16, 16, 16, 0.5)",
          boxShadow: isOpen
            ? "0 0 32px rgba(0, 0, 0, 0.3)"
            : "0 0 16px rgba(0, 0, 0, 0.2)",
          borderRadius: 8,
          overflow: "hidden",
          m: 0,
          p: 0,
          transition: "all 0.3s ease-out",
          backdropFilter: "blur(10px)",
          pointerEvents: isOpen ? "auto" : "none",
          cursor: "default"
        }}
      >
        <ChatHeader
          isMinimized={isMinimized}
          onMinimize={handleMinimize}
          onReset={handleReset}
          messagesCount={messages.length}
          title="Chat"
          icon={<ChatBubbleOutlineIcon sx={{ fontSize: "1.5em" }} />}
          description="Chat"
        />

        {!isMinimized && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              // height: "calc(100% - 20px)",
              overflow: "hidden",
              pb: 5
            }}
          >
            {error && <Alert severity="error">{error}</Alert>}
            <ChatView
              status={status}
              messages={messages}
              sendMessage={handleSendMessage}
              currentNodeName={currentNodeName}
              progress={progress}
              total={total}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default WorkflowChat;
