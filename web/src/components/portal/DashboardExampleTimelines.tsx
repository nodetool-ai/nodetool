/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ExampleTimelineSummary } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { useExampleTimelines, useInstallExampleTimeline } from "../../hooks/useTimelineSequence";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { useNotificationStore } from "../../stores/NotificationStore";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import {
  AutoGrid,
  BORDER_RADIUS,
  EditorButton,
  EmptyState,
  LoadingSpinner,
  SPACING,
  TYPOGRAPHY,
  VideoPlayer,
  getSpacingPx
} from "../ui_primitives";
import { NO_EXAMPLE_NEEDS } from "../../utils/exampleNeeds";
import { DashboardSectionHeader, useSectionWrap } from "./dashboardChrome";
import ExampleNeedsPill from "./ExampleNeedsPill";

const styles = (theme: Theme) => css({
  paddingTop: getSpacingPx(SPACING.xxl),
  paddingBottom: getSpacingPx(SPACING.xxxl),
  ".timeline-lede": {
    margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
    ...TYPOGRAPHY.sans.caption,
    color: theme.vars.palette.text.secondary
  },
  ".timeline-card": {
    minWidth: 0,
    overflow: "hidden",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.md,
    background: theme.vars.palette.c_node_bg
  },
  ".timeline-preview": { aspectRatio: "16 / 9", background: theme.vars.palette.common.black },
  ".timeline-body": {
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.xs),
    padding: getSpacingPx(SPACING.md)
  },
  ".timeline-name": TYPOGRAPHY.sans.label,
  ".timeline-description": { ...TYPOGRAPHY.sans.caption, color: theme.vars.palette.text.secondary },
  ".timeline-meta": { ...TYPOGRAPHY.sans.caption, color: theme.vars.palette.text.disabled },
  ".timeline-state": { display: "flex", justifyContent: "center", padding: `${getSpacingPx(SPACING.xl)} 0` }
});

interface TimelineCardProps {
  timeline: ExampleTimelineSummary;
  installing: boolean;
  onInstall: (timeline: ExampleTimelineSummary) => void;
}

const TimelineCard = memo(function TimelineCard({ timeline, installing, onInstall }: TimelineCardProps) {
  const { t } = useTranslation();
  const poster = useResolvedMediaUri(timeline.posterUri);
  return (
    <article className="timeline-card">
      <div className="timeline-preview">
        <VideoPlayer locator={timeline.videoUri} poster={poster} label={t("pass3_17.timelines.previewLabel", { name: timeline.name })} prominentPlay />
      </div>
      <div className="timeline-body">
        <span className="timeline-name">{timeline.name}</span>
        <span className="timeline-description">{timeline.description}</span>
        <ExampleNeedsPill needs={NO_EXAMPLE_NEEDS} />
        <span className="timeline-meta">{t("pass3_17.timelines.metadata", { seconds: Math.round(timeline.durationMs / 1000), count: timeline.clipCount, fps: timeline.fps })}</span>
        <EditorButton
          variant="contained"
          density="compact"
          disabled={installing}
          onClick={() => onInstall(timeline)}
          sx={{ alignSelf: "flex-start" }}
        >
          {installing ? t("pass3_17.timelines.adding") : t("pass3_17.timelines.install")}
        </EditorButton>
      </div>
    </article>
  );
});

const DashboardExampleTimelines = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { data, isLoading, isError, refetch } = useExampleTimelines();
  const install = useInstallExampleTimeline();

  const handleInstall = useCallback((timeline: ExampleTimelineSummary) => {
    if (install.isPending) return;
    install.mutate({ slug: timeline.slug, projectId: creationProjectId() }, {
      onSuccess: (created) => {
        openTab({ type: "timeline", ref: created.id, mode: "view", title: created.name, projectId: created.projectId });
        navigate("/workspace");
        useOnboardingStore.getState().markStep("keep-creating");
      },
      onError: (error) => {
        addNotification({ type: "error", alert: true, content: t("pass3_17.timelines.addError", { name: timeline.name, error: error.message }) });
      }
    });
  }, [addNotification, install, navigate, openTab, t]);

  const timelines = data ?? [];
  return (
    <section css={styles(theme)} aria-label={t("pass3_17.timelines.ariaLabel")}>
      <div css={sectionWrap}>
        <DashboardSectionHeader title={t("pass3_17.timelines.sectionTitle")} count={t("pass3_17.timelines.count", { count: timelines.length })} />
        <p className="timeline-lede">{t("pass3_17.timelines.lede")}</p>
        {isLoading ? (
          <div className="timeline-state"><LoadingSpinner size="medium" text={t("pass3_17.timelines.loading")} /></div>
        ) : isError ? (
          <div className="timeline-state"><EmptyState variant="error" title={t("pass3_17.timelines.loadErrorTitle")} description={t("pass3_17.common.tryAgain")} actionText={t("pass3_17.common.retry")} onAction={() => refetch()} /></div>
        ) : timelines.length === 0 ? (
          <div className="timeline-state"><EmptyState variant="no-data" title={t("pass3_17.timelines.emptyTitle")} description={t("pass3_17.timelines.emptyDescription")} /></div>
        ) : (
          <AutoGrid minItemWidth={360} fill="fit">
            {timelines.map((timeline) => (
              <TimelineCard key={timeline.slug} timeline={timeline} installing={install.isPending && install.variables?.slug === timeline.slug} onInstall={handleInstall} />
            ))}
          </AutoGrid>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleTimelines);
