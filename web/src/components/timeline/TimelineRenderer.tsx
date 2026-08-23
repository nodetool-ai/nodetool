/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useLayoutEffect, useMemo } from "react";
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
import {
  createTimelineInstance,
  TimelineProvider
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

interface TimelineRendererProps {
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
        showDuration={false}
        showFps={false}
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

const TimelineRenderer: React.FC<TimelineRendererProps> = (props) => {
  // First sequence only — identity changes reload in useLayoutEffect.
  const instance = useMemo(() => {
    const next = createTimelineInstance();
    next.doc.getState().loadSequence(props.sequence);
    next.playback.getState().seek(firstPreviewTime(props.sequence));
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    instance.doc.getState().loadSequence(props.sequence);
    instance.playback.getState().seek(firstPreviewTime(props.sequence));
  }, [instance, props.sequence]);

  useEffect(() => {
    return () => {
      instance.playback.getState().stop();
      instance.doc.getState().reset();
    };
  }, [instance]);

  return (
    <TimelineProvider instance={instance} active={false}>
      <TimelineRendererContent {...props} />
    </TimelineProvider>
  );
};

export default memo(TimelineRenderer);
