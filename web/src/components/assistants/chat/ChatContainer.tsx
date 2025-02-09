import React, { memo } from "react";
import { Box } from "@mui/material";
import { isEqual } from "lodash";

interface ChatContainerProps {
  isMinimized: boolean;
  isOpen: boolean;
  children: React.ReactNode;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  isMinimized,
  isOpen,
  children
}) => (
  <Box
    className="workflow-chat-container"
    sx={{
      position: "relative",
      width: isMinimized ? "120px" : "400px",
      maxHeight: "600px",
      height: isMinimized ? "56px" : "500px",
      transform: "translate(0, 0)",
      display: "flex",
      flexDirection: "column",
      backgroundColor: isOpen ? "rgba(8, 8, 8, 0.9)" : "rgba(16, 16, 16, 0.5)",
      boxShadow: isOpen
        ? "0 0 32px rgba(0, 0, 0, 0.3)"
        : "0 0 16px rgba(0, 0, 0, 0.2)",
      borderRadius: 8,
      overflow: "hidden",
      m: 0,
      p: 0,
      transition: "all 0.3s ease-out",
      backdropFilter: "blur(10px)",
      pointerEvents: isOpen ? "auto" : "none",
      cursor: "default"
    }}
  >
    {children}
  </Box>
);

export default memo(ChatContainer, isEqual);
