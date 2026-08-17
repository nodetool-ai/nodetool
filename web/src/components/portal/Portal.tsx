// web/src/components/portal/Portal.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useDashboardMode } from "../../hooks/useDashboardMode";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { useHasConfiguredProvider } from "../../hooks/useHasConfiguredProvider";
import { usePanelStore } from "../../stores/PanelStore";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import DashboardHero from "./DashboardHero";
import DashboardActivity from "./DashboardActivity";
import DashboardAgentSessions from "./DashboardAgentSessions";
import DashboardDownloads from "./DashboardDownloads";
import { DashboardColumn, wrapStyles } from "./dashboardChrome";
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
import {
  Box,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

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

/** Two columns for the returning dashboard: the user's work, and a rail. */
const columnStyles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: getSpacingPx(SPACING.xxl),
    alignItems: "start",
    paddingTop: getSpacingPx(SPACING.md),
    [theme.breakpoints.down("lg")]: {
      gridTemplateColumns: "minmax(0, 1fr)"
    },
    ".dash-main": {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.md)
    },
    ".dash-rail": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.lg),
      position: "sticky",
      top: getSpacingPx(SPACING.md),
      [theme.breakpoints.down("lg")]: {
        position: "static"
      }
    },
    ".dash-rail-panel": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      // The checklist retires itself once complete; without this the panel
      // would stay behind as an empty box.
      "&:empty": { display: "none" }
    }
  });

/** A start the user asked for before a provider was configured. */
interface PendingStart {
  trackId: WelcomeTrackId;
  prompt: string;
}

const Portal: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [pendingStart, setPendingStart] = useState<PendingStart | null>(null);

  // The dashboard wants the full width; collapse the left panel on entry.
  useEffect(() => {
    usePanelStore.getState().setVisibility(false);
  }, []);

  const { sortedWorkflows, isLoadingWorkflows } = useDashboardData();
  const { handleCreateNewWorkflow } = useWorkflowActions();
  const mode = useDashboardMode({
    workflowCount: sortedWorkflows.length,
    isLoadingWorkflows
  });

  const startTrackChat = useStartTrackChat();
  const hasConfiguredProvider = useHasConfiguredProvider();

  const handleStart = useCallback(
    (trackId: WelcomeTrackId, prompt: string) => {
      // The first send needs a model; route key-less users through the shared
      // provider onboarding first so that send doesn't fail.
      if (!hasConfiguredProvider) {
        setPendingStart({ trackId, prompt });
        const track = WELCOME_TRACKS.find((t) => t.id === trackId);
        const onboarding: Parameters<typeof openProviderOnboarding>[0] = {};
        if (track) {
          onboarding.capability = track.capability;
          onboarding.reason = `Almost there — your ${track.label} starter needs a model to run.`;
        }
        openProviderOnboarding(onboarding);
        return;
      }
      void startTrackChat(trackId, prompt);
    },
    [hasConfiguredProvider, startTrackChat]
  );

  // Starting without a provider parks the request here; once one is connected
  // the chat opens on its own, so the user finishes the thing they asked for
  // rather than landing back on the dashboard.
  const startChat = useRef(startTrackChat);
  startChat.current = startTrackChat;
  useEffect(() => {
    if (!pendingStart || !hasConfiguredProvider) {
      return;
    }
    const { trackId, prompt } = pendingStart;
    setPendingStart(null);
    void startChat.current(trackId, prompt);
  }, [pendingStart, hasConfiguredProvider]);

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

  // A fresh agent chat, through the same gate the hero's agent track uses —
  // key-less users get provider onboarding first, then the chat opens.
  const handleNewAgentSession = useCallback(() => {
    handleStart("agent", "");
  }, [handleStart]);

  return (
    <Box css={styles(theme)}>
      <div className="dashboard-scroll">
        <main>
          <DashboardDownloads />
          <DashboardHero
            mode={mode}
            onStart={handleStart}
            onOpenEmptyCanvas={handleCreateNewWorkflow}
            onOpenSettings={handleOpenSettings}
          />
          {/* A returning user's own work leads — agent sessions first, then
              workflows — with the checklist and task activity in a rail
              beside it. A first-run user has no work yet, so the material
              that teaches them leads instead. */}
          {mode === "returning" ? (
            <div css={[wrapStyles(theme), columnStyles(theme)]}>
              <div className="dash-main">
                <DashboardColumn>
                  <DashboardAgentSessions
                    onNewSession={handleNewAgentSession}
                  />
                  <DashboardWorkflows
                    workflows={sortedWorkflows}
                    isLoading={isLoadingWorkflows}
                    onOpenWorkflow={handleOpenWorkflow}
                    onCreateNew={handleCreateNewWorkflow}
                  />
                  <DashboardTemplates />
                  <DashboardTutorials variant="compact" />
                </DashboardColumn>
              </div>
              <aside className="dash-rail">
                <div className="dash-rail-panel">
                  <GettingStartedChecklist
                    variant="inline"
                    hasConfiguredProvider={hasConfiguredProvider}
                    onConnectProvider={handleConnectProvider}
                    onOpenTemplates={handleOpenTemplates}
                    onCreateWorkflow={handleCreateNewWorkflow}
                  />
                </div>
                <DashboardActivity
                  workflows={sortedWorkflows}
                  onOpenWorkflow={handleOpenWorkflow}
                />
              </aside>
            </div>
          ) : (
            <>
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
            </>
          )}
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
