import React, { memo } from "react";
import { Box, Alert } from "@mui/material";
import { isEqual } from "lodash";
import { Message } from "../../../stores/ApiTypes";
import useWorkflowChatStore from "../../../stores/WorkflowChatStore";
import ChatView from "../ChatView";

interface ChatContentProps {
  handleSendMessage: (message: Message) => Promise<void>;
}

const ChatContent: React.FC<ChatContentProps> = ({ handleSendMessage }) => {
  const {
    messages,
    status,
    currentNodeName,
    progress,
    total,
    error,
    currentToolCall,
    chunks
  } = useWorkflowChatStore();

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
        currentToolCall={currentToolCall}
        chunks={chunks}
      />
    </Box>
  );
};

export default memo(ChatContent, isEqual);
