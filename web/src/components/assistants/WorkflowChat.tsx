import React, { useCallback, useEffect } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import {
  Message,
  MessageImageContent,
  MessageTextContent
} from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { useNodeStore } from "../../stores/NodeStore";
import { Alert, Box, Fade } from "@mui/material";
import { ChatHeader } from "./chat/ChatHeader";

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

  const hasChatInput = nodes.some(
    (node) => node.type === "nodetool.input.ChatInput"
  );

  if (!hasChatInput) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)"
      }}
    >
      <Box
        className="workflow-chat-container"
        sx={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: isMinimized ? "180px" : "50vw",
          maxHeight: isMinimized ? "64px" : "80vh",
          height: isMinimized ? "50px" : "50vh",
          minHeight: isMinimized ? "50px" : "250px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: isOpen
            ? "rgba(8, 8, 8, 0.9)"
            : "rgba(16, 16, 16, 0.5)",
          boxShadow: isOpen
            ? "0 -32px 64px rgba(0, 0, 0, 0.2)"
            : "0 -16px 32px rgba(0, 0, 0, 0.1)",
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          overflow: "hidden",
          m: 0,
          p: 2,
          // transitionProperty: "width, height, min-height, max-height",
          // transitionDuration: "300ms",
          // transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          transition: "all 0.3s ease-out",
          backdropFilter: "blur(10px)",
          pointerEvents: isOpen ? "auto" : "none"
        }}
      >
        <ChatHeader
          isMinimized={isMinimized}
          onMinimize={handleMinimize}
          onReset={handleReset}
          messagesCount={messages.length}
          title="Workflow Chat"
          description="Chat with your workflow"
        />

        {!isMinimized && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              height: "calc(100% - 64px)",
              overflow: "hidden"
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
