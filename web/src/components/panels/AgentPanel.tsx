/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Button,
  Menu,
  MenuItem,
  IconButton,
  DialogTitle,
  DialogContent
} from "@mui/material";
import { AgentModelSelect } from "./AgentModelSelect";
import MediaControlChip from "../chat/composer/MediaControlChip";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
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
import type {
  LanguageModel,
  Message,
  WorkspaceResponse
} from "../../stores/ApiTypes";
import type { AgentProvider, AgentModelDescriptor } from "../../stores/AgentStore";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import { DialogActionButtons } from "../ui_primitives/DialogActionButtons";
import {
  Text,
  Caption,
  Tooltip,
  SelectField,
  FlexRow,
  Dialog,
  LoadingSpinner
} from "../ui_primitives";

const PROVIDER_LABELS: Record<AgentProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi",
  llm: "LLM"
};

const ALL_PROVIDERS: AgentProvider[] = [
  "claude",
  "codex",
  "opencode",
  "pi",
  "llm"
];

function isAgentProvider(value: string): value is AgentProvider {
  return (ALL_PROVIDERS as string[]).includes(value);
}

import { useQuery } from "@tanstack/react-query";
import { isLocalhost, isProduction } from "../../lib/env";
import { getIsElectronDetails } from "../../utils/browser";
import { trpcClient } from "../../trpc/client";
import { useNavigate } from "react-router-dom";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { getAgentSocketClient } from "../../lib/agent/AgentSocketClient";

const workspacesEnabled = getIsElectronDetails().isElectron || !isProduction;

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
      height: "calc(100% - 40px)"
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
    gap: "8px",
    padding: "16px 24px",
    textAlign: "center",

    ".placeholder-icon": {
      width: "40px",
      height: "40px",
      borderRadius: "var(--rounded-xl)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        theme.palette.mode === "dark"
          ? `linear-gradient(135deg, ${theme.vars.palette.primary.dark}44, ${theme.vars.palette.secondary.dark}33)`
          : `linear-gradient(135deg, ${theme.vars.palette.primary.light}33, ${theme.vars.palette.secondary.light}22)`,
      border: `1px solid ${theme.vars.palette.divider}`,
      marginBottom: "2px",
      "& svg": {
        fontSize: "20px",
        color: theme.vars.palette.primary.light,
        opacity: 0.9
      }
    },

    ".placeholder-title": {
      margin: 0
    },

    ".placeholder-description": {
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
      borderRadius: "var(--rounded-lg)",
      padding: "6px 12px",
      maxWidth: "360px"
    },

    ".placeholder-action": {
      marginTop: "4px"
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

const toolbarStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 6px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    flexShrink: 0
  });

const mcpWarningStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    fontSize: theme.fontSizeSmaller,
    fontFamily: theme.fontFamily2,
    color: theme.vars.palette.warning.main,
    backgroundColor: `${theme.vars.palette.warning.main}0c`,
    borderBottom: `1px solid ${theme.vars.palette.warning.main}33`,
    flexShrink: 0,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    "&:hover": {
      backgroundColor: `${theme.vars.palette.warning.main}18`
    },
    "& svg": {
      fontSize: "14px",
      flexShrink: 0
    }
  });


