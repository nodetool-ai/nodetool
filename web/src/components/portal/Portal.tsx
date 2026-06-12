// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePortalChat } from "./usePortalChat";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import useSecretsStore from "../../stores/SecretsStore";
import { useEnsureChatConnected } from "../../hooks/useEnsureChatConnected";
import { usePanelStore } from "../../stores/PanelStore";
import { Message, MessageContent, LanguageModel } from "../../stores/ApiTypes";
import ComposerSlot from "../chat/composer/ComposerSlot";
import PortalSetupFlow from "./PortalSetupFlow";
import DashboardHero from "./DashboardHero";
import DashboardDownloads from "./DashboardDownloads";
import GettingStartedChecklist from "./GettingStartedChecklist";
import DashboardTemplates from "./DashboardTemplates";
import DashboardWorkflows from "./DashboardWorkflows";
import DashboardFooter from "./DashboardFooter";
import { useCreateStarterWorkflow } from "../../hooks/useCreateStarterWorkflow";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";
import { Box } from "../ui_primitives";

// Secret keys the runtime providers actually read (see
// packages/runtime/src/providers — e.g. GeminiProvider requires
// GEMINI_API_KEY, HuggingFaceProvider requires HF_TOKEN).
const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "HF_TOKEN"
];

type PortalState = "idle" | "setup";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.paper,

    ".dashboard-scroll": {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden"
    },
    "main": {
      paddingBottom: 8
    },

    // Setup state (no provider configured yet)
    ".portal-setup-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 24px",
      paddingTop: 8
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: "16px 20px"
    }
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingTrack, setPendingTrack] = useState<WelcomeTrackId | null>(null);

  useEnsureChatConnected({ disconnectOnUnmount: false });

  // The dashboard wants the full width; collapse the left panel on entry.
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const { selectedModel, sendMessage, newThread, setSelectedModel } =
    usePortalChat();
  const { sortedWorkflows, isLoadingWorkflows } = useDashboardData();
  const { handleCreateNewWorkflow } = useWorkflowActions();

  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);
  const createStarterWorkflow = useCreateStarterWorkflow();

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  const hasConfiguredProvider = useMemo(
    () =>
      secrets.some(
        (s) => KNOWN_PROVIDER_KEYS.includes(s.key) && s.is_configured
      ),
    [secrets]
  );

  const handlePickTrack = useCallback(
    (trackId: WelcomeTrackId) => {
      // A starter workflow needs a model to run; route key-less users through
      // provider setup first so their first Run doesn't fail.
      if (!hasConfiguredProvider) {
        setPendingTrack(trackId);
        setPortalState("setup");
        return;
      }
      createStarterWorkflow(trackId);
    },
    [hasConfiguredProvider, createStarterWorkflow]
  );

  const handleOpenWorkflow = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

  const handleOpenSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleGettingStarted = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const sendAndNavigate = useCallback(
    async (content: MessageContent[], _prompt: string) => {
      const threadId = await newThread();
      if (!threadId) return;
      const message: Message = {
        type: "message",
        role: "user",
        content,
        thread_id: threadId,
        created_at: new Date().toISOString(),
        model: selectedModel?.id
      };
      await sendMessage(message);
      navigate(`/chat/${threadId}`);
    },
    [newThread, sendMessage, navigate, selectedModel]
  );

  const handleSendMessage = useCallback(
    async (content: MessageContent[], prompt: string) => {
      if (!hasConfiguredProvider) {
        setPendingMessage(prompt);
        setPortalState("setup");
        return;
      }
      await sendAndNavigate(content, prompt);
    },
    [hasConfiguredProvider, sendAndNavigate]
  );

  const handleSetupComplete = useCallback(
    async (defaultModel: string | null) => {
      if (defaultModel) {
        const [provider, ...idParts] = defaultModel.split(":");
        const id = idParts.join(":");
        const model: LanguageModel = {
          type: "language_model",
          provider,
          id,
          name: id
        };
        setSelectedModel(model);
      }
      setPortalState("idle");

      if (pendingTrack) {
        const trackId = pendingTrack;
        setPendingTrack(null);
        createStarterWorkflow(trackId);
        return;
      }
      if (pendingMessage) {
        const text = pendingMessage;
        setPendingMessage(null);
        await sendAndNavigate([{ type: "text", text }], text);
      }
    },
    [
      pendingTrack,
      pendingMessage,
      setSelectedModel,
      createStarterWorkflow,
      sendAndNavigate
    ]
  );

  const handleSetupBack = useCallback(() => {
    setPendingTrack(null);
    setPendingMessage(null);
    setPortalState("idle");
  }, []);

  const handleConnectProvider = useCallback(() => {
    setPortalState("setup");
  }, []);

  if (portalState === "setup") {
    const pendingTrackLabel = pendingTrack
      ? WELCOME_TRACKS.find((t) => t.id === pendingTrack)?.label
      : undefined;
    return (
      <Box css={styles(theme)}>
        <div className="portal-setup-container">
          <div className="portal-setup-message">
            <PortalSetupFlow
              onComplete={handleSetupComplete}
              onBack={handleSetupBack}
              trackId={pendingTrack}
              message={
                pendingTrackLabel
                  ? `Almost there — your ${pendingTrackLabel} starter needs a model to run. Connect an AI provider:`
                  : undefined
              }
            />
          </div>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)}>
      <div className="dashboard-scroll">
        <main>
          <DashboardDownloads />
          <DashboardHero
            onPickTrack={handlePickTrack}
            onOpenEmptyCanvas={handleCreateNewWorkflow}
            onOpenSettings={handleOpenSettings}
            composer={
              <ComposerSlot
                className="chat-input-section"
                onSend={handleSendMessage}
              />
            }
          />
          <GettingStartedChecklist
            hasConfiguredProvider={hasConfiguredProvider}
            onConnectProvider={handleConnectProvider}
            onOpenTemplates={handleGettingStarted}
            onCreateWorkflow={handleCreateNewWorkflow}
          />
          <DashboardTemplates />
          <DashboardWorkflows
            workflows={sortedWorkflows}
            isLoading={isLoadingWorkflows}
            onOpenWorkflow={handleOpenWorkflow}
            onCreateNew={handleCreateNewWorkflow}
          />
          <DashboardFooter
            workflowCount={sortedWorkflows.length}
            onGettingStarted={handleGettingStarted}
          />
        </main>
      </div>
    </Box>
  );
};

export default memo(Portal);
