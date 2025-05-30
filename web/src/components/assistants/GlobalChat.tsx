/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useCallback, useRef } from "react";
import "../../styles/microtip.css";
import {
  Box,
  Alert,
  IconButton,
  Typography,
  Tooltip,
  Button
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ChatView from "./ChatView";
import BackToEditorButton from "../panels/BackToEditorButton";
import BackToDashboardButton from "../dashboard/BackToDashboardButton";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { Message } from "../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../config/constants";
import { relativeTime } from "../../utils/formatDateAndTime";

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
  }, [createNewThread]);

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
    (e: React.MouseEvent, threadId: string) => {
      e.stopPropagation();
      deleteThread(threadId);
    },
    [deleteThread]
  );

  const sidebarStyles = (theme: any) =>
    css({
      width: "260px",
      height: "100%",
      borderRight: `1px solid ${theme.palette.c_gray2}`,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.palette.c_gray0,

      ".new-chat-section": {
        padding: theme.spacing(2),
        borderBottom: `1px solid ${theme.palette.c_gray2}`
      },

      ".new-chat-button": {
        width: "100%",
        padding: "0.5em 1em",
        borderRadius: "8px",
        backgroundColor: "var(--c_gray1)",
        color: theme.palette.c_white,
        textTransform: "none",
        justifyContent: "flex-start",
        transition: "background 0.2s",
        "&:hover": {
          backgroundColor: theme.palette.c_gray3
        }
      },

      ".thread-list": {
        flex: 1,
        overflow: "auto",
        padding: 0,
        margin: 0,
        listStyle: "none"
      },

      ".thread-item": {
        position: "relative",
        padding: "0.75em 1em",
        borderLeft: `2px solid transparent`,
        cursor: "pointer",
        transition: "all 0.2s",

        "&:hover": {
          backgroundColor: theme.palette.c_gray2,
          ".delete-button": {
            opacity: 1
          }
        },

        "&.selected": {
          backgroundColor: theme.palette.c_gray1,
          borderLeft: `2px solid ${theme.palette.c_hl1}`
        }
      },

      ".thread-title": {
        fontSize: theme.fontSizeSmall,
        fontWeight: "normal",
        color: theme.palette.c_white,
        marginBottom: "0.25em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        paddingRight: "30px"
      },

      ".date": {
        fontSize: theme.fontSizeSmaller,
        color: theme.palette.c_gray5,
        transition: "opacity 0.2s"
      },

      ".delete-button": {
        position: "absolute",
        right: "0.5em",
        top: "50%",
        transform: "translateY(-50%)",
        opacity: 0,
        padding: "4px",
        minWidth: "unset",
        color: theme.palette.c_gray5,
        transition: "opacity 0.2s",

        "&:hover": {
          color: theme.palette.c_error,
          backgroundColor: theme.palette.c_gray3
        },

        svg: {
          fontSize: "1.2em"
        }
      }
    });

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
        overflow: "hidden",
        padding: theme.spacing(2)
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
        display: "flex"
      }}
    >
      {/* Thread List Sidebar */}
      <Box css={sidebarStyles}>
        <Box className="new-chat-section">
          <Tooltip title="New Chat">
            <Button
              className="new-chat-button"
              onClick={handleNewChat}
              startIcon={<AddIcon />}
            >
              New Chat
            </Button>
          </Tooltip>
        </Box>

        <ul className="thread-list">
          {!threads || Object.keys(threads).length === 0 ? (
            <li
              style={{
                padding: "2em",
                textAlign: "center",
                color: "#666",
                fontSize: "0.9em"
              }}
            >
              No conversations yet. Click &ldquo;New Chat&rdquo; to start.
            </li>
          ) : (
            Object.entries(threads)
              .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
              .map(([threadId, thread]) => (
                <li
                  key={threadId}
                  className={`thread-item ${
                    threadId === currentThreadId ? "selected" : ""
                  }`}
                  onClick={() => switchThread(threadId)}
                >
                  <Typography className="thread-title">
                    {thread.title || getThreadPreview(threadId)}
                  </Typography>
                  <Typography className="date">
                    {relativeTime(thread.updatedAt)}
                  </Typography>
                  <IconButton
                    className="delete-button"
                    size="small"
                    onClick={(e) => handleDeleteThread(e, threadId)}
                    data-microtip-position="left"
                    aria-label="Delete conversation"
                    role="tooltip"
                  >
                    <DeleteIcon />
                  </IconButton>
                </li>
              ))
          )}
        </ul>
      </Box>

      {/* Main Chat Area */}
      <Box css={mainAreaStyles}>
        <Box className="chat-header">
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
