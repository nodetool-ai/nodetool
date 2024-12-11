import React, { useCallback, useEffect } from "react";
import useWorkflowChatStore from "../../stores/WorkflowChatStore";
import { Message } from "../../stores/ApiTypes";
import ChatView from "./ChatView";
import { useNodeStore } from "../../stores/NodeStore";
import {
  Alert,
  Box,
  Button,
  Typography,
  Fade,
  IconButton
} from "@mui/material";
import { ClearIcon } from "@mui/x-date-pickers/icons";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";

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
  const { nodes } = useNodeStore();

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

  useEffect(() => {
    connect(workflow_id);
  }, [connect, workflow_id]);

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

  const handleReset = useCallback(() => {
    resetMessages();
    connect(workflow_id);
  }, [resetMessages, connect, workflow_id]);

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const hasChatInput = nodes.some(
    (node) => node.type === "nodetool.input.ChatInput"
  );

  if (!hasChatInput) {
    return null;
  }

  return (
    <Fade in={isOpen}>
      <Box
        className="workflow-chat-container"
        sx={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: isMinimized ? "180px" : "50vw",
          maxHeight: isMinimized ? "64px" : "80vh",
          height: isMinimized ? "50px" : "50vh",
          minHeight: isMinimized ? "50px" : "250px",
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
          transitionProperty: "width, height, min-height, max-height",
          transitionDuration: "300ms",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: !isOpen ? "blur(5px)" : "none",
          pointerEvents: isOpen ? "auto" : "none"
        }}
      >
        <Box
          className="workflow-chat-header"
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: isMinimized ? 0 : 2,
            position: "sticky",
            top: 0,
            backgroundColor: "background.paper",
            zIndex: 1,
            py: 1
          }}
        >
          {!isMinimized && (
            <Button
              className="reset-chat-button"
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
            <Typography
              variant="body2"
              onClick={handleMinimize}
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
              Workflow Chat
            </Typography>
          )}
          <IconButton
            onClick={handleMinimize}
            size="small"
            sx={{
              color: "text.secondary",
              "&:hover": {
                backgroundColor: "action.hover"
              }
            }}
          >
            {isMinimized ? <></> : <UnfoldLessIcon fontSize="small" />}
          </IconButton>
        </Box>
        {!isMinimized && (
          <Box
            className="chat-container"
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              height: "100%"
            }}
          >
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
          </Box>
        )}
      </Box>
    </Fade>
  );
};

export default WorkflowChat;