const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
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
  /**
   * For provider === "llm" only: the underlying chat provider id of the
   * currently-picked model, captured at the moment the user picks from
   * `LanguageModelMenuDialog` (which returns full LanguageModels). The
   * harness flow leaves this null and falls through to the existing
   * descriptor-list lookup.
   */
  const [draftChatProviderId, setDraftChatProviderId] = useState<string | null>(
    null
  );
  /** Anchor for the LLM language-model dialog opened from the new-session form. */
  const draftLlmDialogAnchor = useRef<HTMLButtonElement | null>(null);
  const [draftLlmDialogOpen, setDraftLlmDialogOpen] = useState(false);
  /** Anchor for the LLM language-model dialog opened from the chat toolbar. */
  const toolbarLlmDialogAnchor = useRef<HTMLButtonElement | null>(null);
  const [toolbarLlmDialogOpen, setToolbarLlmDialogOpen] = useState(false);
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
    chatProviderId,
    availableModels,
    modelsLoading,
    loadModels,
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
        chatProviderId: state.chatProviderId,
        availableModels: state.availableModels,
        modelsLoading: state.modelsLoading,
        loadModels: state.loadModels,
      }),
      []
    )
  );
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    enabled: workspacesEnabled
  });

  const { data: mcpStatus } = useQuery({
    queryKey: ["mcp-status"],
    queryFn: async () => {
      try {
        return await trpcClient.mcpConfig.status.query();
      } catch {
        return null;
      }
    },
    enabled: isLocalhost,
    refetchOnWindowFocus: false,
    staleTime: 60_000
  });

  const mcpInstalledForProvider = useMemo(() => {
    // The LLM provider runs in-process and doesn't need an MCP install on
    // the host — its tools are dispatched directly over the agent socket.
    if (provider === "llm") return true;
    if (!mcpStatus?.targets) return true;
    const entry = mcpStatus.targets.find((t) => t.target === provider);
    return entry?.installed ?? true;
  }, [mcpStatus, provider]);

  const navigate = useNavigate();
  const openSettingsApiKeys = useCallback(
    () => navigate("/settings?tab=1"),
    [navigate]
  );

  const hasRunningSession = Boolean(sessionId);
  const isLlmProvider = provider === "llm";
  const isDraftLlmProvider = draftProvider === "llm";

  useEffect(() => {
    useAgentStore.getState().loadSessions();
    useAgentStore.getState().loadModels();
  }, []);

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
    // The harness providers' model lists depend on the workspace (e.g. Claude
    // Code reads `~/.config`). The "llm" provider aggregates from registered
    // chat providers and ignores the workspace, so we don't gate on it.
    const isLlm = draftProvider === "llm";
    if (!newSessionDialogOpen || (!isLlm && !draftWorkspacePath)) {
      setDraftModels([]);
      setDraftModelsLoading(false);
      return;
    }
    let cancelled = false;
    setDraftModelsLoading(true);
    getAgentSocketClient()
      .listModels({
        provider: draftProvider,
        workspacePath: isLlm ? undefined : draftWorkspacePath ?? undefined
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
    setDraftChatProviderId(chatProviderId);
    setNewSessionDialogOpen(true);
  }, [provider, workspaceId, workspacePath, model, chatProviderId]);

  const handleCreateNewSession = useCallback(() => {
    setDraftProvider(provider);
    setDraftWorkspaceId(workspaceId);
    setDraftWorkspacePath(workspacePath);
    setDraftModel(model);
    setDraftChatProviderId(chatProviderId);
    setNewSessionDialogOpen(true);
  }, [provider, workspaceId, workspacePath, model, chatProviderId]);

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
      case "stopping":
        // While the server acknowledges the stop we still treat the chat as
        // busy so the user can't fire a new prompt before the agent actually
        // halts.
        return "loading" as const;
      case "error":
        return "error" as const;
      default:
        return "disconnected" as const;
    }
  }, [status]);

  const providerLabel = PROVIDER_LABELS[provider];
  const draftProviderLabel = PROVIDER_LABELS[draftProvider];
  const canCreateSession =
    (isDraftLlmProvider
      ? Boolean(draftChatProviderId)
      : Boolean(draftWorkspacePath)) &&
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
    if (!draftModel) {
      return;
    }
    if (!isDraftLlmProvider && !draftWorkspacePath) {
      return;
    }
    if (isDraftLlmProvider && !draftChatProviderId) {
      return;
    }
    setCreatingSession(true);
    try {
      setProvider(draftProvider);
      // For LLM, pass chatProviderId explicitly — the LanguageModelMenuDialog
      // returns full LanguageModels that aren't in `availableModels` (which
      // is populated from the AgentSdkProvider list, not the tRPC aggregate),
      // so the descriptor-lookup branch inside setModel would resolve null.
      setModel(
        draftModel,
        isDraftLlmProvider ? draftChatProviderId ?? undefined : undefined
      );
      if (!isDraftLlmProvider) {
        setWorkspaceContext(draftWorkspaceId, draftWorkspacePath);
      }

      if (hasRunningSession) {
        await startNewSession();
      } else {
        await createSession({
          workspacePath: isDraftLlmProvider
            ? undefined
            : draftWorkspacePath ?? undefined,
          workspaceId: isDraftLlmProvider
            ? undefined
            : draftWorkspaceId ?? undefined
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
    draftChatProviderId,
    draftModel,
    draftModels,
    draftProvider,
    draftWorkspaceId,
    draftWorkspacePath,
    hasRunningSession,
    isDraftLlmProvider,
    setModel,
    setProvider,
    setWorkspaceContext,
    startNewSession
  ]);

  const noMessagesPlaceholder = useMemo(() => {
    if (!isAvailable) {
      return (
        <div css={placeholderStyles(theme)}>
          <div className="placeholder-icon">
            <DesktopWindowsOutlinedIcon />
          </div>
          <Text size="normal" weight={500} family="secondary" className="placeholder-title">
            AI Agent
          </Text>
          <Caption size="small" className="placeholder-description">
            This feature requires the NodeTool desktop app (Electron) to run
            local agent sessions.
          </Caption>
        </div>
      );
    }

    if (error) {
      return (
        <div css={placeholderStyles(theme)}>
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
        </div>
      );
    }

    return (
      <div css={placeholderStyles(theme)}>
        <div className="placeholder-icon">
          <SmartToyOutlinedIcon />
        </div>
        <Text size="normal" weight={500} family="secondary" className="placeholder-title">
          {providerLabel} Agent
        </Text>
        <Caption size="small" className="placeholder-description">
          Start a conversation with a local {providerLabel.toLowerCase()} agent
          session. The agent can execute code, browse files, and assist you with
          tasks in your workspace.
        </Caption>
        {status === "disconnected" && !hasRunningSession && (
          <div className="placeholder-action">
            <Button
              variant="outlined"
              size="small"
              onClick={handleStartSession}
              disabled={!isLlmProvider && !workspacePath}
              startIcon={<PlayArrowRoundedIcon />}
              css={startButtonStyles(theme)}
            >
              Start Session
            </Button>
          </div>
        )}
      </div>
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
  const resumeMenuOpen = Boolean(resumeAnchorEl);

  // Stable handler for opening resume menu
  const handleResumeMenuOpen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setResumeAnchorEl(event.currentTarget);
    },
    []
  );

  // Stable handler for closing resume menu
  const handleResumeMenuClose = useCallback(() => {
    setResumeAnchorEl(null);
  }, []);

  // Stable handler for resume session with error handling
  const handleResumeSessionWithError = useCallback(
    (entryId: string) => () => {
      setResumeAnchorEl(null);
      void handleResumeSession(entryId).catch((err) => {
        console.error("Failed to resume Agent session:", err);
      });
    },
    [handleResumeSession]
  );

  // Stable handler for closing new session dialog
  const handleNewSessionDialogClose = useCallback(() => {
    if (!creatingSession) {
      setNewSessionDialogOpen(false);
    }
  }, [creatingSession]);

  // Stable handler for provider change in dialog
  const handleDraftProviderChange = useCallback((value: string) => {
    if (isAgentProvider(value)) {
      setDraftProvider(value);
    }
  }, []);

  const handleProviderSelectChange = useCallback(
    (value: string) => {
      if (isAgentProvider(value)) {
        setProvider(value);
      }
    },
    [setProvider]
  );

  const providerSelectOptions = useMemo<
    Array<{ id: string; label: string }>
  >(
    () => ALL_PROVIDERS.map((id) => ({ id, label: PROVIDER_LABELS[id] })),
    []
  );

  // Stable handler for model change in dialog
  const handleDraftModelChange = useCallback(
    (value: string) => {
      setDraftModel(value);
    },
    []
  );

  // Stable handler for workspace change in dialog
  const handleWorkspaceChange = useCallback(
    (value: string) => {
      const val = value === "" ? undefined : value;
      handleDialogWorkspaceChange(val);
    },
    [handleDialogWorkspaceChange]
  );

  // Stable handler for cancel button
  const handleCancelNewSession = useCallback(() => {
    setNewSessionDialogOpen(false);
  }, []);

  // Stable handler for confirm button
  const handleConfirmNewSessionClick = useCallback(() => {
    void handleConfirmNewSession();
  }, [handleConfirmNewSession]);

  const dialogLlmModelButtonSx = useMemo(
    () => ({
      justifyContent: "flex-start",
      width: "100%",
      height: 32,
      padding: "0 10px",
      textTransform: "none" as const,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider,
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis"
    }),
    [theme]
  );

  const toolbarButtonSx = useMemo(
    () => ({
      borderRadius: "var(--rounded-md)",
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: "3px 8px",
      gap: "4px",
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.secondary,
      textTransform: "none" as const,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.light,
        backgroundColor: `${theme.vars.palette.primary.main}0a`,
      },
    }),
    [theme]
  );

  const providerOptions = useMemo(
    () =>
      ALL_PROVIDERS.map((id) => ({ value: id, label: PROVIDER_LABELS[id] })),
    []
  );

  const modelOptions = useMemo(
    () => draftModels.map((entry) => ({ value: entry.id, label: entry.label })),
    [draftModels]
  );

  const workspaceOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...(workspaces?.map((ws) => ({ value: ws.id, label: ws.path })) ?? [])
    ],
    [workspaces]
  );

  return (
    <div css={containerStyles(theme)} className="agent-panel">
      <div css={toolbarStyles(theme)}>
        <div style={{ flex: 1 }} />

        <Tooltip title="Resume a previous session">
          <span>
            <IconButton
              size="small"
              onClick={handleResumeMenuOpen}
              disabled={!isAvailable || previousSessions.length === 0}
              aria-label="Resume session"
              sx={toolbarButtonSx}
            >
              <ReplayIcon sx={{ fontSize: "14px" }} />
              <span>Resume</span>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`Create a new ${providerLabel} session`}>
          <span>
            <IconButton
              size="small"
              onClick={handleCreateNewSession}
              disabled={!isAvailable || (!isLlmProvider && !workspacePath)}
              aria-label="New session"
              sx={toolbarButtonSx}
            >
              <AddIcon sx={{ fontSize: "14px" }} />
              <span>New</span>
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={resumeAnchorEl}
          open={resumeMenuOpen}
          onClose={handleResumeMenuClose}
        >
          {previousSessions.map((entry) => (
            <MenuItem
              key={entry.id}
              onClick={handleResumeSessionWithError(entry.id)}
            >
              <span
                style={{
                  fontFamily: theme.fontFamily2,
                  fontSize: theme.fontSizeSmaller,
                }}
              >
                {PROVIDER_LABELS[entry.provider]} •{" "}
                {entry.summary
                  ? entry.summary.length > 40
                    ? entry.summary.slice(0, 40) + "…"
                    : entry.summary
                  : entry.id.slice(0, 12) + "…"}
              </span>
            </MenuItem>
          ))}
        </Menu>
      </div>

      {isLocalhost && !mcpInstalledForProvider && (
        <div
          css={mcpWarningStyles(theme)}
          onClick={openSettingsApiKeys}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openSettingsApiKeys();
          }}
        >
          <WarningAmberIcon />
          <span>
            MCP not installed for {PROVIDER_LABELS[provider]}.{" "}
            <span style={{ textDecoration: "underline" }}>
              Configure in Settings
            </span>
          </span>
        </div>
      )}

      <Dialog
        open={newSessionDialogOpen}
        onClose={handleNewSessionDialogClose}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>New Agent Session</DialogTitle>
        <DialogContent>
          <Caption size="small" sx={{ mb: 2 }}>
            Choose provider, model, and workspace for this session.
          </Caption>

          <div css={dialogFieldStyles}>
            <SelectField
              label="Provider"
              value={draftProvider}
              onChange={handleDraftProviderChange}
              options={providerOptions}
              size="small"
              variant="outlined"
            />
          </div>

          {isDraftLlmProvider ? (
            // The non-harness "llm" provider runs against any registered
            // chat provider, so its model catalog comes from the regular
            // tRPC `models.llmByProvider` aggregate (with tool-call
            // filtering) rather than the AgentSdkProvider list. Use the
            // shared LanguageModelMenuDialog so users get the same rich
            // picker the rest of the app uses.
            <div css={dialogFieldStyles}>
              <Caption size="smaller" sx={{ display: "block", mb: 0.5 }}>
                Model
              </Caption>
              <Button
                ref={draftLlmDialogAnchor}
                size="small"
                variant="outlined"
                onClick={() => setDraftLlmDialogOpen(true)}
                sx={dialogLlmModelButtonSx}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {draftModel
                    ? `${draftModel}${
                        draftChatProviderId ? ` (${draftChatProviderId})` : ""
                      }`
                    : "Select model…"}
                </span>
              </Button>
              <LanguageModelMenuDialog
                open={draftLlmDialogOpen}
                anchorEl={draftLlmDialogAnchor.current}
                onClose={() => setDraftLlmDialogOpen(false)}
                requireToolSupport
                onModelChange={(m: LanguageModel) => {
                  setDraftModel(m.id);
                  setDraftChatProviderId(m.provider ?? null);
                  setDraftLlmDialogOpen(false);
                }}
              />
            </div>
          ) : (
            <div css={dialogFieldStyles}>
              <SelectField
                label="Model"
                value={draftModel}
                onChange={handleDraftModelChange}
                options={modelOptions}
                disabled={draftModelsLoading || draftModels.length === 0}
                size="small"
                variant="outlined"
              />
            </div>
          )}

          {!isDraftLlmProvider && (
            <div css={dialogFieldStyles}>
              <SelectField
                label="Workspace"
                value={draftWorkspaceId ?? ""}
                onChange={handleWorkspaceChange}
                options={workspaceOptions}
                size="small"
                variant="outlined"
              />
            </div>
          )}

          {draftModelsLoading && (
            <FlexRow align="center" gap={1} sx={{ marginTop: "8px" }}>
              <LoadingSpinner size="small" />
              <Caption size="smaller">
                Loading {draftProviderLabel} models...
              </Caption>
            </FlexRow>
          )}
        </DialogContent>
        <DialogActionButtons
          onCancel={handleCancelNewSession}
          onConfirm={handleConfirmNewSessionClick}
          confirmText={creatingSession ? "Starting..." : "Start Session"}
          isLoading={creatingSession}
          confirmDisabled={!canCreateSession}
          cancelDisabled={creatingSession}
        />
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
        composerVariant="simple"
        composerToolbar={
          <FlexRow gap={1} align="center">
            <AgentModelSelect
              value={provider}
              options={providerSelectOptions}
              onChange={handleProviderSelectChange}
              disabled={hasRunningSession}
              searchable={false}
            />
            {isLlmProvider ? (
              // The non-harness "llm" provider uses the regular tRPC
              // language-model catalog instead of the AgentSdkProvider list,
              // so render the same picker the rest of the app uses.
              <>
                <MediaControlChip
                  ref={toolbarLlmDialogAnchor}
                  size="sm"
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  label={
                    model
                      ? `${model}${
                          chatProviderId ? ` (${chatProviderId})` : ""
                        }`
                      : "Select model…"
                  }
                  truncate
                  active={toolbarLlmDialogOpen}
                  disabled={hasRunningSession}
                  onClick={() => setToolbarLlmDialogOpen(true)}
                />
                <LanguageModelMenuDialog
                  open={toolbarLlmDialogOpen}
                  anchorEl={toolbarLlmDialogAnchor.current}
                  onClose={() => setToolbarLlmDialogOpen(false)}
                  requireToolSupport
                  onModelChange={(m: LanguageModel) => {
                    setModel(m.id, m.provider ?? undefined);
                    setToolbarLlmDialogOpen(false);
                  }}
                />
              </>
            ) : (
              <AgentModelSelect
                value={model}
                options={availableModels}
                onChange={setModel}
                disabled={hasRunningSession || availableModels.length === 0}
                loading={modelsLoading}
              />
            )}
          </FlexRow>
        }
      />
    </div>
  );
};

AgentPanel.displayName = "AgentPanel";

export default memo(AgentPanel);
