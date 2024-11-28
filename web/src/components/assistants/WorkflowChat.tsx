import React, { useCallback, useEffect } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import {
  Alert,
  Box,
  Button,
  Typography,
  Fade,
  IconButton
} from "@mui/material";
import { ClearIcon } from "@mui/x-date-pickers/icons";
import MinimizeIcon from "@mui/icons-material/Minimize";

interface WorkflowChatProps {
  workflow_id: string;
  onClose?: () => void;
  isOpen?: boolean;
}

const WorkflowChat: React.FC<WorkflowChatProps> = ({
  workflow_id,
  onClose,
  isOpen = true
}) => {
  const [isMinimized, setIsMinimized] = React.useState(true);
  const {
    messages,
    status,
    connect,
    sendMessage,
    resetMessages,
    currentNodeName,
    progress,
    total,
    error
  } = useWorkflowChatStore();
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (workflow_id) {
        const newMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content,
          workflow_id
        };
        await sendMessage(newMessage);
      }
    },
    [workflow_id, sendMessage]
  );

  useEffect(() => {
    connect(workflow_id);
  }, [connect, workflow_id]);

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow_id);
  }, [resetMessages, connect, workflow_id]);

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  return (
    <Fade in={isOpen}>
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "400px",
          maxHeight: isMinimized ? "64px" : "80vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: isOpen
            ? "background.paper"
            : "rgba(255, 255, 255, 0.1)",
          boxShadow: isOpen ? 3 : 1,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          overflow: "hidden",
          m: 0,
          p: 2,
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: !isOpen ? "blur(5px)" : "none",
          pointerEvents: isOpen ? "auto" : "none"
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: isMinimized ? 0 : 2
          }}
        >
          {!isMinimized && (
            <Button
              variant="text"
              startIcon={<ClearIcon />}
              onClick={handleReset}
              disabled={messages.length === 0}
              sx={{
                color: "text.secondary",
                "&:hover": {
                  backgroundColor: "action.hover"
                }
              }}
            >
              Reset Chat
            </Button>
          )}
          {isMinimized && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Workflow Chat
            </Typography>
          )}
          <IconButton
            onClick={handleMinimize}
            size="small"
            sx={{
              color: "text.secondary",
              "& svg": {
                transform: isMinimized ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
              },
              "&:hover": {
                backgroundColor: "action.hover"
              }
            }}
          >
            <MinimizeIcon fontSize="small" />
          </IconButton>
        </Box>
        {!isMinimized && (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography variant="body1" sx={{ margin: "0.5em" }}>
                Chat with your workflow!
              </Typography>
            </Box>
            <ChatView
              status={status}
              messages={messages}
              sendMessage={handleSendMessage}
              currentNodeName={currentNodeName}
              progress={progress}
              total={total}
            />
          </>
        )}
      </Box>
    </Fade>
  );
};

export default WorkflowChat;
