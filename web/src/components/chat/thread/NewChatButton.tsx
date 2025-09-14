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
              margin: "10px 10px",
              width: "calc(100% - 10px)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              borderRadius: 12,
              color: (theme as any).vars.palette.grey[200],
              backgroundColor: "transparent",
              border: `1px solid ${(theme as any).vars.palette.grey[700]}`,
              boxShadow: "none",
              textTransform: "none",
              justifyContent: "center",
              transition:
                "all 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s ease",
              "&:hover": {
                backgroundColor: `${
                  (theme as any).vars.palette.primary.main
                }14`,
                borderColor: (theme as any).vars.palette.primary.main,
                boxShadow: `0 2px 8px rgba(0, 0, 0, 0.25)`
              },
              "&:active": {
                transform: "scale(0.99)"
              },
              "& svg": {
                position: "relative",
                zIndex: 1
              },
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "55%",
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.02) 60%, transparent)",
                pointerEvents: "none",
                zIndex: 0
              },
              "&::after": {
                content: '""',
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                pointerEvents: "none"
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
