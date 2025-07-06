/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { Box } from "@mui/material";
import { isEqual } from "lodash";

const styles = (theme: any) =>
  css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${theme.palette.grey[500]}40`,
    backgroundColor: `${theme.palette.grey[800]}80`,
    borderRadius: 20,
    overflow: "hidden",
    margin: 0,
    padding: 0,
    transition: "all 0.3s ease-out",
    backdropFilter: "blur(16px)",
    boxShadow: `
      0 4px 24px -1px rgba(0, 0, 0, 0.2),
      0 0 1px 0 rgba(255, 255, 255, 0.3) inset
    `,
    cursor: "default",
    width: "400px",
    maxHeight: "600px",
    height: "500px",
    
    ".new-chat-button": {
      fontSize: "0.875rem",
      padding: "4px 8px",
      minWidth: "auto"
    },

    "&.minimized": {
      width: "120px",
      height: "60px",
      backgroundColor: theme.palette.grey[800]
    },

    "&.closed": {
      pointerEvents: "none"
    }
  });

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
    css={styles}
    className={`workflow-chat-container ${isMinimized ? "minimized" : ""} ${
      !isOpen ? "closed" : ""
    }`}
  >
    {children}
  </Box>
);

export default memo(ChatContainer, isEqual);
