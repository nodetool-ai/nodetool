/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  memo
} from "react";
import { Box, Alert, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useParams, useNavigate } from "react-router-dom";
import ChatView from "./ChatView";
import useGlobalChatStore, {
  useThreadsQuery
} from "../../../stores/GlobalChatStore";
import type { ThreadInfo } from "../types/thread.types";
import { usePanelStore } from "../../../stores/PanelStore";
import { useRightPanelStore } from "../../../stores/RightPanelStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { ChatSidebar, SIDEBAR_WIDTH } from "../sidebar/ChatSidebar";

const GlobalChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
  const navigate = useNavigate();
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
  const workflowId = useGlobalChatStore((s) => s.workflowId);
  const deleteThread = useGlobalChatStore((s) => s.deleteThread);
  const messageCache = useGlobalChatStore((s) => s.messageCache);

  // Get connection state from WebSocket manager directly
  const [connectionState, setConnectionState] = useState(
    globalWebSocketManager.getConnectionState()
  );

  useEffect(() => {
    const unsubscribe = globalWebSocketManager.subscribeEvent(
      "stateChange",
      (_state: string) => {
        setConnectionState(globalWebSocketManager.getConnectionState());
      }
    );
    return unsubscribe;
  }, []);

  // Proactively establish WebSocket connection on mount
  useEffect(() => {
    globalWebSocketManager.ensureConnection().catch((err) => {
      console.error("Failed to establish WebSocket connection:", err);
    });
  }, []);

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
  const [sidebarOpen, setSidebarOpen] = useState(true); // Sidebar open by default
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Reset dismissed state when status or error changes
  useEffect(() => {
    setAlertDismissed(false);
  }, [status, error]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Side panel states (for desktop spacing)
  const leftPanel = usePanelStore((s) => s.panel);
  const rightPanel = useRightPanelStore((s) => s.panel);

  // Get messages from store
  const messages = getCurrentMessagesSync();
  const taskUpdateForDisplay = useMemo(() => {
    if (!currentThreadId) { return null; }
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

  // Remove extra reconnect loop; rely on WebSocketManager's exponential backoff and
  // the store's network/visibility listeners to reconnect. This avoids double reconnects.

  // Handle mobile keyboard behavior and maintain scroll position
  useEffect(() => {
    if (!isMobile) { return; }

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
    if (status === "stopping") { return "loading"; }
    return status;
  };

  const handleNewChat = useCallback(async () => {
    try {
      const newThreadId = await createNewThread();
      switchThread(newThreadId);
      navigate(`/chat/${newThreadId}`);
    } catch (error) {
      console.error("Failed to create new thread:", error);
    }
  }, [createNewThread, switchThread, navigate]);

  const handleSelectThread = useCallback(
    (id: string) => {
      switchThread(id);
      navigate(`/chat/${id}`);
    },
    [switchThread, navigate]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((error) => {
        console.error("Failed to delete thread:", error);
      });
    },
    [deleteThread]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) {
        return "Loading...";
      }
      const thread = threads[threadId];
      if (!thread) {
        return "Empty conversation";
      }

      // Use thread title if available
      if (thread.title) {
        return thread.title;
      }

      // Check if we have cached messages for this thread
      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find(
        (msg: any) => msg.role === "user"
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
    [threads, messageCache]
  );

  // Create ThreadInfo-compatible data for ThreadList
  const threadsWithMessages: Record<string, ThreadInfo> = useMemo(() => {
    if (!threads) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(threads).map(([id, thread]) => [
        id,
        {
          id: thread.id,
          title: thread.title ?? undefined,
          updatedAt: thread.updated_at,
          messages: messageCache[id] || []
        }
      ])
    );
  }, [threads, messageCache]);

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
        flexDirection: "row",  // Changed from column to row for sidebar layout
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
        boxSizing: "border-box",
        background: theme.vars.palette.c_editor_bg_color
        // Mobile styles handled via separate CSS file
      }}
    >
      {/* Main Chat Area */}
      <Box
        css={mainAreaStyles(theme)}
        sx={{ height: "100%", maxHeight: "100%" }}
      >
        {!alertDismissed &&
          (error || !connectionState.isConnected) && (
            <Alert
              className="global-chat-status-alert"
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
                top: "5rem",
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

        <Box
          className="chat-container"
          sx={{
            position: "relative",
            height: "100%",
            marginTop: "50px", // Offset for AppHeader
            minHeight: 0,
            flex: 1,
            display: "flex",
            flexDirection: "row",
            overflow: "hidden"
          }}
        >
          {/* Chat Sidebar */}
          <ChatSidebar
            threads={threadsWithMessages}
            currentThreadId={currentThreadId}
            onNewChat={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
            isOpen={sidebarOpen}
            onOpenChange={setSidebarOpen}
          />

          {/* Chat View - adjusts based on sidebar state */}
          <Box
            sx={{
              flex: 1,
              height: "100%",
              marginLeft: sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0,
              transition: "margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden"
            }}
          >
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
              workflowId={workflowId}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default memo(GlobalChat);
