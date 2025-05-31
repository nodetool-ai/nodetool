import React from "react";
import { Box, Button, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

interface NewChatButtonProps {
  onNewThread: () => void;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({ onNewThread }) => {
  return (
    <Box className="new-chat-section">
      <Tooltip title="New Chat">
        <Button
          className="new-chat-button"
          onClick={onNewThread}
          startIcon={<AddIcon />}
        >
          New Chat
        </Button>
      </Tooltip>
    </Box>
  );
};