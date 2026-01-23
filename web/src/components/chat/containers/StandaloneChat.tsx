/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useEffect,
  useRef,
  useMemo,
  useState
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
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

/**
 * StandaloneChat is a version of GlobalChat without app chrome (no AppHeader, no PanelRight).
 * It includes PanelLeft but is designed to be opened in a standalone window from the tray.
 */
const StandaloneChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
  const navigate = useNavigate();
  
  // Get store actions first
  const connect = useGlobalChatStore((s) => s.connect);
  const disconnect = useGlobalChatStore((s) => s.disconnect);
  
  // Get connection state from WebSocket manager directly
  const [connectionState, setConnectionState] = React.useState(
    globalWebSocketManager.getConnectionState()
  );

  useEffect(() => {
    const unsubscribe = globalWebSocketManager.subscribeEvent(
      "stateChange",
      () => {
        setConnectionState(globalWebSocketManager.getConnectionState());
      }
    );
    return unsubscribe;
  }, []);

  // Initialize GlobalChatStore connection on mount
  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect GlobalChatStore:", err);
    });
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const status = useGlobalChatStore((s) => s.status);
  const sendMessage = useGlobalChatStore((s) => s.sendMessage);
  const progress = useGlobalChatStore((s) => s.progress);
  const statusMessage = useGlobalChatStore((s) => s.statusMessage);
  const error = useGlobalChatStore((s) => s.error);
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const threads = useGlobalChatStore((s) => s.threads);
  const getCurrentMessagesSync = useGlobalChatStore((s) => s.getCurrentMessagesSync);
  const createNewThread = useGlobalChatStore((s) => s.createNewThread);
  const switchThread = useGlobalChatStore((s) => s.switchThread);
  const fetchThread = useGlobalChatStore((s) => s.fetchThread);
  const stopGeneration = useGlobalChatStore((s) => s.stopGeneration);
  const agentMode = useGlobalChatStore((s) => s.agentMode);
  const setAgentMode = useGlobalChatStore((s) => s.setAgentMode);
  const currentPlanningUpdate = useGlobalChatStore((s) => s.currentPlanningUpdate);
  const currentTaskUpdate = useGlobalChatStore((s) => s.currentTaskUpdate);
  const currentTaskUpdateThreadId = useGlobalChatStore((s) => s.currentTaskUpdateThreadId);
  const lastTaskUpdatesByThread = useGlobalChatStore((s) => s.lastTaskUpdatesByThread);
  const currentLogUpdate = useGlobalChatStore((s) => s.currentLogUpdate);
  const threadsLoaded = useGlobalChatStore((s) => s.threadsLoaded);
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
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Reset dismissed state when status or error changes
  useEffect(() => {
    setAlertDismissed(false);
  }, [status, error]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Side panel states (for desktop spacing) - only left panel since no PanelRight
  const leftPanel = usePanelStore((s) => s.panel);

  // Get messages from store
  const messages = getCurrentMessagesSync();
  const taskUpdateForDisplay = useMemo(() => {
    if (!currentThreadId) {return null;}
    if (
      currentTaskUpdate &&
      currentTaskUpdateThreadId === currentThreadId
    ) {
      return currentTaskUpdate;
    }
    return lastTaskUpdatesByThread[currentThreadId] ?? null;
  }, [
    currentThreadId,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread
  ]);

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
        // Check if operation was cancelled
        if (abortController.signal.aborted) {
          return;
        }

        if (thread_id) {
          if (thread_id === currentThreadId) {
            return;
          }

          if (!threads[thread_id]) {
            const fetched = await fetchThread(thread_id);
            if (abortController.signal.aborted) {
              return;
            }
            if (fetched) {
              switchThread(thread_id);
            }
            return;
          }

          switchThread(thread_id);
          return;
        }

        // Wait for threads to be loaded before attempting to switch
        if (!threadsLoaded || isLoadingThreads) {
          return;
        }

        if (!currentThreadId) {
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
    fetchThread,
    threads,
    threadsLoaded,
    isLoadingThreads
  ]);

  // Handle mobile keyboard behavior and maintain scroll position
  useEffect(() => {
    if (!isMobile) {return;}

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

  // Map status to ChatView compatible status
  const getChatViewStatus = () => {
    if (status === "stopping") {return "loading";}
    return status;
  };

  const handleNewChat = async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
      navigate(`/standalone-chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  };

  const mainAreaStyles = (_theme: Theme) =>
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
      className="standalone-chat-container"
      sx={{
        flex: 1,
        width: "100%",
        minWidth: 0,
        height: "100dvh", // Dynamic viewport height
        maxHeight: "100dvh",
        maxWidth: "100vw",
        display: "flex",
        flexDirection: "column",
        // No top padding since there's no AppHeader
        // Add horizontal padding on desktop to avoid left panel
        paddingLeft: isMobile
          ? 0
          : leftPanel.isVisible
          ? `${leftPanel.panelSize}px`
          : `${leftPanel.minWidth}px`,
        // No right padding since there's no PanelRight
        paddingRight: 0,
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
        background: theme.vars.palette.c_editor_bg_color
      }}
    >
      {/* Main Chat Area */}
      <Box
        css={mainAreaStyles(theme)}
        sx={{ height: "100%", maxHeight: "100%" }}
      >
        {!alertDismissed &&
          (error || (!connectionState.isConnected && status !== "streaming" && status !== "loading")) && (
            <Alert
              className="standalone-chat-status-alert"
              severity={
                connectionState.isConnecting
                  ? "info"
                  : !connectionState.isConnected
                  ? "warning"
                  : "error"
              }
              onClose={() => setAlertDismissed(true)}
              sx={{
                position: "absolute",
                top: "2rem",
                left: "50%",
                transform: "translateX(-50%)",
                maxWidth: "600px",
                width: "100%",
                zIndex: 1001,
                flexShrink: 0
              }}
            >
              {connectionState.isConnecting
                ? statusMessage || "Connecting to chat service..."
                : !connectionState.isConnected
                ? "Connecting to chat service..."
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
            pt: 2
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
            currentTaskUpdate={taskUpdateForDisplay}
            currentLogUpdate={currentLogUpdate}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default StandaloneChat;
