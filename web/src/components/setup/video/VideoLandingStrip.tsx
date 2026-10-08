/**
 * What the timeline shows after the flow hands it back (PRD § 8.4).
 *
 * Three things, and only while they are true: how much of the batch is still
 * rendering (with a duration **only when one was measured** — D14), a
 * `Retry N failed` action while any clip failed, and the two next steps once
 * the cut is whole.
 *
 * The duration is what this model and kind took last time, not a countdown:
 * nothing here subtracts the elapsed time of the running job, so it is named
 * for what it is rather than sold as time left (F23).
 *
 * It renders nothing on a sequence that never went through the flow, so the
 * editor is untouched for everyone else. The creator can dismiss it, and the
 * dismissal is written onto the sequence's setup so it stays dismissed after a
 * reload. Export is offered only once the timeline holds a clip.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  Caption,
  CloseButton,
  EditorButton,
  FlexRow,
  GAP,
  PADDING,
  Text
} from "../../ui_primitives";
import {
  useTimelineStore,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
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
 * How long this batch's models usually take, or null when nothing measured it.
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

/** The setup field that records a dismissed strip. */
export const LANDING_DISMISSED = "landing_dismissed";

type SetupPatch = Parameters<
  ReturnType<TimelineStoreApi["getState"]>["setSetup"]
>[0];

const VideoLandingStripInternal: React.FC<VideoLandingStripProps> = ({
  onExport
}) => {
  const stage = useTimelineStore((state) => state.setup?.stage);
  const clips = useTimelineStore((state) => state.clips);
  const setScriptEnabled = useTimelineStore((state) => state.setScriptEnabled);
  const dismissed = useTimelineStore(
    (state) => state.setup?.[LANDING_DISMISSED] === true
  );
  const setSetup = useTimelineStore((state) => state.setSetup);
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
  // `timelineSetup` is a passthrough schema, so the field persists, but the
  // store action's patch type lists only the fields it predates. The cast
  // stays at this one boundary, as in `applyBeatPlan`.
  const handleDismiss = useCallback(
    () => setSetup({ [LANDING_DISMISSED]: true } as unknown as SetupPatch),
    [setSetup]
  );

  // A sequence that never went through the flow gets nothing, and neither
  // does one whose creator dismissed the strip.
  if (stage === undefined || dismissed) {
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
          {remaining === null
            ? ""
            : ` · typical duration ${formatSeconds(remaining)}`}
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
          {clips.length > 0 ? (
            <EditorButton
              variant="text"
              onClick={onExport}
              disabled={!onExport}
            >
              Export
            </EditorButton>
          ) : null}
          <EditorButton variant="text" onClick={handleCaptions}>
            Add captions
          </EditorButton>
        </>
      ) : null}
      <CloseButton
        onClick={handleDismiss}
        tooltip="Hide next steps"
        sx={{ marginLeft: "auto" }}
      />
    </FlexRow>
  );
};

export const VideoLandingStrip = memo(VideoLandingStripInternal);
VideoLandingStrip.displayName = "VideoLandingStrip";

export default VideoLandingStrip;
