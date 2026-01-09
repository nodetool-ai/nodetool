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
          width: "calc(100% - 32px)",
          margin: "16px",
          height: "48px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
          borderRadius: "16px",
          color: (theme as any).vars.palette.common.white,
          background: (theme as any).vars.palette.grey[800],
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          textTransform: "none",
          fontWeight: 600,
          fontSize: "0.95rem",
          letterSpacing: "0.02em",
          justifyContent: "center",
          border: `1px solid ${(theme as any).vars.palette.grey[700]}`,

          "&:hover": {
            background: (theme as any).vars.palette.grey[700],
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            border: `1px solid ${(theme as any).vars.palette.grey[600]}`,
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
