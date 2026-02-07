/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo } from "react";
import { Box, Typography, Button } from "@mui/material";
import ChatView from "../chat/containers/ChatView";
import useClaudeAgentStore from "../../stores/ClaudeAgentStore";
import type { Message } from "../../stores/ApiTypes";
import PanelHeadline from "../ui/PanelHeadline";

const containerStyles = css({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  padding: "0 1em",
  ".chat-view": {
    height: "calc(100% - 45px)"
  },
  ".chat-thread-view": {
    paddingBottom: "4em"
  },
  ".chat-input-section": {
    backgroundColor: "transparent"
  },
  ".chat-controls": {
    flexDirection: "column",
    gap: "0",
    alignItems: "center"
  },
  ".chat-composer-wrapper": {
    width: "100%",
    ".compose-message": {
      margin: "0 .5em 0 0"
    }
  }
});

const placeholderStyles = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  gap: "16px",
  padding: "24px",
  textAlign: "center"
});

/**
 * ClaudeAgentPanel provides a chat interface for interacting with the
 * Claude Agent SDK. It uses the existing ChatView component and adapts
 * the Claude SDK message format to the NodeTool Message type.
 *
 * The Claude Agent SDK runs in the Electron main process and communicates
 * with this panel via IPC. When not running in Electron, the panel displays
 * a message indicating the feature requires the desktop app.
 */
const ClaudeAgentPanel: React.FC = () => {
  const {
    status,
    messages,
    error,
    isAvailable,
    sendMessage,
    stopGeneration,
    newChat,
    createSession
  } = useClaudeAgentStore(
    useMemo(
      () => (state) => ({
        status: state.status,
        messages: state.messages,
        error: state.error,
        isAvailable: state.isAvailable,
        sendMessage: state.sendMessage,
        stopGeneration: state.stopGeneration,
        newChat: state.newChat,
        createSession: state.createSession
      }),
      []
    )
  );

  const handleSendMessage = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  const handleNewChat = useCallback(() => {
    newChat();
  }, [newChat]);

  const handleStop = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  const handleStartSession = useCallback(() => {
    createSession().catch((err) => {
      console.error("Failed to create Claude Agent session:", err);
    });
  }, [createSession]);

  // Map store status to ChatView status
  const chatStatus = useMemo(() => {
    switch (status) {
      case "disconnected":
        return "disconnected" as const;
      case "connecting":
        return "connecting" as const;
      case "connected":
        return "connected" as const;
      case "streaming":
        return "streaming" as const;
      case "error":
        return "error" as const;
      default:
        return "disconnected" as const;
    }
  }, [status]);

  const noMessagesPlaceholder = useMemo(() => {
    if (!isAvailable) {
      return (
        <Box css={placeholderStyles}>
          <Typography variant="h6" color="text.secondary">
            Claude Agent SDK
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This feature requires the NodeTool desktop app (Electron) to
            interact with the Claude Agent SDK.
          </Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Box css={placeholderStyles}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
          <Button variant="outlined" size="small" onClick={handleStartSession}>
            Retry
          </Button>
        </Box>
      );
    }

    return (
      <Box css={placeholderStyles}>
        <Typography variant="h6" color="text.secondary">
          Claude Agent
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Start a conversation with the Claude Agent SDK. Messages are processed
          through a local Claude Code session.
        </Typography>
        {status === "disconnected" && (
          <Button
            variant="outlined"
            size="small"
            onClick={handleStartSession}
          >
            Start Session
          </Button>
        )}
      </Box>
    );
  }, [isAvailable, error, status, handleStartSession]);

  return (
    <Box css={containerStyles} className="claude-agent-panel">
      <PanelHeadline title="Claude Agent" />
      <ChatView
        status={chatStatus}
        progress={0}
        total={0}
        messages={messages}
        sendMessage={handleSendMessage}
        progressMessage={null}
        showToolbar={false}
        onStop={handleStop}
        onNewChat={handleNewChat}
        noMessagesPlaceholder={noMessagesPlaceholder}
      />
    </Box>
  );
};

export default memo(ClaudeAgentPanel);
