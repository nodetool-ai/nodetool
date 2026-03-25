// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
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
import AppHeader from "../panels/AppHeader";

const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "HUGGINGFACE_API_KEY",
];

type PortalState = "idle" | "setup";

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
    "&.portal-transitioning": {
      pointerEvents: "none",
    },
    "&.portal-transitioning .portal-heading": {
      animation: `${fadeOut} 300ms ease-out forwards`,
    },
    "&.portal-transitioning .portal-recents": {
      animation: `${fadeOut} 200ms ease-out forwards`,
    },
    "&.portal-transitioning .portal-input-wrapper": {
      animation: `${fadeOut} 350ms ease-out forwards`,
    },
    "&.portal-transitioning .portal-hint": {
      animation: `${fadeOut} 150ms ease-out forwards`,
    },

    // Setup state
    ".portal-setup-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      paddingTop: 64,
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: "16px 20px",
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
    threads,
    currentThreadId,
    selectedModel: _selectedModel,
    sendMessage,
    newThread,
    selectThread,
    deleteThread: _deleteThread,
    setSelectedModel,
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

  // Navigate to chat route after creating thread and sending message
  const sendAndNavigate = useCallback(
    async (text: string) => {
      const threadId = await newThread();
      if (threadId) {
        const content: MessageContent[] = [{ type: "text", text }];
        const message: Message = {
          type: "message",
          role: "user",
          content,
          thread_id: threadId,
          created_at: new Date().toISOString(),
        };
        await sendMessage(message);
        navigate(`/chat/${threadId}`);
      }
    },
    [newThread, sendMessage, navigate]
  );

  // Handle send from idle state
  const handleIdleSend = useCallback(
    async (text: string) => {
      setSearchQuery("");
      setDebouncedQuery("");

      if (!hasConfiguredProvider) {
        setPendingMessage(text);
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
        sendAndNavigate(text);
      }, 400);
    },
    [hasConfiguredProvider, sendAndNavigate]
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

      // Send the pending message and navigate to chat
      if (pendingMessage) {
        setPendingMessage(null);
        await sendAndNavigate(pendingMessage);
      }
    },
    [pendingMessage, setSelectedModel, sendAndNavigate]
  );

  // Handle clicking a recent chat thread — fade out then navigate
  const handleThreadClick = useCallback(
    (threadId: string) => {
      setIsTransitioning(true);
      setTimeout(() => {
        selectThread(threadId);
        navigate(`/chat/${threadId}`);
      }, 400);
    },
    [selectThread, navigate]
  );

  // Handle clicking a recent workflow — navigate directly
  const handleWorkflowItemClick = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

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
            disabled={isTransitioning}
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
            />
          </div>
        )}

        {!isReturningUser && !isTransitioning && (
          <div className="portal-hint">Type anything to get started</div>
        )}
      </div>
    </Box>
  );
};

export default memo(Portal);
