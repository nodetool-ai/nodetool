/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback
} from "react";
import { Box, Alert, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useParams, useNavigate } from "react-router-dom";
import ChatView from "./ChatView";
import useGlobalChatStore, {
  useThreadsQuery
} from "../../../stores/GlobalChatStore";
import { NewChatButton } from "../thread/NewChatButton";
import { usePanelStore } from "../../../stores/PanelStore";
import { useRightPanelStore } from "../../../stores/RightPanelStore";
import { useEnsureChatConnected } from "../../../hooks/useEnsureChatConnected";

const GlobalChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
  const navigate = useNavigate();
  const {
    status,
    sendMessage,
    progress,
    statusMessage,
    error,
    currentThreadId,
    getCurrentMessagesSync,
    createNewThread,
    switchThread,
    stopGeneration,
    agentMode,
    setAgentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    threadsLoaded
  } = useGlobalChatStore();
  const runningToolCallId = useGlobalChatStore(
    (s) => s.currentRunningToolCallId
  );
  const runningToolMessage = useGlobalChatStore((s) => s.currentToolMessage);

  // Use the consolidated TanStack Query hook from the store
  const { isLoading: isLoadingThreads, error: threadsError } =
    useThreadsQuery();

  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const selectedTools = useGlobalChatStore((s) => s.selectedTools);
  const setSelectedTools = useGlobalChatStore((s) => s.setSelectedTools);
  const selectedCollections = useGlobalChatStore((s) => s.selectedCollections);
  const setSelectedCollections = useGlobalChatStore(
    (s) => s.setSelectedCollections
  );
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Side panel states (for desktop spacing)
  const leftPanel = usePanelStore((s) => s.panel);
  const rightPanel = useRightPanelStore((s) => s.panel);

  // Get messages from store
  const messages = getCurrentMessagesSync();

  // Ensure chat connection while GlobalChat is visible (do not disconnect on unmount)
  useEnsureChatConnected();

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
  }, [
    thread_id,
    currentThreadId,
    switchThread,
    createNewThread,
    threadsLoaded,
    isLoadingThreads
  ]);

  // Remove extra reconnect loop; rely on WebSocketManager's exponential backoff and
  // the store's network/visibility listeners to reconnect. This avoids double reconnects.

  // Close the drawer automatically when switching to desktop view
  useEffect(() => {
    setDrawerOpen(false);
  }, []);

  // Handle mobile keyboard behavior and maintain scroll position
  useEffect(() => {
    if (!isMobile) return;

    const handleViewportChange = () => {
      // Maintain scroll position when virtual keyboard appears/disappears
      setTimeout(() => {
        if (chatContainerRef.current) {
          const chatArea = chatContainerRef.current.querySelector(
            ".chat-thread-container"
          );
          if (chatArea) {
            // Check if user was at bottom before viewport change
            const wasAtBottom =
              chatArea.scrollTop + chatArea.clientHeight >=
              chatArea.scrollHeight - 100;
            if (wasAtBottom) {
              // Keep scrolled to bottom
              chatArea.scrollTop = chatArea.scrollHeight;
            }
          }
        }
      }, 150);
    };

    // Use Visual Viewport API for better keyboard handling
    if ((window as any).visualViewport) {
      (window as any).visualViewport.addEventListener(
        "resize",
        handleViewportChange
      );
      return () => {
        (window as any).visualViewport.removeEventListener(
          "resize",
          handleViewportChange
        );
      };
    }
  }, [isMobile]);

  // model persistence is handled inside the store's setter

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
      height: "100%",
      minHeight: 0,
      maxHeight: "100%",

      ".chat-container": {
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        maxHeight: "100%",
        position: "relative"
      }

      // Mobile styles handled via separate CSS file
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
      ref={chatContainerRef}
      className="global-chat-container"
      sx={{
        flex: 1,
        width: "100%",
        minWidth: 0,
        height: "100dvh", // Dynamic viewport height
        maxHeight: "100dvh",
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        // No top padding needed since AppHeader is external now
        // Add horizontal padding on desktop to avoid side panes
        paddingLeft: isMobile
          ? 0
          : leftPanel.isVisible
          ? `${leftPanel.panelSize}px`
          : `${leftPanel.minWidth}px`,
        paddingRight: isMobile
          ? 0
          : rightPanel.isVisible
          ? `${rightPanel.panelSize}px`
          : 0,
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box"
        // Mobile styles handled via separate CSS file
      }}
    >
      {/* Main Chat Area */}
      <Box
        css={mainAreaStyles(theme)}
        sx={{ height: "100%", maxHeight: "100%" }}
      >
        {(error ||
          status === "reconnecting" ||
          status === "disconnected" ||
          status === "failed") && (
          <Alert
            className="global-chat-status-alert"
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

        {/* Controls row */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            pt: 1,
            mt: 10
          }}
        >
          <NewChatButton onNewThread={handleNewChat} />
        </Box>

        <Box className="chat-container" sx={{ minHeight: 0, flex: 1 }}>
          <ChatView
            status={getChatViewStatus()}
            messages={messages}
            sendMessage={sendMessage}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            runningToolCallId={runningToolCallId}
            runningToolMessage={runningToolMessage}
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
