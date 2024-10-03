import React, { useCallback, useEffect } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { Alert, Box, Button, Typography } from "@mui/material";
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
    total,
    error
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
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Typography variant="body1" sx={{ margin: "0.5em" }}>
          Chat with your workflow. You can ask it questions and it will respond.
          You need to have one chat input and chat output node in your workflow.
        </Typography>
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
