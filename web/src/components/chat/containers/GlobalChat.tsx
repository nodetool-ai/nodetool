/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useRef } from "react";
import { Box, Alert, Typography } from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useParams, useNavigate } from "react-router-dom";
import ChatView from "./ChatView";
import BackToEditorButton from "../../panels/BackToEditorButton";
import BackToDashboardButton from "../../panels/BackToDashboardButton";
import useGlobalChatStore, { useThreadsQuery } from "../../../stores/GlobalChatStore";
import { LanguageModel, Message } from "../../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../../config/constants";

const GlobalChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
  const navigate = useNavigate();
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
    getCurrentMessagesSync,
    createNewThread,
    threads,
    switchThread,
    deleteThread,
    stopGeneration,
    agentMode,
    setAgentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    isLoadingMessages,
    threadsLoaded
  } = useGlobalChatStore();

  // Use the consolidated TanStack Query hook from the store
  const {
    isLoading: isLoadingThreads,
    error: threadsError
  } = useThreadsQuery();

  const tryParseModel = (model: string) => {
    try {
      return JSON.parse(model);
    } catch (error) {
      return DEFAULT_MODEL;
    }
  };

  const [selectedModel, setSelectedModel] = useState<LanguageModel>(() => {
    const savedModel = localStorage.getItem("selectedModel");
    return savedModel ? tryParseModel(savedModel) : DEFAULT_MODEL;
  });
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get messages from store
  const messages = getCurrentMessagesSync();

  // Connect once on mount and clean up on unmount
  useEffect(() => {
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to global chat:", error);
      });
    }

    return () => {
      // Only disconnect on actual unmount, not on thread changes
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Handle thread switching when URL changes
  useEffect(() => {
    const handleThreadLogic = async () => {
      // Cancel any previous async operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller for this operation
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Wait for threads to be loaded before attempting to switch
        if (!threadsLoaded || isLoadingThreads) {
          return;
        }

        // Check if operation was cancelled
        if (abortController.signal.aborted) {
          return;
        }

        if (thread_id && thread_id !== currentThreadId) {
          switchThread(thread_id);
        } else if (!currentThreadId && !thread_id) {
          // Create new thread if none exists
          const newThreadId = await createNewThread();
          
          // Check if operation was cancelled before switching
          if (!abortController.signal.aborted) {
            switchThread(newThreadId);
          }
        }
      } catch (error) {
        // Only log errors if the operation wasn't cancelled
        if (!abortController.signal.aborted) {
          console.error("Failed to handle thread logic:", error);
        }
      }
    };

    handleThreadLogic();

    // Cleanup function to cancel any pending async operations
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [thread_id, currentThreadId, switchThread, createNewThread, threadsLoaded, isLoadingThreads]);

  // Remove extra reconnect loop; rely on WebSocketManager's exponential backoff and
  // the store's network/visibility listeners to reconnect. This avoids double reconnects.

  // Close the drawer automatically when switching to desktop view
  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  // Save selectedModel to localStorage
  useEffect(() => {
    localStorage.setItem("selectedModel", JSON.stringify(selectedModel));
  }, [selectedModel]);

  // Map status to ChatView compatible status
  const getChatViewStatus = () => {
    if (status === "stopping") return "loading";
    return status;
  };

  const handleNewChat = async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
      navigate(`/chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  };

  const mainAreaStyles = (theme: Theme) =>
    css({
      position: "relative",
      flex: 1,
      display: "flex",
      flexDirection: "column",

      ".chat-header": {
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1000
      },

      ".chat-container": {
        flex: 1,
        overflow: "hidden"
      }
    });

  // Show loading state if threads are still loading
  if (isLoadingThreads) {
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

  // Show error state if threads failed to load
  if (threadsError) {
    return (
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Alert severity="error">
          Failed to load threads: {threadsError.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        marginLeft: { xs: "0.5rem", md: "2rem" },
        marginRight: { xs: "0.5rem", md: "2rem" },
        paddingLeft: { xs: "0.5rem", md: "0" },
        paddingRight: { xs: "0.5rem", md: "0" },
        overflow: "hidden"
      }}
    >
      {/* Main Chat Area */}
      <Box
        css={mainAreaStyles(theme)}
        sx={{ height: "100%", maxHeight: "100%" }}
      >
        <Box
          className="chat-header"
          sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}
        >
          <BackToDashboardButton />
          <BackToEditorButton />
        </Box>

        {(error ||
          status === "reconnecting" ||
          status === "disconnected" ||
          status === "failed") && (
          <Alert
            severity={
              status === "reconnecting"
                ? "info"
                : status === "disconnected"
                ? "warning"
                : "error"
            }
            sx={{
              position: "absolute",
              top: "5rem",
              left: "50%",
              transform: "translateX(-50%)",
              maxWidth: "600px",
              width: "100%",
              zIndex: 1001,
              flexShrink: 0
            }}
          >
            {status === "reconnecting"
              ? statusMessage || "Reconnecting to chat service..."
              : status === "disconnected"
              ? "Connection lost. Reconnecting automatically..."
              : status === "failed"
              ? "Connection failed. Retrying automatically..."
              : error}
          </Alert>
        )}

        <Box className="chat-container" sx={{ minHeight: 0, flex: 1 }}>
          <ChatView
            status={getChatViewStatus()}
            messages={messages}
            sendMessage={sendMessage}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            model={selectedModel}
            selectedTools={selectedTools}
            onToolsChange={setSelectedTools}
            selectedCollections={selectedCollections}
            onCollectionsChange={setSelectedCollections}
            onModelChange={setSelectedModel}
            onStop={stopGeneration}
            onNewChat={handleNewChat}
            agentMode={agentMode}
            onAgentModeToggle={setAgentMode}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default GlobalChat;
