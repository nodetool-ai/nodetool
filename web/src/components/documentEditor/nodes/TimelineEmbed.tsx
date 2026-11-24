import { lazy, Suspense, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useTimeline } from "../../../hooks/useTimelineSequence";
import { Box, Caption, LoadingSpinner } from "../../ui_primitives";
import { EmbedCard } from "./EmbedCard";

const LazyTimelinePlayer = lazy(() => import("../../timeline/TimelinePlayer"));

/** The player keeps the timeline's frame: 16:9 unless the sequence says otherwise. */
const DEFAULT_ASPECT = "16 / 9";

/**
 * A timeline, played in place. The player is not the active timeline surface,
 * so keys typed in the document never reach its transport.
 */
const TimelineEmbed = ({ timelineId, alt }: { timelineId: string; alt: string }) => {
  const { t } = useTranslation();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { data: timeline, isLoading } = useTimeline(timelineId);

  const open = useCallback(() => {
    if (!timeline) {
      return;
    }
    openTab({
      type: "timeline",
      ref: timeline.id,
      mode: "edit",
      title: timeline.name,
      projectId: timeline.projectId
    });
  }, [timeline, openTab]);

  if (isLoading) {
    return (
      <Caption size="small" color="muted" component="span">
        {alt || t("documentEditor.embed.loadingTimeline")}
      </Caption>
    );
  }
  if (!timeline) {
    return (
      <Caption size="small" color="muted" component="span">
        {t("documentEditor.embed.timelineMissing", { name: alt || timelineId })}
      </Caption>
    );
  }
  const aspectRatio =
    timeline.width > 0 && timeline.height > 0
      ? `${timeline.width} / ${timeline.height}`
      : DEFAULT_ASPECT;
  return (
    <EmbedCard
      caption={alt || timeline.name}
      openLabel={t("documentEditor.embed.openTimeline")}
      onOpen={open}
      testId="document-timeline-embed"
    >
      <Box component="span" sx={{ display: "block", width: "100%", aspectRatio }}>
        <Suspense fallback={<LoadingSpinner size="small" />}>
          <LazyTimelinePlayer sequenceId={timeline.id} active={false} />
        </Suspense>
      </Box>
    </EmbedCard>
  );
};

export default TimelineEmbed;
