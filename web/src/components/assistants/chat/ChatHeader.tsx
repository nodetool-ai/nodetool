import React from "react";
import { Box, Typography } from "@mui/material";
import { ResetButton } from "./ResetButton";
import { MinimizeButton } from "./MinimizeButton";

interface ChatHeaderProps {
  isMinimized: boolean;
  onMinimize?: () => void;
  onReset?: () => void;
  messagesCount: number;
  title?: string;
  description?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isMinimized,
  onMinimize,
  onReset,
  messagesCount,
  title,
  description
}) => (
  <Box
    className="chat-header"
    sx={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      mb: isMinimized ? 0 : 2,
      position: "sticky",
      top: 0,
      zIndex: 1,
      py: 1
    }}
  >
    {!isMinimized && onReset && (
      <ResetButton onClick={onReset} disabled={messagesCount === 0} />
    )}
    {isMinimized && title && (
      <Typography
        variant="body2"
        onClick={onMinimize}
        sx={{
          color: "text.secondary",
          padding: "0.5em 1em 0 1em",
          textAlign: "center",
          width: "100%",
          cursor: "pointer",
          userSelect: "none",
          "&:hover": {
            color: "c_gray6"
          }
        }}
      >
        {title}
      </Typography>
    )}
    {description && !isMinimized && (
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          flexGrow: 1,
          userSelect: "none",
          textAlign: "center",
          textTransform: "uppercase",
          fontWeight: "light"
        }}
      >
        {description}
      </Typography>
    )}
    {onMinimize && (
      <MinimizeButton onClick={onMinimize} isMinimized={isMinimized} />
    )}
  </Box>
);
