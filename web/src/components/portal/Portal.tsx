// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useHasConfiguredProvider } from "../../hooks/useHasConfiguredProvider";
import { usePanelStore } from "../../stores/PanelStore";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import DashboardHero from "./DashboardHero";
import DashboardDownloads from "./DashboardDownloads";
import GettingStartedChecklist from "./GettingStartedChecklist";
import DashboardTemplates, {
  DASHBOARD_TEMPLATES_SECTION_ID
} from "./DashboardTemplates";
import DashboardTutorials from "./DashboardTutorials";
import DashboardWorkflows from "./DashboardWorkflows";
import DashboardFooter from "./DashboardFooter";
import { useStartTrackChat } from "../../hooks/useStartTrackChat";
import { openSettingsTab } from "../workspace/openPageTab";
import { WELCOME_TRACKS, type WelcomeTrackId } from "./welcomeTracks";
import { Box, SPACING, getSpacingPx } from "../ui_primitives";

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
    main: {
      paddingBottom: getSpacingPx(SPACING.md)
    }
  });

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [pendingTrack, setPendingTrack] = useState<WelcomeTrackId | null>(null);

  // The dashboard wants the full width; collapse the left panel on entry.
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const { sortedWorkflows, isLoadingWorkflows } = useDashboardData();
  const { handleCreateNewWorkflow } = useWorkflowActions();

  const startTrackChat = useStartTrackChat();
  const hasConfiguredProvider = useHasConfiguredProvider();

  const handlePickTrack = useCallback(
    (trackId: WelcomeTrackId) => {
      // The first send needs a model; route key-less users through the shared
      // provider onboarding first so that send doesn't fail.
      if (!hasConfiguredProvider) {
        setPendingTrack(trackId);
        const track = WELCOME_TRACKS.find((t) => t.id === trackId);
        const onboarding: Parameters<typeof openProviderOnboarding>[0] = {};
        if (track) {
          onboarding.capability = track.capability;
          onboarding.reason = `Almost there — your ${track.label} starter needs a model to run.`;
        }
        openProviderOnboarding(onboarding);
        return;
      }
      void startTrackChat(trackId);
    },
    [hasConfiguredProvider, startTrackChat]
  );

  // Picking a track without a provider parks it here; once one is connected the
  // chat opens on its own, so the user finishes the thing they asked for
  // rather than landing back on the dashboard.
  const startChat = useRef(startTrackChat);
  startChat.current = startTrackChat;
  useEffect(() => {
    if (!pendingTrack || !hasConfiguredProvider) {
      return;
    }
    const trackId = pendingTrack;
    setPendingTrack(null);
    void startChat.current(trackId);
  }, [pendingTrack, hasConfiguredProvider]);

  const handleOpenWorkflow = useCallback(
    (workflowId: string) => {
      navigate(`/editor/${workflowId}`);
    },
    [navigate]
  );

  const handleOpenSettings = useCallback(() => {
    openSettingsTab();
  }, []);

  // Already on the dashboard, so "browse templates" is a scroll, not a route
  // change. The templates section owns the anchor id.
  const handleOpenTemplates = useCallback(() => {
    const section = document.getElementById(DASHBOARD_TEMPLATES_SECTION_ID);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      navigate("/examples");
    }
  }, [navigate]);

  const handleConnectProvider = useCallback(() => {
    openProviderOnboarding();
  }, []);

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
            onOpenTemplates={handleOpenTemplates}
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
            onGettingStarted={handleOpenTemplates}
          />
        </main>
      </div>
    </Box>
  );
};

export default memo(Portal);
