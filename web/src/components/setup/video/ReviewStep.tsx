/**
 * Step 2 of the video flow, second half — the beat review (PRD § 8.2).
 *
 * The plan as numbered rows through the shared `PlanReview`: duration, prompt,
 * transition, voiceover line, every one editable and every edit written
 * straight back onto `setup.beats` — the document is the draft (D4).
 *
 * The header carries the sum of the beat durations against the format's length
 * and turns a warning color when it runs over, because a plan that is a minute
 * long in a fifteen-second ad is the cheapest possible thing to find out now.
 */

import React, { memo, useCallback, useMemo } from "react";

import { FlexColumn, FlexRow, GAP, Text } from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";
import { videoFormatById } from "./formats";

/** "12s", "1m 04s" — a length as a creator reads it. */
export const formatSeconds = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
};

/** Whole seconds in, milliseconds out; a blank or bad entry keeps the old one. */
const parseSeconds = (value: string, fallbackMs: number): number => {
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.round(seconds * 1000)
    : fallbackMs;
};

export interface ReviewStepProps {
  /** Re-runs the Director with the edited plan as context. */
  onReplan: () => void;
  replanPending?: boolean;
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  onReplan,
  replanPending
}) => {
  const beats = useTimelineStore((state) => state.setup?.beats);
  const formatId = useTimelineStore((state) => state.setup?.format);
  const updateBeat = useTimelineStore((state) => state.updateBeat);
  const format = videoFormatById(formatId);

  const totalMs = useMemo(
    () => (beats ?? []).reduce((sum, beat) => sum + beat.duration_ms, 0),
    [beats]
  );
  const over = format ? totalMs > format.durationMs : false;

  const sections = useMemo<PlanReviewSection[]>(
    () =>
      (beats ?? []).map((beat, index) => ({
        id: beat.id,
        header: `${index + 1}. ${formatSeconds(beat.duration_ms)}`,
        rows: [
          {
            id: `${beat.id}-prompt`,
            label: "Beat",
            value: beat.prompt,
            multiline: true,
            onChange: (value: string) => updateBeat(beat.id, { prompt: value })
          },
          {
            id: `${beat.id}-duration`,
            label: "Seconds",
            value: String(Math.round(beat.duration_ms / 1000)),
            onChange: (value: string) =>
              updateBeat(beat.id, {
                duration_ms: parseSeconds(value, beat.duration_ms)
              })
          },
          {
            id: `${beat.id}-transition`,
            label: "Transition",
            value: beat.transition ?? "",
            placeholder: "cut — or crossfade, dipToColor, wipe, push, slide, zoom",
            onChange: (value: string) =>
              updateBeat(beat.id, {
                transition: value.trim().length > 0 ? value.trim() : null
              })
          },
          {
            id: `${beat.id}-voiceover`,
            label: "Voiceover",
            value: beat.voiceover ?? "",
            multiline: true,
            placeholder: "Leave empty for no line over this beat",
            onChange: (value: string) =>
              updateBeat(beat.id, { voiceover: value })
          }
        ]
      })),
    [beats, updateBeat]
  );

  const handleReplan = useCallback(() => onReplan(), [onReplan]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Review your beats
        </Text>
        <FlexRow gap={GAP.normal} align="baseline">
          <Text size="normal" color={over ? "warning" : "secondary"}>
            {format
              ? `${formatSeconds(totalMs)} of ${formatSeconds(format.durationMs)}`
              : formatSeconds(totalMs)}
          </Text>
          {over ? (
            <Text size="small" color="warning" role="status">
              Longer than the format. Shorten a beat or drop one.
            </Text>
          ) : null}
        </FlexRow>
      </FlexColumn>
      <PlanReview
        sections={sections}
        replanLabel="Re-plan"
        onReplan={handleReplan}
        replanPending={replanPending}
      />
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "VideoReviewStep";

export default ReviewStep;
