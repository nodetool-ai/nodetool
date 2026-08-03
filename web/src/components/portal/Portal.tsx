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
import { usePanelStore } from "../../stores/PanelStore";
import { LanguageModel } from "../../stores/ApiTypes";
import PortalSetupFlow from "./PortalSetupFlow";
import DashboardHero from "./DashboardHero";
import DashboardDownloads from "./DashboardDownloads";
import GettingStartedChecklist from "./GettingStartedChecklist";
import DashboardTemplates from "./DashboardTemplates";
import DashboardTutorials from "./DashboardTutorials";
import DashboardWorkflows from "./DashboardWorkflows";
import DashboardFooter from "./DashboardFooter";
import { useCreateStarterWorkflow } from "../../hooks/useCreateStarterWorkflow";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";
import { Box, SPACING, getSpacingPx } from "../ui_primitives";

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
      paddingBottom: getSpacingPx(SPACING.md)
    },

    // Setup state (no provider configured yet)
    ".portal-setup-container": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: `0 ${getSpacingPx(SPACING.xxl)}`,
      paddingTop: getSpacingPx(SPACING.md)
    },
    ".portal-setup-message": {
      maxWidth: 480,
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxl)}` // was 16px 20px
    }
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [portalState, setPortalState] = useState<PortalState>("idle");
  const [pendingTrack, setPendingTrack] = useState<WelcomeTrackId | null>(null);

  // The dashboard wants the full width; collapse the left panel on entry.
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const { setSelectedModel } = usePortalChat();
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

  const handleSetupComplete = useCallback(
    (defaultModel: string | null) => {
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
      }
    },
    [pendingTrack, setSelectedModel, createStarterWorkflow]
  );

  const handleSetupBack = useCallback(() => {
    setPendingTrack(null);
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
          />
          <GettingStartedChecklist
            hasConfiguredProvider={hasConfiguredProvider}
            onConnectProvider={handleConnectProvider}
            onOpenTemplates={handleGettingStarted}
            onCreateWorkflow={handleCreateNewWorkflow}
          />
          <DashboardTutorials />
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
