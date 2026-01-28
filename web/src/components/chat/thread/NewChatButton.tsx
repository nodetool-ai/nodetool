import React from "react";
import { Box } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { CreateFab } from "../../ui_primitives";

interface NewChatButtonProps {
  onNewThread: () => void;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({
  onNewThread
}) => {
  return (
    <Box className="new-chat-section">
      <CreateFab
        className="new-chat-button"
        icon={<AddIcon sx={{ fontSize: "1.3rem" }} />}
        label="New Chat"
        tooltip="Start a new chat"
        onClick={onNewThread}
        fabColor="default"
        nodrag={false}
        sx={(theme) => ({
          height: "2.75em",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${theme.vars.palette.grey[600]}`,
          borderRadius: ".5em",
          color: theme.vars.palette.text.primary,
          background: theme.vars.palette.grey[800],
          boxShadow: "2px 2px 0px var(--palette-grey-600)",
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 300,
          textTransform: "uppercase",
          justifyContent: "center",
          transition: "all 0.1s ease-in-out",
          "&:hover": {
            background: theme.vars.palette.grey[700],
            boxShadow: "0px 0px 3px var(--palette-grey-500)",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          },
          "&:active": {
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
          }
        })}
      />
    </Box>
  );
};
