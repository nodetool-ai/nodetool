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
 * When it does run over, the advice is to shorten a beat or drop one, and both
 * are operations the review offers: `PlanReview`'s per-beat remove control
 * calls the store's `removeBeat` (F20).
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { KNOWN_TRANSITION_TYPE_LIST } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineBeat } from "@nodetool-ai/timeline";

import { FlexColumn, FlexRow, GAP, Text } from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";
import { videoFormatById } from "./formats";
import {
  productionFields,
  productionPatch,
  productionAuthoringBlocker,
  productionGenerationBlocker
} from "./productionAuthoring";

/** "12s", "1m 04s" — a length as a creator reads it. */
export const formatSeconds = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
};

/** The shortest beat any clip model will render. */
const MIN_BEAT_MS = 500;
/** The longest, when the format does not say. */
const FALLBACK_MAX_BEAT_MS = 60_000;

/**
 * A length as the field shows it: the seconds actually used for generation,
 * not a rounded stand-in. 3500ms reads "3.5", so a typed 3.5 is not answered
 * with a 4.
 */
export const secondsText = (ms: number): string =>
  String(Number((ms / 1000).toFixed(2)));

/** Seconds in, milliseconds out — or null when the entry is unusable. */
export const parseSeconds = (value: string, maxMs: number): number | null => {
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds)) {
    return null;
  }
  const ms = Math.round(seconds * 1000);
  return ms >= MIN_BEAT_MS && ms <= maxMs ? ms : null;
};

export interface ReviewStepProps {
  /** Re-runs the Director with the edited plan as context. */
  onReplan: () => void;
  replanPending?: boolean;
  onValidationChange?: (reason: string | undefined) => void;
}

/**
 * The cuts a beat can open on. A beat with no transition is a plain cut, and
 * that reads as its own option rather than as an empty row — a select with an
 * empty value renders blank, which says nothing.
 */
const PLAIN_CUT = "cut";
const TRANSITION_OPTIONS = [
  { value: PLAIN_CUT, label: "Cut" },
  ...KNOWN_TRANSITION_TYPE_LIST.map((type) => ({ value: type, label: type }))
] as const;

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  onReplan,
  replanPending,
  onValidationChange
}) => {
  const beats = useTimelineStore((state) => state.setup?.beats);
  const formatId = useTimelineStore((state) => state.setup?.format);
  const updateBeat = useTimelineStore((state) => state.updateBeat);
  const removeBeat = useTimelineStore((state) => state.removeBeat);
  const format = videoFormatById(formatId);

  const totalMs = useMemo(
    () => (beats ?? []).reduce((sum, beat) => sum + beat.duration_ms, 0),
    [beats]
  );
  const over = format ? totalMs > format.durationMs : false;
  const maxBeatMs = format?.durationMs ?? FALLBACK_MAX_BEAT_MS;
  const rangeText = `${secondsText(MIN_BEAT_MS)}–${secondsText(maxBeatMs)}s`;

  // What is in the length fields, as typed. The document takes an entry only
  // once it reads as a length, so a half-typed "1." or a cleared field stays
  // on screen as typed instead of snapping back to the stored value (F21).
  const [lengths, setLengths] = useState<Record<string, string>>({});
  const handleLength = useCallback(
    (beatId: string, value: string) =>
      setLengths((current) => ({ ...current, [beatId]: value })),
    []
  );

  // The commit point. Typing "900" passes through "9", which reads as a
  // perfectly good nine seconds — so a keystroke is never the moment to write
  // a length down. An entry that does not read as one in range leaves the plan
  // holding the last one that did, with the text and the range on screen (F21).
  const commitLength = (beatId: string, value: string): void => {
    const ms = parseSeconds(value, maxBeatMs);
    if (ms !== null) {
      const beat = beats?.find((item) => item.id === beatId);
      const patch: Partial<TimelineBeat> = { duration_ms: ms };
      if (beat?.production) {
        patch.production = productionPatch(beat.production, {
          duration_ms: ms
        });
      }
      updateBeat(beatId, patch);
    }
  };

  const unusable = (beats ?? []).filter((beat) => {
    const typed = lengths[beat.id];
    return typed !== undefined && parseSeconds(typed, maxBeatMs) === null;
  }).length;
  const validationReason =
    unusable > 0
      ? `Correct the length outside ${rangeText}.`
      : productionAuthoringBlocker(beats ?? []);
  useEffect(() => {
    onValidationChange?.(validationReason);
    return () => onValidationChange?.(undefined);
  }, [onValidationChange, validationReason]);
  const productionNote = productionGenerationBlocker(beats ?? [], false);

  const sections: PlanReviewSection[] = (beats ?? []).map((beat, index) => ({
    id: beat.id,
    header: `${index + 1}. ${formatSeconds(beat.duration_ms)}`,
    // The header is a number and a length, so the remove control names
    // what it drops rather than reading "Remove 1. 3s".
    removeLabel: `Remove beat ${index + 1}`,
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
        value: lengths[beat.id] ?? secondsText(beat.duration_ms),
        placeholder: rangeText,
        compact: true,
        onChange: (value: string) => handleLength(beat.id, value),
        onCommit: (value: string) => commitLength(beat.id, value)
      },
      {
        id: `${beat.id}-transition`,
        label: "Transition",
        value: beat.transition ?? PLAIN_CUT,
        // A closed set the renderer already enumerates, so it is a select:
        // typed free text left the row holding a word the cut has no
        // meaning for, and the list of legal words in a placeholder read
        // as data rather than as help.
        options: TRANSITION_OPTIONS,
        compact: true,
        onChange: (value: string) =>
          updateBeat(beat.id, {
            transition: value === PLAIN_CUT ? null : value
          })
      },
      {
        id: `${beat.id}-voiceover`,
        label: "Voiceover",
        readOnly:
          !!beat.production?.speech_binding?.script_line_id ||
          !!beat.production?.speech_binding?.audio_asset_id,
        value: beat.voiceover ?? beat.production?.speech_binding?.text ?? "",
        multiline: true,
        placeholder: "Leave empty for no line over this beat",
        onChange: (value: string) => {
          const production =
            beat.production?.speech_binding?.text && value.trim()
              ? productionPatch(beat.production, {
                  speech_binding: {
                    ...beat.production.speech_binding,
                    text: value
                  }
                })
              : beat.production;
          const patch: Partial<TimelineBeat> = { voiceover: value };
          if (production) {
            patch.production = production;
          }
          updateBeat(beat.id, patch);
        }
      },
      ...productionFields({
        id: beat.id,
        value: beat,
        speechText:
          beat.voiceover ?? beat.production?.speech_binding?.text ?? "",
        onChange: (production) => updateBeat(beat.id, { production })
      })
    ]
  }));

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
          {unusable > 0 ? (
            <Text size="small" color="warning" role="status">
              {`${unusable} length${unusable === 1 ? " is" : "s are"} outside ${rangeText}. The plan keeps the last usable one.`}
            </Text>
          ) : null}
        </FlexRow>
      </FlexColumn>
      {productionNote ? (
        <Text size="small" color="warning" role="status">
          {productionNote}
        </Text>
      ) : null}
      <PlanReview
        sections={sections}
        replanLabel="Re-plan"
        onReplan={handleReplan}
        replanPending={replanPending}
        onRemoveSection={removeBeat}
        sectionNoun="beat"
      />
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "VideoReviewStep";

export default ReviewStep;
