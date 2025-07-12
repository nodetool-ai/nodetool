import React, { memo, useState, useCallback } from "react";
import { Box, Dialog, DialogContent, IconButton, Tooltip } from "@mui/material";
import { isEqual } from "lodash";
import ListIcon from "@mui/icons-material/List";
import { useWorkflowChat } from "../hooks/useWorkflowChat";
import ChatContainer from "./ChatContainer";
import ChatControls from "../controls/ChatControls";
import ChatContent from "./ChatContent";
import { NewChatButton } from "../thread/NewChatButton";
import ThreadList from "../thread/ThreadList";
import useWorkflowChatStore from "../../../stores/WorkflowChatStore";

interface WorkflowChatProps {
  workflow_id: string;
  isOpen?: boolean;
}

const WorkflowChat: React.FC<WorkflowChatProps> = ({
  workflow_id,
  isOpen = true
}) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const [isThreadListOpen, setIsThreadListOpen] = useState(false);
  
  const { handleSendMessage, handleReset, isChat, graph } = useWorkflowChat(
    workflow_id,
    isMinimized
  );
  
  const {
    threads,
    currentThreadId,
    createNewThread,
    switchThread,
    deleteThread
  } = useWorkflowChatStore();

  const handleMinimize = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  // Handlers for thread actions
  const handleNewChat = useCallback(() => {
    createNewThread();
    setIsThreadListOpen(false);
  }, [createNewThread]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      setIsThreadListOpen(false);
    },
    [switchThread]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id);
    },
    [deleteThread]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) return "Loading...";
      const thread = threads[threadId];
      if (!thread || thread.messages.length === 0) {
        return "Empty conversation";
      }

      const firstUserMessage = thread.messages.find(
        (msg) => msg.role === "user"
      );
      if (firstUserMessage) {
        const content =
          typeof firstUserMessage.content === "string"
            ? firstUserMessage.content
            : Array.isArray(firstUserMessage.content) &&
              firstUserMessage.content[0]?.type === "text"
            ? (firstUserMessage.content[0] as any).text
            : "[Media message]";
        return content?.substring(0, 50) + (content?.length > 50 ? "..." : "");
      }

      return "New conversation";
    },
    [threads]
  );

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
        
        {!isMinimized && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.5
            }}
          >
            <Tooltip title="Chat History">
              <IconButton onClick={() => setIsThreadListOpen(true)} size="small">
                <ListIcon />
              </IconButton>
            </Tooltip>
            <NewChatButton onNewThread={createNewThread} />
          </Box>
        )}

        {!isMinimized && <ChatContent handleSendMessage={handleSendMessage} graph={graph} />}
      </ChatContainer>
      
      {/* Thread List Modal */}
      <Dialog
        open={isThreadListOpen}
        onClose={() => setIsThreadListOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogContent style={{ padding: 0, height: "70vh" }}>
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default memo(WorkflowChat, isEqual);
