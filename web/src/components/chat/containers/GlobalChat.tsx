/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Box, Alert, IconButton, Typography } from "@mui/material";
import Drawer from "@mui/material/Drawer";
import MenuIcon from "@mui/icons-material/Menu";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useParams } from "react-router-dom";
import ChatView from "./ChatView";
import BackToEditorButton from "../../panels/BackToEditorButton";
import BackToDashboardButton from "../../panels/BackToDashboardButton";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { Message } from "../../../stores/ApiTypes";
import { DEFAULT_MODEL } from "../../../config/constants";
import { isEqual } from "lodash";

const GlobalChat: React.FC = () => {
  const { thread_id } = useParams<{ thread_id?: string }>();
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
    stopGeneration,
    agentMode,
    setAgentMode,
    currentPlanningUpdate,
    currentTaskUpdate
  } = useGlobalChatStore();

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const savedModel = localStorage.getItem("selectedModel");
    return savedModel || DEFAULT_MODEL;
  });
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [helpMode, setHelpMode] = useState<boolean>(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const messages = getCurrentMessages();

  // Handle connection lifecycle and thread switching
  useEffect(() => {
    // Switch to thread from URL if provided
    if (thread_id && thread_id !== currentThreadId) {
      switchThread(thread_id);
    } else if (!currentThreadId && !thread_id) {
      // Create new thread if none exists
      createNewThread();
    }

    // Connect on mount if not already connected
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to global chat:", error);
      });
    }

    return () => {
      // Disconnect on unmount
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread_id]); // Depend on thread_id to handle URL changes

  // Monitor connection state and reconnect when disconnected or failed
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const attemptReconnect = () => {
      if (status === "disconnected" || status === "failed") {
        console.log("Connection lost, attempting automatic reconnect...");
        connect().catch((error) => {
          console.error("Automatic reconnect failed:", error);
        });
      }
    };

    // Check connection state periodically
    if (status === "disconnected" || status === "failed") {
      // Initial reconnect attempt after 2 seconds
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [status, connect]);

  // Close the drawer automatically when switching to desktop view
  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  // Save selectedModel to localStorage
  useEffect(() => {
    localStorage.setItem("selectedModel", selectedModel);
  }, [selectedModel]);

  const handleSendMessage = useCallback(
    async (message: Message) => {
      if (!selectedModel) {
        console.error("No model selected");
        return;
      }

      if (status !== "connected" && status !== "reconnecting") {
        console.error(
          "Not connected to chat service, attempting to reconnect..."
        );
        // Attempt to reconnect before sending
        try {
          await connect();
        } catch (error) {
          console.error("Failed to reconnect:", error);
          return;
        }
      }

      try {
        // Update the message with the selected model - prefix with "help:" if help mode is enabled
        const modelToUse = helpMode ? `help:${selectedModel}` : selectedModel;
        const messageWithModel = {
          ...message,
          model: modelToUse,
          collections:
            selectedCollections.length > 0 ? selectedCollections : undefined
        };
        await sendMessage(messageWithModel);
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    },
    [selectedModel, sendMessage, status, helpMode, selectedCollections, connect]
  );

  const handleToolsChange = useCallback((tools: string[]) => {
    setSelectedTools((prev) => (isEqual(prev, tools) ? prev : tools));
  }, []);

  const mainAreaStyles = (theme: any) =>
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
        maxHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        marginLeft: "5rem",
        marginRight: "5rem",
        paddingLeft: "5rem",
        paddingRight: "5rem",
        overflow: "hidden"
      }}
    >
      {/* Main Chat Area */}
      <Box css={mainAreaStyles} sx={{ height: "100%", maxHeight: "100%" }}>
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
            status={status}
            messages={messages}
            sendMessage={handleSendMessage}
            progress={progress.current}
            total={progress.total}
            progressMessage={statusMessage}
            model={selectedModel}
            selectedTools={selectedTools}
            onToolsChange={handleToolsChange}
            selectedCollections={selectedCollections}
            onCollectionsChange={setSelectedCollections}
            onModelChange={(modelId) => setSelectedModel(modelId)}
            onStop={stopGeneration}
            agentMode={agentMode}
            onAgentModeToggle={setAgentMode}
            helpMode={helpMode}
            onHelpModeToggle={setHelpMode}
            currentPlanningUpdate={currentPlanningUpdate}
            currentTaskUpdate={currentTaskUpdate}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default GlobalChat;
