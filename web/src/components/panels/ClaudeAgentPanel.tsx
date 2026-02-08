/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  FormControl,
  Select,
  MenuItem,
  Tooltip
} from "@mui/material";
import ChatView from "../chat/containers/ChatView";
import useClaudeAgentStore from "../../stores/ClaudeAgentStore";
import type { Message, WorkspaceResponse } from "../../stores/ApiTypes";
import PanelHeadline from "../ui/PanelHeadline";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";

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
  },
  ".claude-session-controls": {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, 1fr) auto",
    gap: "8px",
    alignItems: "center",
    marginBottom: "8px"
  },
  ".claude-session-select .MuiSelect-select": {
    paddingTop: "10px",
    paddingBottom: "10px"
  },
  "@media (max-width: 980px)": {
    ".claude-session-controls": {
      gridTemplateColumns: "1fr"
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

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces/", {
    params: { query: { limit: 100 } }
  });
  if (error) {
    throw createErrorMessage(error, "Failed to load workspaces");
  }
  return data.workspaces;
};

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
      createSession,
      startNewSession,
      resumeSession,
      sessionHistory,
      sessionId,
      workspaceId,
      workspacePath,
      setWorkspaceContext
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
        createSession: state.createSession,
        startNewSession: state.startNewSession,
        resumeSession: state.resumeSession,
        sessionHistory: state.sessionHistory,
        sessionId: state.sessionId,
        workspaceId: state.workspaceId,
        workspacePath: state.workspacePath,
        setWorkspaceContext: state.setWorkspaceContext
      }),
      []
    )
  );
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces
  });
  const hasRunningSession = Boolean(sessionId);

  useEffect(() => {
    if (!workspaces || workspaceId) {
      return;
    }
    const defaultWorkspace =
      workspaces.find((workspace) => workspace.is_default) ?? workspaces[0];
    if (defaultWorkspace) {
      setWorkspaceContext(defaultWorkspace.id, defaultWorkspace.path);
    }
  }, [workspaces, workspaceId, setWorkspaceContext]);

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

  const handleCreateNewSession = useCallback(() => {
    startNewSession().catch((err) => {
      console.error("Failed to create new Claude Agent session:", err);
    });
  }, [startNewSession]);

  const handleWorkspaceChange = useCallback(
    (selectedWorkspaceId: string | undefined) => {
      const selectedWorkspace = workspaces?.find(
        (workspace) => workspace.id === selectedWorkspaceId
      );
      setWorkspaceContext(
        selectedWorkspace?.id ?? null,
        selectedWorkspace?.path ?? null
      );
    },
    [workspaces, setWorkspaceContext]
  );

  const handleResumeSession = useCallback(
    async (targetSessionId: string) => {
      if (!targetSessionId) {
        return;
      }
      await resumeSession(targetSessionId);
    },
    [resumeSession]
  );

  // Map store status to ChatView status
  const chatStatus = useMemo(() => {
    switch (status) {
      case "disconnected":
        return "disconnected" as const;
      case "connecting":
        return "connecting" as const;
      case "connected":
        return "connected" as const;
      case "loading":
        return "loading" as const;
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
        {status === "disconnected" && !hasRunningSession && (
          <Button
            variant="outlined"
            size="small"
            onClick={handleStartSession}
            disabled={!workspacePath}
          >
            Start Session
          </Button>
        )}
      </Box>
    );
  }, [isAvailable, error, status, handleStartSession, hasRunningSession, workspacePath]);

  const previousSessions = useMemo(
    () => sessionHistory.filter((entry) => entry.id !== sessionId),
    [sessionHistory, sessionId]
  );

  return (
    <Box css={containerStyles} className="claude-agent-panel">
      <PanelHeadline title="Claude Agent" />
      <Box className="claude-session-controls">
        <WorkspaceSelect
          value={workspaceId ?? undefined}
          onChange={handleWorkspaceChange}
          disabled={hasRunningSession}
        />
        <FormControl size="small" className="claude-session-select">
          <Select
            value=""
            displayEmpty
            onChange={(event) => {
              const nextSessionId = event.target.value;
              if (typeof nextSessionId === "string") {
                handleResumeSession(nextSessionId).catch((err) => {
                  console.error("Failed to resume Claude Agent session:", err);
                });
              }
            }}
            renderValue={() => "Resume previous session"}
            disabled={!isAvailable || previousSessions.length === 0}
          >
            {previousSessions.map((entry) => (
              <MenuItem key={entry.id} value={entry.id}>
                {entry.id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Create a new Claude session in this workspace">
          <span>
            <Button
              variant="outlined"
              size="small"
              onClick={handleCreateNewSession}
              disabled={!isAvailable || !workspacePath}
            >
              New Session
            </Button>
          </span>
        </Tooltip>
      </Box>
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
