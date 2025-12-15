import React from "react";
import { Box, Tooltip, Fab } from "@mui/material";
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
      <Tooltip title="New Chat">
        <span>
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
              color: "#fff",
              background: `linear-gradient(135deg, ${(theme as any).vars.palette.primary.main}, ${(theme as any).vars.palette.primary.dark})`,
              boxShadow: `0 4px 20px ${(theme as any).vars.palette.primary.main}40`,
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.1)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              
              "&:hover": {
                background: `linear-gradient(135deg, ${(theme as any).vars.palette.primary.light}, ${(theme as any).vars.palette.primary.main})`,
                boxShadow: `0 8px 30px ${(theme as any).vars.palette.primary.main}60`,
                transform: "translateY(-2px)",
                border: "1px solid rgba(255,255,255,0.2)",
              },
              "&:active": {
                transform: "scale(0.98) translateY(0)",
                boxShadow: `0 2px 10px ${(theme as any).vars.palette.primary.main}40`,
              },
              "& svg": {
                 fontSize: "1.3rem",
              }
            }}
          >
            <AddIcon sx={{ mr: 1 }} /> New Chat
          </Fab>
        </span>
      </Tooltip>
    </Box>
  );
};
