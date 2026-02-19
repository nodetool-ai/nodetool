/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, memo, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Button,
  FormControl,
  Select,
  MenuItem,
  Menu,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputLabel,
  CircularProgress
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import AddIcon from "@mui/icons-material/Add";
import ReplayIcon from "@mui/icons-material/Replay";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import DesktopWindowsOutlinedIcon from "@mui/icons-material/DesktopWindowsOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ChatView from "../chat/containers/ChatView";
import useAgentStore from "../../stores/AgentStore";
import type { Message, WorkspaceResponse } from "../../stores/ApiTypes";
import type { AgentProvider, AgentModelDescriptor } from "../../stores/AgentStore";
import PanelHeadline from "../ui/PanelHeadline";

import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";

const containerStyles = (_theme: Theme) =>
  css({
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

const dialogFieldStyles = css({
  marginTop: "8px",
  marginBottom: "12px"
});

const placeholderStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: "12px",
    padding: "32px 24px",
    textAlign: "center",

    ".placeholder-icon": {
      width: "56px",
      height: "56px",
      borderRadius: "16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        theme.palette.mode === "dark"
          ? `linear-gradient(135deg, ${theme.vars.palette.primary.dark}44, ${theme.vars.palette.secondary.dark}33)`
          : `linear-gradient(135deg, ${theme.vars.palette.primary.light}33, ${theme.vars.palette.secondary.light}22)`,
      border: `1px solid ${theme.vars.palette.divider}`,
      marginBottom: "4px",
      "& svg": {
        fontSize: "28px",
        color: theme.vars.palette.primary.light,
        opacity: 0.9
      }
    },

    ".placeholder-title": {
      fontSize: "1rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      letterSpacing: "0.02em",
      margin: 0
    },

    ".placeholder-description": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      maxWidth: "320px",
      lineHeight: 1.5,
      margin: 0
    },

    ".placeholder-error": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.error.main,
      backgroundColor: `${theme.vars.palette.error.main}11`,
      border: `1px solid ${theme.vars.palette.error.main}33`,
      borderRadius: "8px",
      padding: "8px 14px",
      maxWidth: "360px"
    },

    ".placeholder-action": {
      marginTop: "8px"
    }
  });

