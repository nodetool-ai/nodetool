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
  icon?: React.ReactNode;
  description?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isMinimized,
  onMinimize,
  onReset,
  messagesCount,
  title,
  icon,
  description
}) => (
  <Box
    className="chat-header"
    sx={{
      display: "flex",
      cursor: "grab",
      justifyContent: "space-between",
      alignItems: "center",
      mb: isMinimized ? 0 : 2,
      position: "sticky",
      top: 0,
      zIndex: 1,
      p: 0,
      height: "28px",
      borderRadius: isMinimized ? "20px" : "12px 12px 0 0"
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
          padding: "1.5em 1em 0 1.5em",
          textAlign: "center",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 3,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": {
            color: "c_gray6"
          }
        }}
      >
        {icon}
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
