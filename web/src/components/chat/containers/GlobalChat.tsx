/** @jsxImportSource @emotion/react */
import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  memo
} from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  AlertBanner,
  Text,
  FlexRow,
  FlexColumn,
  EditorButton,
  MobileBottomSheet,
  ScrollArea,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx,
  Z_INDEX
} from "../../ui_primitives";
import ForumIcon from "@mui/icons-material/Forum";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useTheme } from "@mui/material/styles";
import ThreadList from "../thread/ThreadList";
import { useParams, useNavigate } from "react-router-dom";
import ChatView from "./ChatView";
import ChatErrorBanner from "./ChatErrorBanner";
import WelcomePlaceholder from "./WelcomePlaceholder";
import useGlobalChatStore, {
  useThreadsQuery
} from "../../../stores/GlobalChatStore";
import type { ThreadInfo } from "../types/thread.types";
import type { Message, MessageTextContent } from "../../../stores/ApiTypes";
import { usePanelStore } from "../../../stores/PanelStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { ChatSidebar, SIDEBAR_WIDTH } from "../sidebar/ChatSidebar";
import { useShallow } from "zustand/react/shallow";

// The connection-error banner floats above the whole chat surface (sidebar,
// back-to-editor button, mobile controls), so it sits above the Z_INDEX scale.
const ERROR_BANNER_Z_INDEX = 1001;

const GlobalChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
  const navigate = useNavigate();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const {
    status,
    progress,
    statusMessage,
    error,
    currentLogUpdate
  } = useGlobalChatStore(
    useShallow((state) => ({
      status: state.status,
      progress: state.progress,
      statusMessage: state.statusMessage,
      error: state.error,
      currentLogUpdate: state.currentLogUpdate
    }))
  );
  const memoryEnabled = useGlobalChatStore((state) => state.memoryEnabled);
  const setMemoryEnabled = useGlobalChatStore(
    (state) => state.setMemoryEnabled
  );

  const {
    currentThreadId,
    threads,
    threadsLoaded,
    messageCache,
    getCurrentMessagesSync
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentThreadId: state.currentThreadId,
      threads: state.threads,
      threadsLoaded: state.threadsLoaded,
      messageCache: state.messageCache,
      getCurrentMessagesSync: state.getCurrentMessagesSync
    }))
  );

  const {
    sendMessage,
    createNewThread,
    switchThread,
    fetchThread,
    stopGeneration,
    deleteThread,
    connect,
    disconnect
  } = useGlobalChatStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      createNewThread: state.createNewThread,
      switchThread: state.switchThread,
      fetchThread: state.fetchThread,
      stopGeneration: state.stopGeneration,
      deleteThread: state.deleteThread,
      connect: state.connect,
      disconnect: state.disconnect
    }))
  );

  const {
    currentPlanningUpdate,
    currentTaskUpdate,
    currentTaskUpdateThreadId,
    lastTaskUpdatesByThread,
    workflowId
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentPlanningUpdate: state.currentPlanningUpdate,
      currentTaskUpdate: state.currentTaskUpdate,
      currentTaskUpdateThreadId: state.currentTaskUpdateThreadId,
      lastTaskUpdatesByThread: state.lastTaskUpdatesByThread,
      workflowId: state.workflowId
    }))
  );

  const [_connectionState, setConnectionState] = useState(
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

  useEffect(() => {
    connect().catch((err) => {
      console.error("Failed to connect GlobalChatStore:", err);
    });

    return () => {
      try {
        disconnect();
      } catch (err) {
        console.error("Error during GlobalChatStore disconnect:", err);
      }
    };
  }, [connect, disconnect]);

  const {
    currentRunningToolCallId: runningToolCallId,
    currentToolMessage: runningToolMessage,
    selectedModel,
    setSelectedModel
  } = useGlobalChatStore(
    useShallow((state) => ({
      currentRunningToolCallId: state.currentRunningToolCallId,
      currentToolMessage: state.currentToolMessage,
      selectedModel: state.selectedModel,
      setSelectedModel: state.setSelectedModel
    }))
  );

  const { isLoading: isLoadingThreads, error: threadsError } =
    useThreadsQuery();
  const theme = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileConversationsOpen, setMobileConversationsOpen] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);

  useEffect(() => {
    setAlertDismissed(false);
  }, [status, error]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const leftPanelVisible = usePanelStore((s) => s.panel.isVisible);
  const leftPanelSize = usePanelStore((s) => s.panel.panelSize);
  const leftPanelMinWidth = usePanelStore((s) => s.panel.minWidth);

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

  useEffect(() => {
    const handleThreadLogic = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
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

        if (!threadsLoaded || isLoadingThreads) {
          return;
        }

        if (!currentThreadId) {
          const newThreadId = await createNewThread();
          if (!abortController.signal.aborted) {
            switchThread(newThreadId);
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to handle thread logic:", error);
        }
      }
    };

    handleThreadLogic();

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

  // Keep the thread pinned to the bottom when the mobile virtual keyboard
  // resizes the visual viewport.
  useEffect(() => {
    if (!isMobile) { return; }

    let viewportTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleViewportChange = () => {
      if (viewportTimeoutId !== null) { clearTimeout(viewportTimeoutId); }
      viewportTimeoutId = setTimeout(() => {
        if (chatContainerRef.current) {
          const chatArea = chatContainerRef.current.querySelector(
            ".chat-thread-container"
          );
          if (chatArea) {
            const wasAtBottom =
              chatArea.scrollTop + chatArea.clientHeight >=
              chatArea.scrollHeight - 100;
            if (wasAtBottom) {
              chatArea.scrollTop = chatArea.scrollHeight;
            }
          }
        }
      }, 150);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener(
        "resize",
        handleViewportChange
      );
      return () => {
        vv.removeEventListener(
          "resize",
          handleViewportChange
        );
        if (viewportTimeoutId !== null) { clearTimeout(viewportTimeoutId); }
      };
    }
  }, [isMobile]);

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
      setMobileConversationsOpen(false);
    },
    [switchThread, navigate]
  );

  const handleMobileNewChat = useCallback(async () => {
    await handleNewChat();
    setMobileConversationsOpen(false);
  }, [handleNewChat]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      sendMessage({
        type: "message",
        name: "",
        role: "user",
        provider: selectedModel?.provider,
        model: selectedModel?.id,
        content: [{ type: "text", text: suggestion }]
      }).catch((err) => {
        console.error("Failed to send suggestion:", err);
      });
    },
    [sendMessage, selectedModel]
  );

  const welcomePlaceholder = useMemo(
    () => <WelcomePlaceholder onSuggestionClick={handleSuggestionClick} />,
    [handleSuggestionClick]
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id).catch((error) => {
        console.error("Failed to delete thread:", error);
        addNotification({
          type: "error",
          content: "Could not delete the conversation. Please try again."
        });
      });
    },
    [deleteThread, addNotification]
  );

  const getThreadPreview = useCallback(
    (threadId: string) => {
      if (!threads) {
        return "New conversation";
      }
      const thread = threads[threadId];
      if (!thread) {
        return "Empty conversation";
      }

      if (thread.title) {
        return thread.title;
      }

      const threadMessages = messageCache[threadId];
      if (!threadMessages || threadMessages.length === 0) {
        return "New conversation";
      }

      const firstUserMessage = threadMessages.find(
        (msg: Message) => msg.role === "user"
      );
      if (firstUserMessage) {
        const content =
          typeof firstUserMessage.content === "string"
            ? firstUserMessage.content
            : Array.isArray(firstUserMessage.content) &&
              firstUserMessage.content[0]?.type === "text"
              ? (firstUserMessage.content[0] as MessageTextContent).text
              : "[Media message]";
        return content?.substring(0, 50) + (content?.length > 50 ? "..." : "");
      }

      return "New conversation";
    },
    [threads, messageCache]
  );

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

  if (isLoadingThreads) {
    return (
      <FlexRow
        align="center"
        justify="center"
        sx={{ height: "100vh" }}
      >
        <Text>Loading chat…</Text>
      </FlexRow>
    );
  }

  if (threadsError) {
    return (
      <FlexRow
        align="center"
        justify="center"
        sx={{ height: "100vh" }}
      >
        <AlertBanner severity="error">
          Failed to load threads: {threadsError.message}
        </AlertBanner>
      </FlexRow>
    );
  }

  return (
    <FlexColumn
      ref={chatContainerRef}
      className="global-chat-container"
      fullWidth
      sx={{
        flex: 1,
        minWidth: 0,
        height: "100dvh",
        maxHeight: "100dvh",
        maxWidth: "100vw",
        // No top padding needed since header is external now
        // Add horizontal padding on desktop to avoid side panes
        paddingLeft: isMobile
          ? 0
          : leftPanelVisible
            ? `${leftPanelSize}px`
            : `${leftPanelMinWidth}px`,
        paddingRight: 0,
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
        background: `radial-gradient(circle at top, rgb(${theme.vars.palette.primary.mainChannel} / 0.08), transparent 32%), ${theme.vars.palette.background.default}`
        // Mobile styles handled via separate CSS file
      }}
    >
      <EditorButton
        className="back-to-editor"
        variant="text"
        onClick={() => navigate("/workspace")}
        startIcon={<ArrowBackIcon sx={{ fontSize: "var(--fontSizeBig)" }} />}
        sx={{
          position: "absolute",
          top: 28,
          right: 16,
          zIndex: Z_INDEX.modal,
          whiteSpace: "nowrap",
          fontSize: "var(--fontSizeNormal)"
        }}
      >
        Back to editor
      </EditorButton>
      <FlexColumn
        sx={{ height: "100%", maxHeight: "100%" }}
      >
        {!alertDismissed && error && (
          <ChatErrorBanner
            className="global-chat-status-alert"
            error={error}
            onClose={() => setAlertDismissed(true)}
            onRetry={() => {
              setAlertDismissed(true);
              connect().catch((err) => {
                console.error("Retry connection failed:", err);
              });
            }}
            retryLabel="Retry"
            sx={{
              position: "absolute",
              top: "5rem",
              left: "50%",
              transform: "translateX(-50%)",
              maxWidth: "600px",
              width: "100%",
              zIndex: ERROR_BANNER_Z_INDEX,
              flexShrink: 0
            }}
          />
        )}

        <FlexRow
          className="chat-container"
          sx={{
            position: "relative",
            height: "100%",
            minHeight: 0,
            flex: 1,
            overflow: "hidden",
            maxHeight: "100%",
            px: isMobile ? 0 : 1.5,
            pb: isMobile ? 0 : 1.5
          }}
        >
          {/* Chat Sidebar - desktop: inline panel, mobile: bottom sheet */}
          {!isMobile ? (
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
          ) : (
            <>
              <ToolbarIconButton
                onClick={() => setMobileConversationsOpen(true)}
                title="Open conversations"
                tabIndex={-1}
                sx={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: Z_INDEX.overlay,
                  backgroundColor: `rgb(${theme.vars.palette.background.paperChannel} / 0.9)`,
                  backdropFilter: "blur(14px)",
                  border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`,
                  boxShadow: "0 10px 24px rgb(0 0 0 / 0.18)",
                  borderRadius: BORDER_RADIUS.md,
                  padding: getSpacingPx(SPACING.md),
                  "&:hover": {
                    backgroundColor: `rgb(${theme.vars.palette.background.paperChannel} / 0.98)`
                  }
                }}
              >
                <ForumIcon />
              </ToolbarIconButton>
              <MobileBottomSheet
                open={mobileConversationsOpen}
                onClose={() => setMobileConversationsOpen(false)}
                title="Conversations"
                ariaLabel="Conversations"
                headerExtras={
                  <FlexRow align="center" sx={{ px: 1.5 }}>
                    <ToolbarIconButton
                      onClick={handleMobileNewChat}
                      title="New chat"
                      size="small"
                      tabIndex={-1}
                      sx={{
                        borderRadius: BORDER_RADIUS.sm,
                        backgroundColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.12)`,
                        color: "primary.main",
                        "&:hover": {
                          backgroundColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.18)`
                        }
                      }}
                    >
                      <AddIcon />
                    </ToolbarIconButton>
                  </FlexRow>
                }
              >
                <ScrollArea fullHeight sx={{ maxHeight: "60vh" }}>
                  <ThreadList
                    threads={threadsWithMessages}
                    currentThreadId={currentThreadId}
                    onNewThread={handleMobileNewChat}
                    onSelectThread={handleSelectThread}
                    onDeleteThread={handleDeleteThread}
                    getThreadPreview={getThreadPreview}
                  />
                </ScrollArea>
              </MobileBottomSheet>
            </>
          )}

          {/* Chat View - full width on mobile */}
          <FlexColumn
            fullHeight
            sx={{
              flex: 1,
              marginLeft: !isMobile && sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0,
              transition: `margin-left ${MOTION.slow}`,
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              maxHeight: "100%"
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
              onModelChange={setSelectedModel}
              onStop={stopGeneration}
              onNewChat={handleNewChat}
              memoryEnabled={memoryEnabled}
              onMemoryToggle={setMemoryEnabled}
              currentPlanningUpdate={currentPlanningUpdate}
              currentTaskUpdate={taskUpdateForDisplay}
              currentLogUpdate={currentLogUpdate}
              workflowId={workflowId}
              noMessagesPlaceholder={welcomePlaceholder}
              useExternalComposer
              showConversationHeader
            />
          </FlexColumn>
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(GlobalChat);