const startButtonStyles = (theme: Theme) =>
  css({
    borderRadius: "10px",
    padding: "8px 20px",
    fontWeight: 500,
    fontSize: theme.fontSizeSmall,
    letterSpacing: "0.02em",
    textTransform: "none",
    gap: "6px",
    border: `1px solid ${theme.vars.palette.primary.main}`,
    color: theme.vars.palette.primary.main,
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: `${theme.vars.palette.primary.main}14`,
      borderColor: theme.vars.palette.primary.light,
      transform: "translateY(-1px)",
      boxShadow: `0 4px 12px ${theme.vars.palette.primary.main}22`
    },
    "&:active": {
      transform: "translateY(0)"
    },
    "&.Mui-disabled": {
      borderColor: theme.vars.palette.divider,
      color: theme.vars.palette.text.disabled
    }
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
 * AgentPanel provides a chat interface for interacting with the
 * Agent. It uses the existing ChatView component and adapts
 * the Agent message format to the NodeTool Message type.
 *
 * The Agent runs in the Electron main process and communicates
 * with this panel via IPC. When not running in Electron, the panel displays
 * a message indicating the feature requires the desktop app.
 */
const AgentPanel: React.FC = () => {
  const theme = useTheme();
  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false);
  const [draftProvider, setDraftProvider] = useState<AgentProvider>("claude");
  const [draftWorkspaceId, setDraftWorkspaceId] = useState<string | null>(null);
  const [draftWorkspacePath, setDraftWorkspacePath] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<string>("");
  const [draftModels, setDraftModels] = useState<AgentModelDescriptor[]>([]);
  const [draftModelsLoading, setDraftModelsLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [resumeAnchorEl, setResumeAnchorEl] = useState<HTMLElement | null>(null);

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
    setWorkspaceContext,
    provider,
    setProvider,
    model,
    setModel,
  } = useAgentStore(
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
        setWorkspaceContext: state.setWorkspaceContext,
        provider: state.provider,
        setProvider: state.setProvider,
        model: state.model,
        setModel: state.setModel,
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

  useEffect(() => {
    if (!newSessionDialogOpen || !window.api?.agent || !draftWorkspacePath) {
      setDraftModels([]);
      setDraftModelsLoading(false);
      return;
    }
    let cancelled = false;
    setDraftModelsLoading(true);
    window.api.agent
      .listModels({
        provider: draftProvider,
        workspacePath: draftWorkspacePath
      })
      .then((models) => {
        if (cancelled) {
          return;
        }
        setDraftModels(models);
        const selected = models.find((entry) => entry.id === draftModel);
        const defaultModel =
          models.find((entry) => entry.isDefault) ?? models[0] ?? null;
        setDraftModel(selected ? selected.id : defaultModel?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load models:", err);
          setDraftModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDraftModelsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [newSessionDialogOpen, draftProvider, draftWorkspacePath, draftModel]);

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
    setDraftProvider(provider);
    setDraftWorkspaceId(workspaceId);
    setDraftWorkspacePath(workspacePath);
    setDraftModel(model);
    setNewSessionDialogOpen(true);
  }, [provider, workspaceId, workspacePath, model]);

  const handleCreateNewSession = useCallback(() => {
    setDraftProvider(provider);
    setDraftWorkspaceId(workspaceId);
    setDraftWorkspacePath(workspacePath);
    setDraftModel(model);
    setNewSessionDialogOpen(true);
  }, [provider, workspaceId, workspacePath, model]);

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

  const providerLabel = provider === "codex" ? "Codex" : provider === "pi" ? "Pi" : "Claude";
  const draftProviderLabel = draftProvider === "codex" ? "Codex" : draftProvider === "pi" ? "Pi" : "Claude";
  const canCreateSession =
    Boolean(draftWorkspacePath) &&
    Boolean(draftModel) &&
    !draftModelsLoading &&
    !creatingSession;

  const handleDialogWorkspaceChange = useCallback(
    (selectedWorkspaceId: string | undefined) => {
      const selectedWorkspace = workspaces?.find(
        (workspace) => workspace.id === selectedWorkspaceId
      );
      setDraftWorkspaceId(selectedWorkspace?.id ?? null);
      setDraftWorkspacePath(selectedWorkspace?.path ?? null);
    },
    [workspaces]
  );

  const handleConfirmNewSession = useCallback(async () => {
    if (!draftWorkspacePath || !draftModel) {
      return;
    }
    setCreatingSession(true);
    try {
      setProvider(draftProvider);
      setModel(draftModel);
      setWorkspaceContext(draftWorkspaceId, draftWorkspacePath);

      if (hasRunningSession) {
        await startNewSession();
      } else {
        await createSession({
          workspacePath: draftWorkspacePath,
          workspaceId: draftWorkspaceId ?? undefined
        });
      }
      setNewSessionDialogOpen(false);
    } catch (err) {
      console.error("Failed to start Agent session:", err);
    } finally {
      setCreatingSession(false);
    }
  }, [
    createSession,
    draftModel,
    draftProvider,
    draftWorkspaceId,
    draftWorkspacePath,
    hasRunningSession,
    setModel,
    setProvider,
    setWorkspaceContext,
    startNewSession
  ]);

  const noMessagesPlaceholder = useMemo(() => {
    if (!isAvailable) {
      return (
        <Box css={placeholderStyles(theme)}>
          <div className="placeholder-icon">
            <DesktopWindowsOutlinedIcon />
          </div>
          <Typography className="placeholder-title">
            AI Agent
          </Typography>
          <Typography className="placeholder-description">
            This feature requires the NodeTool desktop app (Electron) to run
            local agent sessions.
          </Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Box css={placeholderStyles(theme)}>
          <div className="placeholder-icon">
            <SmartToyOutlinedIcon />
          </div>
          <div className="placeholder-error">
            <ErrorOutlineIcon fontSize="small" />
            <span>{error}</span>
          </div>
          <div className="placeholder-action">
            <Button
              variant="outlined"
              size="small"
              onClick={handleStartSession}
              startIcon={<ReplayIcon />}
              css={startButtonStyles(theme)}
            >
              Retry
            </Button>
          </div>
        </Box>
      );
    }

    return (
      <Box css={placeholderStyles(theme)}>
        <div className="placeholder-icon">
          <SmartToyOutlinedIcon />
        </div>
        <Typography className="placeholder-title">
          {providerLabel} Agent
        </Typography>
        <Typography className="placeholder-description">
          Start a conversation with a local {providerLabel.toLowerCase()} agent
          session. The agent can execute code, browse files, and assist you with
          tasks in your workspace.
        </Typography>
        {status === "disconnected" && !hasRunningSession && (
          <div className="placeholder-action">
            <Button
              variant="outlined"
              size="small"
              onClick={handleStartSession}
              disabled={!workspacePath}
              startIcon={<PlayArrowRoundedIcon />}
              css={startButtonStyles(theme)}
            >
              Start Session
            </Button>
          </div>
        )}
      </Box>
    );
  }, [
    isAvailable,
    error,
    status,
    handleStartSession,
    hasRunningSession,
    workspacePath,
    providerLabel,
    theme
  ]);

  const previousSessions = useMemo(
    () => sessionHistory.filter((entry) => entry.id !== sessionId),
    [sessionHistory, sessionId]
  );
  const activeSessionEntry = useMemo(
    () => sessionHistory.find((entry) => entry.id === sessionId) ?? null,
    [sessionHistory, sessionId]
  );
  const activeProviderLabel = useMemo(() => {
    const resolvedProvider = activeSessionEntry?.provider ?? provider;
    return resolvedProvider === "codex" ? "Codex" : resolvedProvider === "pi" ? "Pi" : "Claude";
  }, [activeSessionEntry?.provider, provider]);
  const resumeMenuOpen = Boolean(resumeAnchorEl);

  return (
    <Box css={containerStyles(theme)} className="agent-panel">
      <PanelHeadline
        title={`${activeProviderLabel} Agent`}
        actions={
          <Box sx={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <Tooltip title="Resume a previous session">
              <span>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    setResumeAnchorEl(event.currentTarget);
                  }}
                  disabled={!isAvailable || previousSessions.length === 0}
                  aria-label="Resume session"
                  sx={{
                    borderRadius: "8px",
                    border: `1px solid ${theme.vars.palette.divider}`,
                    padding: "4px 8px",
                    gap: "4px",
                    fontSize: theme.fontSizeSmaller,
                    color: theme.vars.palette.text.secondary,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: theme.vars.palette.primary.main,
                      color: theme.vars.palette.primary.light,
                      backgroundColor: `${theme.vars.palette.primary.main}0a`
                    }
                  }}
                >
                  <ReplayIcon sx={{ fontSize: "15px" }} />
                  <span>Resume</span>
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={`Create a new ${providerLabel} session in this workspace`}
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handleCreateNewSession}
                  disabled={!isAvailable || !workspacePath}
                  aria-label="New session"
                  sx={{
                    borderRadius: "8px",
                    border: `1px solid ${theme.vars.palette.divider}`,
                    padding: "4px 10px",
                    gap: "4px",
                    fontSize: theme.fontSizeSmaller,
                    color: theme.vars.palette.text.secondary,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: theme.vars.palette.primary.main,
                      color: theme.vars.palette.primary.light,
                      backgroundColor: `${theme.vars.palette.primary.main}0a`
                    }
                  }}
                >
                  <AddIcon sx={{ fontSize: "16px" }} />
                  <span>New</span>
                </IconButton>
              </span>
            </Tooltip>
            <Menu
              anchorEl={resumeAnchorEl}
              open={resumeMenuOpen}
              onClose={() => {
                setResumeAnchorEl(null);
              }}
            >
              {previousSessions.map((entry) => (
                <MenuItem
                  key={entry.id}
                  onClick={() => {
                    setResumeAnchorEl(null);
                    handleResumeSession(entry.id).catch((err) => {
                      console.error(
                        "Failed to resume Agent session:",
                        err
                      );
                    });
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.fontFamily2,
                      fontSize: theme.fontSizeSmaller
                    }}
                  >
                    {entry.provider === "codex" ? "Codex" : entry.provider === "pi" ? "Pi" : "Claude"} •{" "}
                    {entry.id.slice(0, 12)}…
                  </span>
                </MenuItem>
              ))}
            </Menu>
          </Box>
        }
      />

      <Dialog
        open={newSessionDialogOpen}
        onClose={() => {
          if (!creatingSession) {
            setNewSessionDialogOpen(false);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>New Agent Session</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose provider, model, and workspace for this session.
          </Typography>

          <FormControl fullWidth size="small" css={dialogFieldStyles}>
            <InputLabel id="agent-provider-label">Provider</InputLabel>
            <Select
              labelId="agent-provider-label"
              value={draftProvider}
              label="Provider"
              onChange={(event) => {
                const nextProvider = event.target.value;
                if (nextProvider === "claude" || nextProvider === "codex" || nextProvider === "pi") {
                  setDraftProvider(nextProvider);
                }
              }}
            >
              <MenuItem value="claude">Claude</MenuItem>
              <MenuItem value="codex">Codex</MenuItem>
              <MenuItem value="pi">Pi</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" css={dialogFieldStyles}>
            <InputLabel id="agent-model-label">Model</InputLabel>
            <Select
              labelId="agent-model-label"
              value={draftModel}
              label="Model"
              onChange={(event) => {
                if (typeof event.target.value === "string") {
                  setDraftModel(event.target.value);
                }
              }}
              disabled={draftModelsLoading || draftModels.length === 0}
            >
              {draftModels.map((entry) => (
                <MenuItem key={entry.id} value={entry.id}>
                  {entry.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" css={dialogFieldStyles}>
            <InputLabel id="agent-workspace-label">Workspace</InputLabel>
            <Select
              labelId="agent-workspace-label"
              value={draftWorkspaceId ?? ""}
              label="Workspace"
              onChange={(event) => {
                const val = event.target.value;
                handleDialogWorkspaceChange(val === "" ? undefined : val);
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {workspaces?.map((ws) => (
                <MenuItem key={ws.id} value={ws.id}>
                  {ws.path}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {draftModelsLoading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Loading {draftProviderLabel} models...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setNewSessionDialogOpen(false)}
            disabled={creatingSession}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              void handleConfirmNewSession();
            }}
            disabled={!canCreateSession}
          >
            {creatingSession ? "Starting..." : "Start Session"}
          </Button>
        </DialogActions>
      </Dialog>

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

export default memo(AgentPanel);
