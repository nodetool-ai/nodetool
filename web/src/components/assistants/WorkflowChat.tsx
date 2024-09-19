import React, { useCallback, useEffect } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { Box, Button, IconButton, Tooltip } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { ClearIcon } from "@mui/x-date-pickers/icons";

interface WorkflowChatProps {
  workflow_id: string;
}

const WorkflowChat: React.FC<WorkflowChatProps> = ({ workflow_id }) => {
  const {
    messages,
    status,
    connect,
    sendMessage,
    resetMessages,
    currentNodeName,
    progress,
    total
  } = useWorkflowChatStore();

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (workflow_id) {
        const newMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content,
          workflow_id
        };
        await sendMessage(newMessage);
      }
    },
    [workflow_id, sendMessage]
  );

  useEffect(() => {
    connect(workflow_id);
  }, [connect, workflow_id]);

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow_id);
  }, [resetMessages, connect, workflow_id]);

  return (
    <div>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "right",
          mb: 2
        }}
      >
        <Button
          variant="outlined"
          startIcon={<ClearIcon />}
          onClick={handleReset}
          disabled={messages.length === 0}
        >
          Reset Chat
        </Button>
      </Box>
      <ChatView
        status={status}
        messages={messages}
        sendMessage={handleSendMessage}
        currentNodeName={currentNodeName}
        progress={progress}
        total={total}
      />
    </div>
  );
};

export default WorkflowChat;
