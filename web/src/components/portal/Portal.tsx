// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import PortalRecents from "./PortalRecents";
import PortalSearchResults from "./PortalSearchResults";
import PortalSetupFlow from "./PortalSetupFlow";
import { usePortalChat } from "./usePortalChat";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import useSecretsStore from "../../stores/SecretsStore";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import { usePanelStore } from "../../stores/PanelStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { Message, MessageContent, LanguageModel } from "../../stores/ApiTypes";
import AppHeader from "../panels/AppHeader";
import ChatInputSection from "../chat/containers/ChatInputSection";
import SchoolIcon from "@mui/icons-material/School";
import { BORDER_RADIUS } from "../ui_primitives";

const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "HUGGINGFACE_API_KEY"
];

type PortalState = "idle" | "setup";

const TRANSITION_DURATION = 350;

const portalExit = keyframes`
  from { opacity: 1; transform: scale(1); filter: blur(0); }
  to { opacity: 0; transform: scale(0.92); filter: blur(6px); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const styles = (theme: Theme) =>
  css({
    width: "100vw",
    height: "100vh",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.c_editor_bg_color,

    ".portal-center": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      paddingTop: 40,
      [theme.breakpoints.down("sm")]: {
        padding: "0 12px",
        paddingTop: 24
      }
    },
    ".portal-heading": {
      fontSize: 18,
      fontWeight: 300,
      color: theme.vars.palette.text.secondary,
      marginBottom: 20,
      letterSpacing: "0.01em",
      textAlign: "center" as const,
      lineHeight: 1.5
    },
    ".portal-input-wrapper": {
      width: "100%",
      maxWidth: 640,
      position: "relative",
      // Override ChatInputSection margin
      "& .chat-input-section": {
        margin: "0 auto",
        width: "100%",
        maxWidth: "100%"
      },
      // Composer box: slightly more padding for a roomier feel
      "& .compose-message": {
        padding: "10px 16px 8px",
        borderRadius: 16
      },
      "& .compose-message textarea": {
        padding: "4px 8px 8px 4px",
        fontSize: "15px"
      },
      // Footer: keep toolbar left, send button right — but tighten gap
      "& .composer-footer": {
        paddingTop: "4px",
        gap: "4px",
        "& .chat-action-buttons": {
          marginLeft: "auto",
          opacity: 0.6,
          transition: "opacity 0.2s ease",
          "&:hover": { opacity: 1 }
        }
      },
      // Flatten the toolbar — no background, no border, no shadow
      "& .chat-toolbar": {
        background: "none",
        border: "none",
        boxShadow: "none",
        backdropFilter: "none",
        padding: "0",
        minHeight: "unset",
        gap: "2px",
        "&::before": { display: "none" },
        "&:hover": { border: "none", boxShadow: "none" }
      },
      // Remove model select border/bg
      "& .toolbar-group-primary": {
        background: "none !important",
        border: "none !important",
        boxShadow: "none !important",
        padding: "2px 4px",
        "&:hover": {
          background: `${theme.vars.palette.action.hover} !important`,
          borderColor: "transparent !important"
        }
      },
      // Dim toolbar icon groups
      "& .toolbar-group": {
        opacity: 0.45,
        transition: "opacity 0.2s ease",
        "&:hover": {
          opacity: 0.9,
          background: theme.vars.palette.action.hover
        }
      },
      // Mobile: tighten the inline composer footer (model + agent toggle live here)
      [theme.breakpoints.down("sm")]: {
        "& .chat-input-section": {
          padding: "8px 0 0 0 !important"
        }
      }
    },
    ".portal-hint": {
      fontSize: 11,
      color: theme.vars.palette.text.disabled,
      textAlign: "center" as const,
      marginTop: 12
    },
    ".portal-skip-welcome": {
      background: "none",
      border: "none",
      padding: "4px 8px",
      marginTop: 8,
      fontSize: 11,
      color: theme.vars.palette.text.disabled,
      cursor: "pointer",
      textDecoration: "underline",
      textUnderlineOffset: "2px",
      transition: "color 0.2s ease",
      "&:hover": {
        color: theme.vars.palette.text.secondary
      }
    },
    ".portal-getting-started": {
      marginTop: 20,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 16px",
      borderRadius: BORDER_RADIUS.pill,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      transition: "all 0.2s ease",
      "& svg": {
        fontSize: 16
      },
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.text.primary,
        background: theme.vars.palette.action.hover
      }
    },

    // Recents wrapper
    ".portal-recents": {
      marginTop: 24,
      width: "100%",
      maxWidth: 600
    },

    // Transition states
    "&.portal-transitioning": {
      pointerEvents: "none"
    },
    "&.portal-transitioning .portal-center": {
      animation: `${portalExit} ${TRANSITION_DURATION}ms ease-in forwards`
    },

    // Setup state
    ".portal-setup-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      paddingTop: 64
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: "16px 20px",
      animation: `${fadeIn} 300ms ease-out`
    }
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEnsureChatConnected({ disconnectOnUnmount: false });

  // Close panelLeft when portal is opened
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const {
    status,
    threads,
    selectedModel,
    selectedTools,
    agentMode,
    sendMessage,
    newThread,
    selectThread,
    deleteThread: _deleteThread,
    setSelectedModel,
    setAgentMode,
    setSelectedTools
  } = usePortalChat();

  const { sortedWorkflows, startTemplates } = useDashboardData();

  const { handleExampleClick, handleCreateNewWorkflow } = useWorkflowActions();

  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const handleSkipWelcome = useCallback(() => {
    updateSettings({ showWelcomeOnStartup: false });
    navigate("/editor", { replace: true });
  }, [updateSettings, navigate]);

  // Fetch secrets on mount to know if providers are configured
  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    const timer = searchDebounceRef.current;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const hasConfiguredProvider = useMemo(() => {
    return secrets.some(
      (s) => KNOWN_PROVIDER_KEYS.includes(s.key) && s.is_configured
    );
  }, [secrets]);

  const isReturningUser = useMemo(() => {
    return sortedWorkflows.length > 0 || Object.keys(threads).length > 0;
  }, [sortedWorkflows, threads]);

  // Navigate to chat route after creating thread and sending message
  const sendAndNavigate = useCallback(
    async (content: MessageContent[], _prompt: string) => {
      const threadId = await newThread();
      if (threadId) {
        const message: Message = {
          type: "message",
          role: "user",
          content,
          thread_id: threadId,
          created_at: new Date().toISOString(),
          model: selectedModel?.id
        };
        await sendMessage(message);
        setTimeout(() => {
          navigate(`/chat/${threadId}`);
        }, 100);
      }
    },
    [newThread, sendMessage, navigate, selectedModel]
  );

  // Handle send from ChatInputSection
  const handleSendMessage = useCallback(
    async (content: MessageContent[], prompt: string, _agentMode: boolean) => {
      setDebouncedQuery("");

      if (!hasConfiguredProvider) {
        setPendingMessage(prompt);
        setIsTransitioning(true);
        setTimeout(() => {
          setIsTransitioning(false);
          setPortalState("setup");
        }, 400);
        return;
      }

      // Start fade-out, then send + navigate
      setIsTransitioning(true);
      setTimeout(() => {
        sendAndNavigate(content, prompt);
      }, 400);
    },
    [hasConfiguredProvider, sendAndNavigate]
  );

  // Handle setup completion
  const handleSetupComplete = useCallback(
    async (defaultModel: string) => {
      const [provider, ...idParts] = defaultModel.split(":");
      const id = idParts.join(":");
      const model: LanguageModel = {
        type: "language_model",
        provider,
        id: id,
        name: id
      };
      setSelectedModel(model);

      if (pendingMessage) {
        const text = pendingMessage;
        setPendingMessage(null);
        const content: MessageContent[] = [{ type: "text", text }];
        await sendAndNavigate(content, text);
      }
    },
    [pendingMessage, setSelectedModel, sendAndNavigate]
  );

  const transitionTo = useCallback((onComplete: () => void) => {
    setIsTransitioning(true);
    setTimeout(onComplete, TRANSITION_DURATION);
  }, []);

  const handleOpenGettingStarted = useCallback(() => {
    transitionTo(() => navigate("/welcome"));
  }, [navigate, transitionTo]);

  // Handle clicking a recent chat thread
  const handleThreadClick = useCallback(
    (threadId: string) => {
      transitionTo(() => {
        selectThread(threadId);
        navigate(`/chat/${threadId}`);
      });
    },
    [selectThread, navigate, transitionTo]
  );

  // Handle clicking a recent workflow
  const handleWorkflowItemClick = useCallback(
    (workflowId: string) => {
      transitionTo(() => {
        navigate(`/editor/${workflowId}`);
      });
    },
    [navigate, transitionTo]
  );

  // Handle template selection from search
  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      const template = startTemplates.find((t) => t.id === templateId);
      if (template) {
        transitionTo(() => {
          handleExampleClick(template);
        });
      }
    },
    [handleExampleClick, startTemplates, transitionTo]
  );

  const handleModelChange = useCallback(
    (model: LanguageModel) => {
      setSelectedModel(model);
    },
    [setSelectedModel]
  );

  const handleToolsChange = useCallback(
    (tools: string[]) => {
      setSelectedTools(tools);
    },
    [setSelectedTools]
  );

  const handleAgentModeToggle = useCallback(
    (enabled: boolean) => {
      setAgentMode(enabled);
    },
    [setAgentMode]
  );

  // SETUP state
  if (portalState === "setup") {
    return (
      <Box css={styles(theme)}>
        <AppHeader />
        <div className="portal-setup-container">
          <div className="portal-setup-message">
            <PortalSetupFlow onComplete={handleSetupComplete} />
          </div>
        </div>
      </Box>
    );
  }

  // IDLE state (default)
  return (
    <Box
      css={styles(theme)}
      className={isTransitioning ? "portal-transitioning" : ""}
    >
      <AppHeader />
      <div className="portal-center">
        {!isReturningUser && (
          <div className="portal-heading">What shall we build?</div>
        )}

        <div className="portal-input-wrapper">
          <ChatInputSection
            status={status === "stopping" ? "loading" : status}
            onSendMessage={handleSendMessage}
            selectedTools={selectedTools}
            onToolsChange={handleToolsChange}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            agentMode={agentMode}
            onAgentModeToggle={handleAgentModeToggle}
          />
          {debouncedQuery.length >= 2 && !isTransitioning && (
            <PortalSearchResults
              query={debouncedQuery}
              workflows={sortedWorkflows}
              templates={startTemplates}
              onSelectWorkflow={handleWorkflowItemClick}
              onSelectTemplate={handleTemplateSelect}
            />
          )}
        </div>

        {!isTransitioning && (
          <div className="portal-recents">
            <PortalRecents
              workflows={sortedWorkflows}
              threads={threads}
              onWorkflowClick={handleWorkflowItemClick}
              onThreadClick={handleThreadClick}
              onCreateWorkflow={handleCreateNewWorkflow}
            />
          </div>
        )}

        {!isReturningUser && !isTransitioning && (
          <div className="portal-hint">Type anything to get started</div>
        )}

        {!isTransitioning && (
          <button
            type="button"
            className="portal-getting-started"
            onClick={handleOpenGettingStarted}
            title="Open the guided getting started page"
          >
            <SchoolIcon />
            {isReturningUser ? "Open getting started" : "New here? Start the guided tour"}
          </button>
        )}

        {!isTransitioning && (
          <button
            type="button"
            className="portal-skip-welcome"
            onClick={handleSkipWelcome}
            title="Don't show this screen on startup. You can re-enable it from Settings."
          >
            Skip welcome screen
          </button>
        )}
      </div>
    </Box>
  );
};

export default memo(Portal);
