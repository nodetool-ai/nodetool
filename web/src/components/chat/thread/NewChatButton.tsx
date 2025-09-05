import React from "react";
import { Box, Tooltip, Fab } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

interface NewChatButtonProps {
  onNewThread: () => void;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({
  onNewThread
}) => {
  return (
    <Box className="new-chat-section">
      <Tooltip title="New Chat">
        <span>
          <Fab
            className={`new-chat-button`}
            onClick={onNewThread}
            variant="extended"
            aria-label="New Chat"
          >
            <AddIcon sx={{ mr: 1 }} /> New Chat
          </Fab>
        </span>
      </Tooltip>
    </Box>
  );
};
