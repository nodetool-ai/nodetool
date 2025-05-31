/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Box, Alert, IconButton, Typography } from "@mui/material";
import Drawer from "@mui/material/Drawer";
import MenuIcon from "@mui/icons-material/Menu";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import ChatView from "./ChatView";
import ThreadList from "../thread/ThreadList";
import BackToEditorButton from "../../panels/BackToEditorButton";
import BackToDashboardButton from "../../dashboard/BackToDashboardButton";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { Message } from "../../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../../config/constants";

const GlobalChat: React.FC = () => {
  const {
    connect,
    disconnect,
    status,
    sendMessage,
    progress,
    resetMessages,
    statusMessage,
    error,
    currentThreadId,
    getCurrentMessages,
    createNewThread,
    threads,
    switchThread,
    deleteThread,
    stopGeneration
  } = useGlobalChatStore();

  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mountedRef = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messages = getCurrentMessages();

  // Handle connection lifecycle
  useEffect(() => {
    mountedRef.current = true;

    // Ensure we have a thread
    if (!currentThreadId) {
      createNewThread();
    }

    // Delay connection attempt to avoid StrictMode double-invocation issues
    if (status === "disconnected") {
      connectionTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect().catch((error) => {
            console.error("Failed to connect to global chat:", error);
          });
        }
      }, 100);
    }

    return () => {
      mountedRef.current = false;

      // Clear any pending connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // Only disconnect if we're actually connected
      if (status === "connected" || status === "connecting") {
        disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  const handleNewChat = useCallback(() => {
    createNewThread();
    // Reset tools when starting a new chat
    setSelectedTools([]);
    if (isMobile) setDrawerOpen(false);
  }, [createNewThread, isMobile]);

  // Close the drawer automatically when switching to desktop view
  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        console.error("No model selected");
        return;
      }

      if (status !== "connected") {
        console.error("Not connected to chat service");
        return;
      }

      try {
        // Update the message with the selected model
        const messageWithModel = {
          ...message,
          model: selectedModel
        };
        await sendMessage(messageWithModel);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [selectedModel, sendMessage, status]
  );

  // Get first message text for thread preview
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

  const handleDeleteThread = useCallback(
    (_e: React.MouseEvent | undefined, threadId: string) => {
      if (_e) {
        _e.stopPropagation();
      }
      deleteThread(threadId);
    },
    [deleteThread]
  );

  const mainAreaStyles = (theme: any) =>
    css({
      flex: 1,
      display: "flex",
      flexDirection: "column",

      ".chat-header": {
        padding: "0 1em",
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(2),
        boxShadow: "2px 0 10px 0 rgba(0, 0, 0, 0.7)"
      },

      ".chat-container": {
        flex: 1,
        overflow: "hidden"
      }
    });

  // Show loading state if store hasn't initialized
  if (!threads) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Typography>Loading chat...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: isMobile ? "column" : "row"
      }}
    >
      {/* Thread List Sidebar */}
      {isMobile ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          PaperProps={{ sx: { width: 260 } }}
        >
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={(id) => {
              switchThread(id);
              setDrawerOpen(false);
            }}
            onDeleteThread={(id) => handleDeleteThread(undefined as any, id)}
            getThreadPreview={getThreadPreview}
          />
        </Drawer>
      ) : (
        <ThreadList
          threads={threads}
          currentThreadId={currentThreadId}
          onNewThread={handleNewChat}
          onSelectThread={switchThread}
          onDeleteThread={(id) => handleDeleteThread(undefined as any, id)}
          getThreadPreview={getThreadPreview}
        />
      )}

      {/* Main Chat Area */}
      <Box css={mainAreaStyles}>
        <Box className="chat-header">
          {isMobile && (
            <IconButton onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <BackToDashboardButton />
          <BackToEditorButton />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mx: 2, my: 1 }}>
            {error}
          </Alert>
        )}

        <Box className="chat-container">
          <ChatView
            status={status}
            messages={messages}
            sendMessage={handleSendMessage}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            model={selectedModel}
            selectedTools={selectedTools}
            onToolsChange={setSelectedTools}
            onModelChange={(modelId) => setSelectedModel(modelId)}
            onStop={stopGeneration}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default GlobalChat;
