import React, { memo, useState, useCallback } from "react";
import { Box } from "@mui/material";
import { isEqual } from "lodash";
import { useWorkflowChat } from "./hooks/useWorkflowChat";
import ChatContainer from "./chat/ChatContainer";
import ChatControls from "./chat/ChatControls";
import ChatContent from "./chat/ChatContent";

interface WorkflowChatProps {
  workflow_id: string;
  isOpen?: boolean;
}

const WorkflowChat: React.FC<WorkflowChatProps> = ({
  workflow_id,
  isOpen = true
}) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const { handleSendMessage, handleReset, isChat } = useWorkflowChat(
    workflow_id,
    isMinimized
  );

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  if (!isChat) {
    return null;
  }

  return (
    <Box sx={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000 }}>
      <ChatContainer isMinimized={isMinimized} isOpen={isOpen}>
        <ChatControls
          onMinimize={handleMinimize}
          onReset={handleReset}
          isMinimized={isMinimized}
        />

        {!isMinimized && <ChatContent handleSendMessage={handleSendMessage} />}
      </ChatContainer>
    </Box>
  );
};

export default memo(WorkflowChat, isEqual);
