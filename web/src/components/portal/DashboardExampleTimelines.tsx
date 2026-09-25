/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ExampleTimelineSummary } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { useExampleTimelines, useInstallExampleTimeline } from "../../hooks/useTimelineSequence";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";
import { useNotificationStore } from "../../stores/NotificationStore";
import { creationProjectId, useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { BORDER_RADIUS, EmptyState, LoadingSpinner, MOTION, SPACING, VideoPlayer, getSpacingPx } from "../ui_primitives";
import { SectionHeader, useSectionWrap } from "./dashboardChrome";

const styles = (theme: Theme) => css({
  paddingTop: getSpacingPx(SPACING.xxl),
  paddingBottom: getSpacingPx(SPACING.xxxl),
  ".timeline-lede": {
    margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
    fontSize: "var(--fontSizeSmall)",
    color: theme.vars.palette.text.secondary
  },
  ".timeline-grid": {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    gap: getSpacingPx(SPACING.md)
  },
  ".timeline-card": {
    minWidth: 0,
    overflow: "hidden",
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    background: theme.vars.palette.c_node_bg
  },
  ".timeline-preview": { aspectRatio: "16 / 9", background: theme.vars.palette.common.black },
  ".timeline-body": {
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.xs),
    padding: getSpacingPx(SPACING.md)
  },
  ".timeline-name": { fontSize: "var(--fontSizeNormal)" },
  ".timeline-description": { fontSize: "var(--fontSizeSmaller)", color: theme.vars.palette.text.secondary },
  ".timeline-meta": { fontSize: "var(--fontSizeSmaller)", color: theme.vars.palette.text.disabled },
  ".timeline-action": {
    alignSelf: "flex-start",
    padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
    border: `1px solid ${theme.vars.palette.primary.main}`,
    borderRadius: BORDER_RADIUS.sm,
    background: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    cursor: "pointer",
    transition: MOTION.background,
    "&:hover": { background: theme.vars.palette.primary.dark },
    "&:disabled": { opacity: 0.5, cursor: "wait" }
  },
  ".timeline-state": { display: "flex", justifyContent: "center", padding: `${getSpacingPx(SPACING.xl)} 0` }
});

interface TimelineCardProps {
  timeline: ExampleTimelineSummary;
  installing: boolean;
  onInstall: (timeline: ExampleTimelineSummary) => void;
}

const TimelineCard = memo(function TimelineCard({ timeline, installing, onInstall }: TimelineCardProps) {
  const poster = useResolvedMediaUri(timeline.posterUri);
  return (
    <article className="timeline-card">
      <div className="timeline-preview">
        <VideoPlayer locator={timeline.videoUri} poster={poster} label={`${timeline.name} preview`} prominentPlay />
      </div>
      <div className="timeline-body">
        <span className="timeline-name">{timeline.name}</span>
        <span className="timeline-description">{timeline.description}</span>
        <span className="timeline-meta">{Math.round(timeline.durationMs / 1000)} seconds · {timeline.clipCount} editable clips · {timeline.fps} fps</span>
        <button className="timeline-action" type="button" disabled={installing} onClick={() => onInstall(timeline)}>
          {installing ? "Adding timeline…" : "Open editable timeline"}
        </button>
      </div>
    </article>
  );
});

const DashboardExampleTimelines = () => {
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
        openTab({ type: "timeline", ref: created.id, mode: "edit", title: created.name, projectId: created.projectId });
        navigate("/workspace");
      },
      onError: (error) => {
        addNotification({ type: "error", alert: true, content: `Couldn't add ${timeline.name}: ${error.message}` });
      }
    });
  }, [addNotification, install, navigate, openTab]);

  const timelines = data ?? [];
  return (
    <section css={styles(theme)} aria-label="Example timelines">
      <div css={sectionWrap}>
        <SectionHeader title="Start from a timeline" count={`${timelines.length} timelines`} />
        <p className="timeline-lede">Watch the finished film, then open its editable timeline to make your own version.</p>
        {isLoading ? (
          <div className="timeline-state"><LoadingSpinner size="medium" text="Loading timelines" /></div>
        ) : isError ? (
          <div className="timeline-state"><EmptyState variant="error" title="Couldn't load timelines" description="Try again in a moment." actionText="Retry" onAction={() => refetch()} /></div>
        ) : timelines.length === 0 ? (
          <div className="timeline-state"><EmptyState variant="no-data" title="No timelines available" description="Example timelines will appear here when this install ships them." /></div>
        ) : (
          <div className="timeline-grid">
            {timelines.map((timeline) => (
              <TimelineCard key={timeline.slug} timeline={timeline} installing={install.isPending && install.variables?.slug === timeline.slug} onInstall={handleInstall} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardExampleTimelines);
