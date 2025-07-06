import React, { memo } from "react";
import { Box, Alert } from "@mui/material";
import { isEqual } from "lodash";
import { Message } from "../../../stores/ApiTypes";
import useWorkflowChatStore from "../../../stores/WorkflowChatStore";
import ChatView from "./ChatView";

interface ChatContentProps {
  handleSendMessage: (message: Message) => Promise<void>;
  graph?: {
    nodes: any[];
    edges: any[];
  };
}

const ChatContent: React.FC<ChatContentProps> = ({ handleSendMessage, graph }) => {
  const { 
    status, 
    progress, 
    error, 
    statusMessage,
    getCurrentMessages,
    currentPlanningUpdate,
    currentTaskUpdate,
    stopGeneration
  } = useWorkflowChatStore();
  
  const messages = getCurrentMessages();

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        pb: 1
      }}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <ChatView
        status={status}
        messages={messages}
        sendMessage={handleSendMessage}
        progress={progress.current}
        total={progress.total}
        progressMessage={statusMessage}
        onStop={stopGeneration}
        currentPlanningUpdate={currentPlanningUpdate}
        currentTaskUpdate={currentTaskUpdate}
        graph={graph}
      />
    </Box>
  );
};

export default memo(ChatContent, isEqual);
