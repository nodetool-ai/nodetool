import React from "react";
import { Box, Fab } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";

interface NewChatButtonProps {
  onNewThread: () => void;
}

export const NewChatButton: React.FC<NewChatButtonProps> = ({
  onNewThread
}) => {
  const theme = useTheme();
  return (
    <Box className="new-chat-section">
      <Fab
        className={`new-chat-button`}
        onClick={onNewThread}
        variant="extended"
        aria-label="New Chat"
        sx={{
          height: "2.75em",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${(theme as any).vars.palette.grey[600]}`,
          borderRadius: ".5em",
          color: (theme as any).vars.palette.text.primary,
          background: (theme as any).vars.palette.grey[800],
          boxShadow: "2px 2px 0px var(--palette-grey-600)",
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 300,
          textTransform: "uppercase",
          justifyContent: "center",
          transition: "all 0.1s ease-in-out",
          "&:hover": {
            background: (theme as any).vars.palette.grey[700],
            boxShadow: "0px 0px 3px var(--palette-grey-500)",
            border: `1px solid ${(theme as any).vars.palette.grey[700]}`,
          },
          "&:active": {
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          },
          "& svg": {
            fontSize: "1.3rem",
          }
        }}
      >
        <AddIcon sx={{ mr: 1 }} /> New Chat
      </Fab>
    </Box>
  );
};
