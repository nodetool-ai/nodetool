/**
 * What the timeline shows after the flow hands it back (PRD § 8.4).
 *
 * Three things, and only while they are true: how much of the batch is still
 * rendering (with a remaining time **only when one was measured** — D14), a
 * `Retry N failed` action while any clip failed, and the two next steps once
 * the cut is whole.
 *
 * It renders nothing on a sequence that never went through the flow, so the
 * editor is untouched for everyone else.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  Caption,
  EditorButton,
  FlexRow,
  GAP,
  PADDING,
  Text
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useRetryFailedClips } from "../../../hooks/timeline/useRetryFailedClips";
import {
  durationBucketKey,
  measuredDurationMs,
  useDirectGenPendingStore
} from "../../../hooks/timeline/directGenPending";
import { formatSeconds } from "./ReviewStep";

export interface VideoLandingStripProps {
  /** Renders the finished cut. The editor already owns the action. */
  onExport?: () => void;
}

/**
 * What is left to wait for, or null when nothing measured it.
 *
 * D14: no record, no text. A first batch on a model nobody has run says how
 * many clips are rendering and stops there, rather than inventing a number the
 * creator would then hold us to.
 */
export function remainingMs(
  buckets: readonly string[],
  samples: Record<string, number[]>
): number | null {
  let longest: number | null = null;
  for (const bucket of buckets) {
    const measured = measuredDurationMs(samples[bucket]);
    if (measured !== null) {
      longest = longest === null ? measured : Math.max(longest, measured);
    }
  }
  return longest;
}

const VideoLandingStripInternal: React.FC<VideoLandingStripProps> = ({
  onExport
}) => {
  const stage = useTimelineStore((state) => state.setup?.stage);
  const clips = useTimelineStore((state) => state.clips);
  const setScriptEnabled = useTimelineStore((state) => state.setScriptEnabled);
  const samples = useDirectGenPendingStore((state) => state.durationSamples);
  const { failedClipIds, retryAll } = useRetryFailedClips();

  const rendering = useMemo(
    () => clips.filter((clip) => clip.status === "generating"),
    [clips]
  );
  const buckets = useMemo(() => {
    const found: string[] = [];
    for (const { bindingKind, model } of rendering) {
      if (bindingKind && model) {
        found.push(durationBucketKey(bindingKind, model));
      }
    }
    return found;
  }, [rendering]);
  const remaining = remainingMs(buckets, samples);

  const handleCaptions = useCallback(
    () => setScriptEnabled(true),
    [setScriptEnabled]
  );
  const handleRetry = useCallback(() => void retryAll(), [retryAll]);

  // A sequence that never went through the flow gets nothing.
  if (stage === undefined) {
    return null;
  }

  const done = rendering.length === 0 && failedClipIds.length === 0;

  return (
    <FlexRow
      gap={GAP.normal}
      align="center"
      padding={PADDING.compact}
      role="region"
      aria-label="Video next steps"
    >
      {rendering.length > 0 ? (
        <Text size="small" color="secondary" role="status">
          {`Rendering ${rendering.length} clip${rendering.length === 1 ? "" : "s"}`}
          {remaining === null ? "" : ` · about ${formatSeconds(remaining)} left`}
        </Text>
      ) : null}
      {failedClipIds.length > 0 ? (
        <EditorButton variant="outlined" onClick={handleRetry}>
          {`Retry ${failedClipIds.length} failed`}
        </EditorButton>
      ) : null}
      {done ? (
        <>
          <Caption color="secondary">Next:</Caption>
          <EditorButton variant="text" onClick={onExport} disabled={!onExport}>
            Export
          </EditorButton>
          <EditorButton variant="text" onClick={handleCaptions}>
            Add captions
          </EditorButton>
        </>
      ) : null}
    </FlexRow>
  );
};

export const VideoLandingStrip = memo(VideoLandingStripInternal);
VideoLandingStrip.displayName = "VideoLandingStrip";

export default VideoLandingStrip;
