import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { Alert, Box, Fade } from "@mui/material";
import { ChatHeader } from "./chat/ChatHeader";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useNodes } from "../../contexts/NodeContext";
import { reactFlowEdgeToGraphEdge } from "../../stores/reactFlowEdgeToGraphEdge";
import { reactFlowNodeToGraphNode } from "../../stores/reactFlowNodeToGraphNode";
import { isEqual } from "lodash";

interface WorkflowChatProps {
  workflow_id: string;
  isOpen?: boolean;
}

// New component for handling workflow-related hooks and logic
const useWorkflowChat = (workflow_id: string, isMinimized: boolean) => {
  const { nodes, edges, workflow } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow
  }));

  const { connect, sendMessage, resetMessages } = useWorkflowChatStore();

  useEffect(() => {
    if (!isMinimized) {
      connect(workflow);
    }
  }, [connect, workflow, isMinimized]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (workflow_id) {
        message.workflow_id = workflow_id;
        message.graph = {
          nodes: nodes.map(reactFlowNodeToGraphNode),
          edges: edges.map(reactFlowEdgeToGraphEdge)
        };
        await sendMessage(message);
      } else {
        console.error("Workflow ID is not set");
      }
    },
    [workflow_id, sendMessage, nodes, edges]
  );

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow);
  }, [resetMessages, connect, workflow]);

  const hasChatInput = useMemo(
    () => nodes.some((node) => node.type === "nodetool.input.ChatInput"),
    [nodes]
  );

  return {
    handleSendMessage,
    handleReset,
    hasChatInput
  };
};

const ChatContainer: React.FC<{
  isMinimized: boolean;
  isOpen: boolean;
  children: React.ReactNode;
}> = ({ isMinimized, isOpen, children }) => (
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
      backgroundColor: isOpen ? "rgba(8, 8, 8, 0.9)" : "rgba(16, 16, 16, 0.5)",
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
    {children}
  </Box>
);

const ChatContent: React.FC<{
  workflow_id: string;
  handleSendMessage: (message: Message) => Promise<void>;
}> = ({ workflow_id, handleSendMessage }) => {
  const { messages, status, currentNodeName, progress, total, error } =
    useWorkflowChatStore();

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
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
  );
};

const ChatControls: React.FC<{
  onMinimize: () => void;
  onReset: () => void;
  isMinimized: boolean;
}> = ({ onMinimize, onReset, isMinimized }) => {
  const messages = useWorkflowChatStore((state) => state.messages);
  return (
    <ChatHeader
      isMinimized={isMinimized}
      onMinimize={onMinimize}
      onReset={onReset}
      messagesCount={messages.length}
      title="Chat"
      icon={<ChatBubbleOutlineIcon sx={{ fontSize: "1.5em" }} />}
      description="Chat"
    />
  );
};

const WorkflowChat: React.FC<WorkflowChatProps> = ({
  workflow_id,
  isOpen = true
}) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const { handleSendMessage, handleReset, hasChatInput } = useWorkflowChat(
    workflow_id,
    isMinimized
  );

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  if (!hasChatInput) {
    return null;
  }

  return (
    <Box sx={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000 }}>
      <ChatContainer isMinimized={isMinimized} isOpen={isOpen}>
        <ChatControls
          onMinimize={handleMinimize}
          onReset={handleReset}
          isMinimized={isMinimized}
        />

        {!isMinimized && (
          <ChatContent
            workflow_id={workflow_id}
            handleSendMessage={handleSendMessage}
          />
        )}
      </ChatContainer>
    </Box>
  );
};

export default memo(WorkflowChat, isEqual);
