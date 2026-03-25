// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import IconButton from "@mui/material/IconButton";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import PortalInput from "./PortalInput";
import PortalRecents from "./PortalRecents";
import PortalSearchResults from "./PortalSearchResults";
import PortalSetupFlow from "./PortalSetupFlow";
import { usePortalChat } from "./usePortalChat";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import useSecretsStore from "../../stores/SecretsStore";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import { usePanelStore } from "../../stores/PanelStore";
import { Message, MessageContent, LanguageModel } from "../../stores/ApiTypes";
import ChatView from "../chat/containers/ChatView";
import AppHeader from "../panels/AppHeader";

const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "HUGGINGFACE_API_KEY",
];

type PortalState = "idle" | "setup" | "chatting";

const fadeOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-20px); }
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
      paddingTop: 64,
    },
    ".portal-heading": {
      fontSize: 24,
      fontWeight: 200,
      color: theme.vars.palette.c_gray5,
      marginBottom: 24,
      letterSpacing: "-0.3px",
      textAlign: "center" as const,
      lineHeight: 1.4,
    },
    ".portal-input-wrapper": {
      width: "100%",
      maxWidth: 440,
      position: "relative",
    },
    ".portal-hint": {
      fontSize: 11,
      color: theme.vars.palette.c_gray3,
      textAlign: "center" as const,
      marginTop: 16,
    },

    // Transition states
    "&.portal-state-idle .portal-heading": {
      animation: "none",
    },
    "&.portal-transitioning .portal-heading": {
      animation: `${fadeOut} 300ms ease-out forwards`,
    },
    "&.portal-transitioning .portal-recents": {
      animation: `${fadeOut} 200ms ease-out forwards`,
    },

    // Chatting state
    ".portal-chat-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      width: "100%",
      paddingTop: 64,
      animation: `${fadeIn} 300ms ease-out`,
    },
    ".portal-chat-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "8px 16px",
    },
    ".portal-new-chat-btn": {
      color: theme.vars.palette.c_gray4,
      "&:hover": {
        color: theme.vars.palette.c_white,
      },
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: "16px 20px",
      margin: "20px auto",
      animation: `${fadeIn} 300ms ease-out`,
    },
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [_searchQuery, setSearchQuery] = useState("");
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
    currentThreadId,
    progress,
    statusMessage,
    selectedModel,
    selectedTools,
    agentMode,
    currentPlanningUpdate,
    currentTaskUpdate,
    currentLogUpdate,
    messages,
    sendMessage,
    newThread,
    selectThread,
    deleteThread: _deleteThread,
    stopGeneration,
    setSelectedModel,
    setAgentMode,
    setSelectedTools,
  } = usePortalChat();

  const {
    sortedWorkflows,
    startTemplates,
  } = useDashboardData();

  const {
    handleExampleClick,
  } = useWorkflowActions();

  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

  // Fetch secrets on mount to know if providers are configured
  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const hasConfiguredProvider = useMemo(() => {
    return secrets.some((s) =>
      KNOWN_PROVIDER_KEYS.includes(s.key) && s.is_configured
    );
  }, [secrets]);

  const isReturningUser = useMemo(() => {
    return sortedWorkflows.length > 0 || Object.keys(threads).length > 0;
  }, [sortedWorkflows, threads]);

  // Search debounce
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 200);
  }, []);

  // Transition to chatting
  const transitionToChat = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsTransitioning(false);
      setPortalState("chatting");
    }, 400);
  }, []);

  // Handle send from idle state
  const handleIdleSend = useCallback(
    async (text: string) => {
      setSearchQuery("");
      setDebouncedQuery("");

      if (!hasConfiguredProvider) {
        setPendingMessage(text);
        transitionToChat();
        // After transition completes, show setup
        setTimeout(() => setPortalState("setup"), 450);
        return;
      }

      transitionToChat();

      // Create a message and send it after transition
      setTimeout(async () => {
        const content: MessageContent[] = [{ type: "text", text }];
        const message: Message = {
          type: "message",
          role: "user",
          content,
          thread_id: currentThreadId || "",
          created_at: new Date().toISOString(),
        };
        await sendMessage(message);
      }, 450);
    },
    [hasConfiguredProvider, transitionToChat, sendMessage, currentThreadId]
  );

  // Handle send from chatting state — matches ChatView's sendMessage: (message: Message) => Promise<void>
  const handleChatSend = useCallback(
    async (message: Message) => {
      await sendMessage(message);
    },
    [sendMessage]
  );

  // Handle setup completion
  const handleSetupComplete = useCallback(
    async (defaultModel: string) => {
      // Parse "provider:id" format into a proper LanguageModel object
      const [provider, ...idParts] = defaultModel.split(":");
      const id = idParts.join(":");
      const model: LanguageModel = {
        type: "language_model",
        provider: provider as any,
        id: id,
        name: id,
      };
      setSelectedModel(model);
      setPortalState("chatting");

      // Send the pending message
      if (pendingMessage) {
        const content: MessageContent[] = [{ type: "text", text: pendingMessage }];
        const message: Message = {
          type: "message",
          role: "user",
          content,
          thread_id: currentThreadId || "",
          created_at: new Date().toISOString(),
        };
        setPendingMessage(null);
        // Small delay to let model state propagate
        setTimeout(async () => {
          await sendMessage(message);
        }, 100);
      }
    },
    [pendingMessage, setSelectedModel, sendMessage, currentThreadId]
  );

  // Handle clicking a recent chat thread
  const handleThreadClick = useCallback(
    (threadId: string) => {
      selectThread(threadId);
      setPortalState("chatting");
    },
    [selectThread]
  );

  // Handle clicking a recent workflow — navigate directly
  const handleWorkflowItemClick = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    await newThread();
    setPortalState("idle");
    setSearchQuery("");
    setDebouncedQuery("");
  }, [newThread]);

  // Handle template selection from search — find full Workflow object
  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      const template = startTemplates.find((t) => t.id === templateId);
      if (template) {
        handleExampleClick(template);
      }
    },
    [handleExampleClick, startTemplates]
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

  // IDLE state
  if (portalState === "idle" || isTransitioning) {
    return (
      <Box
        css={styles(theme)}
        className={`portal-state-idle ${isTransitioning ? "portal-transitioning" : ""}`}
      >
        <AppHeader />
        <div className="portal-center">
          <div className="portal-heading">
            {isReturningUser ? (
              <>
                Welcome back.
                <br />
                {"What's next?"}
              </>
            ) : (
              "What shall we build?"
            )}
          </div>

          <div className="portal-input-wrapper">
            <PortalInput
              onSend={handleIdleSend}
              onSearchChange={handleSearchChange}
            />
            {debouncedQuery.length >= 2 && (
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
              />
            </div>
          )}

          {!isReturningUser && !isTransitioning && (
            <div className="portal-hint">Type anything to get started</div>
          )}
        </div>
      </Box>
    );
  }

  // SETUP state
  if (portalState === "setup") {
    return (
      <Box css={styles(theme)}>
        <AppHeader />
        <div className="portal-chat-container">
          <div className="portal-chat-header">
            <IconButton
              className="portal-new-chat-btn"
              onClick={handleNewChat}
              size="small"
              title="New chat"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </div>
          <div className="portal-setup-message">
            <PortalSetupFlow onComplete={handleSetupComplete} />
          </div>
        </div>
      </Box>
    );
  }

  // CHATTING state
  return (
    <Box css={styles(theme)}>
      <AppHeader />
      <div className="portal-chat-container">
        <div className="portal-chat-header">
          <IconButton
            className="portal-new-chat-btn"
            onClick={handleNewChat}
            size="small"
            title="New chat"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </div>
        <ChatView
          status={status as any}
          progress={progress.current}
          total={progress.total}
          messages={messages}
          model={selectedModel}
          sendMessage={handleChatSend}
          progressMessage={statusMessage}
          selectedTools={selectedTools}
          onToolsChange={handleToolsChange}
          onModelChange={handleModelChange}
          agentMode={agentMode}
          onAgentModeToggle={handleAgentModeToggle}
          currentPlanningUpdate={currentPlanningUpdate}
          currentTaskUpdate={currentTaskUpdate}
          currentLogUpdate={currentLogUpdate}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
        />
      </div>
    </Box>
  );
};

export default memo(Portal);
