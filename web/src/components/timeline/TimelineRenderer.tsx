/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TimelineSequence } from "@nodetool-ai/timeline";

import {
  BORDER_RADIUS,
  Caption,
  FlexColumn,
  PADDING,
  SPACING,
  Z_INDEX
} from "../ui_primitives";
import { TimelineProvider } from "../../stores/timeline/TimelineInstance";
import {
  useTimelinePlaybackStoreApi,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineInstance";
import { PreviewArea } from "./preview/PreviewArea";

const rendererStyles = (theme: Theme) =>
  css({
    "&.timeline-renderer": {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    ".timeline-renderer__meta": {
      position: "absolute",
      right: theme.spacing(SPACING.xs),
      top: theme.spacing(SPACING.xs),
      pointerEvents: "none",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.72)`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.secondary,
      zIndex: Z_INDEX.raised
    }
  });

export interface TimelineRendererProps {
  sequence: TimelineSequence;
  className?: string;
  ariaLabel?: string;
  showMetadata?: boolean;
}

const firstPreviewTime = (sequence: TimelineSequence): number => {
  const starts = sequence.clips
    .map((clip) => clip.startMs)
    .filter((startMs) => Number.isFinite(startMs) && startMs >= 0);
  return starts.length > 0 ? Math.min(...starts) : 0;
};

const TimelineRendererContent: React.FC<TimelineRendererProps> = ({
  sequence,
  className,
  ariaLabel = "Timeline preview",
  showMetadata = false
}) => {
  const theme = useTheme();
  const styles = useMemo(() => rendererStyles(theme), [theme]);
  const timelineStore = useTimelineStoreApi();
  const playbackStore = useTimelinePlaybackStoreApi();

  useEffect(() => {
    timelineStore.getState().loadSequence(sequence);
    playbackStore.getState().seek(firstPreviewTime(sequence));
    return () => {
      playbackStore.getState().stop();
      timelineStore.getState().reset();
    };
  }, [playbackStore, sequence, timelineStore]);

  const rootClassName = className
    ? `timeline-renderer ${className}`
    : "timeline-renderer";

  return (
    <div
      css={styles}
      className={rootClassName}
      role="img"
      aria-label={ariaLabel}
      data-testid="timeline-renderer"
    >
      <PreviewArea
        fps={sequence.fps}
        sequenceWidth={sequence.width}
        sequenceHeight={sequence.height}
      />
      {showMetadata && (
        <FlexColumn className="timeline-renderer__meta" padding={PADDING.micro}>
          <Caption>
            {sequence.width} × {sequence.height} · {sequence.clips.length} clips
          </Caption>
        </FlexColumn>
      )}
    </div>
  );
};

const TimelineRenderer: React.FC<TimelineRendererProps> = (props) => (
  <TimelineProvider active={false}>
    <TimelineRendererContent {...props} />
  </TimelineProvider>
);

export default memo(TimelineRenderer);
