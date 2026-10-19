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
import { useTranslation } from "react-i18next";
import { KNOWN_TRANSITION_TYPE_LIST } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { TimelineBeat } from "@nodetool-ai/timeline";

import { FlexColumn, FlexRow, GAP, Text } from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import ErrorBanner from "../../support/ErrorBanner";
import GenerationSummary, {
  type GenerationSummaryProps
} from "../GenerationSummary";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";
import { videoFormatById } from "./formats";
import {
  productionFields,
  productionPatch,
  productionAuthoringBlocker,
  productionGenerationBlocker
} from "./productionAuthoring";

/** A length as a creator reads it. */
export const formatSeconds = (
  ms: number,
  t?: ReturnType<typeof useTranslation>["t"]
): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) {
    return t
      ? t("pass3_13.video.review.duration.seconds", { count: total })
      : `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return t
    ? t("pass3_13.video.review.duration.minutesSeconds", {
        minutes,
        seconds: String(seconds).padStart(2, "0")
      })
    : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
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
  /** Why the last plan or re-plan failed, shown under the plan. */
  error?: string | null;
  onValidationChange?: (reason: string | undefined) => void;
  /** What `Re-plan` costs, beside it: it is a paid Director run. */
  generation?: GenerationSummaryProps;
}

/**
 * The cuts a beat can open on. A beat with no transition is a plain cut, and
 * that reads as its own option rather than as an empty row — a select with an
 * empty value renders blank, which says nothing.
 */
const PLAIN_CUT = "cut";
const PRODUCTION_TEXT_KEYS: Record<string, string> = {
  "Add a line before choosing a speech mode.":
    "production.addLineBeforeSpeechMode",
  "Bound to a Script line. Edit the words and the voice in Script.":
    "production.boundToScriptLine",
  "Bound to a recorded audio take.": "production.boundToAudioTake",
  "Uses local speech. Production voice and audio resolution are unavailable in this setup.":
    "production.localSpeechUnavailable",
  "Editorial purpose": "production.editorialPurpose",
  Unspecified: "production.unspecified",
  Hook: "production.purpose.hook",
  Problem: "production.purpose.problem",
  Demonstration: "production.purpose.demonstration",
  Proof: "production.purpose.proof",
  "Call to action": "production.purpose.callToAction",
  Story: "production.purpose.story",
  "Visual treatment": "production.visualTreatment",
  "Actor to camera": "production.treatment.actorToCamera",
  "Product close-up": "production.treatment.productCloseUp",
  "Lifestyle B-roll": "production.treatment.lifestyleBroll",
  "Generated scene": "production.treatment.generatedScene",
  "Requested takes": "production.requestedTakes",
  "Speech mode": "production.speechMode",
  None: "production.none",
  "Off-camera": "production.offCamera",
  "On-camera (unavailable in guided flow)": "production.onCameraUnavailable",
  "Script line": "production.scriptLine",
  "Production direction": "production.direction",
  "Optional performance or camera direction": "production.directionPlaceholder",
  "Complete production requirements: speech needs a binding and takes must be 1–3.":
    "production.errors.completeRequirements",
  "Add the local speech line, or choose Speech mode None. The last saved binding is retained.":
    "production.errors.addLocalSpeech",
  "Complete the production requirements: speech needs a line or audio binding, and takes must be 1–3.":
    "production.errors.completeGenerationRequirements",
  "On-camera speech is unavailable in this guided flow. Choose Off-camera or None.":
    "production.errors.onCameraUnavailable"
};

const translateProductionText = (
  text: string | undefined,
  t: ReturnType<typeof useTranslation>["t"]
): string | undefined => {
  if (text === undefined) {
    return undefined;
  }
  const key = PRODUCTION_TEXT_KEYS[text];
  return key ? t(`pass3_13.video.review.${key}`) : text;
};

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  onReplan,
  replanPending,
  error,
  onValidationChange,
  generation
}) => {
  const { t } = useTranslation();
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
  const rangeText = t("pass3_13.video.review.duration.range", {
    min: secondsText(MIN_BEAT_MS),
    max: secondsText(maxBeatMs)
  });
  const transitionOptions = [
    { value: PLAIN_CUT, label: t("pass3_13.video.review.transitions.cut") },
    ...KNOWN_TRANSITION_TYPE_LIST.map((type) => ({
      value: type,
      label: t(`pass3_13.video.review.transitions.${type}`, {
        defaultValue: type
      })
    }))
  ];

  // What is in the length fields, as typed. The document takes an entry only
  // once it reads as a length, so a half-typed "1." or a cleared field stays
  // on screen as typed instead of snapping back to the stored value (F21).
  // Each entry keeps the length the beat had when it was typed: a change from
  // elsewhere (the agent's `ui_timeline_update_beat`) outdates it, and the
  // field then shows the length the beat now has.
  const [drafts, setDrafts] = useState<
    Record<string, { value: string; base: number }>
  >({});
  const lengths = useMemo(() => {
    const live: Record<string, string> = {};
    for (const beat of beats ?? []) {
      const draft = drafts[beat.id];
      if (draft && draft.base === beat.duration_ms) {
        live[beat.id] = draft.value;
      }
    }
    return live;
  }, [beats, drafts]);
  const handleLength = useCallback(
    (beatId: string, value: string, base: number) =>
      setDrafts((current) => ({ ...current, [beatId]: { value, base } })),
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
      // The typed text now matches the plan, so it stays as typed.
      setDrafts((current) =>
        current[beatId]
          ? { ...current, [beatId]: { value, base: ms } }
          : current
      );
    }
  };

  const unusable = (beats ?? []).filter((beat) => {
    const typed = lengths[beat.id];
    return typed !== undefined && parseSeconds(typed, maxBeatMs) === null;
  }).length;
  const validationReason =
    unusable > 0
      ? t("pass3_13.video.review.correctLength", { range: rangeText })
      : translateProductionText(productionAuthoringBlocker(beats ?? []), t);
  useEffect(() => {
    onValidationChange?.(validationReason);
    return () => onValidationChange?.(undefined);
  }, [onValidationChange, validationReason]);
  const productionNote = translateProductionText(
    productionGenerationBlocker(beats ?? [], false),
    t
  );

  const sections: PlanReviewSection[] = (beats ?? []).map((beat, index) => ({
    id: beat.id,
    header: `${index + 1}. ${formatSeconds(beat.duration_ms, t)}`,
    // The header is a number and a length, so the remove control names
    // what it drops rather than reading "Delete 1. 3s".
    removeLabel: t("pass3_13.video.review.deleteBeat", { number: index + 1 }),
    rows: [
      {
        id: `${beat.id}-prompt`,
        label: t("pass3_13.video.review.fields.beat"),
        value: beat.prompt,
        multiline: true,
        onChange: (value: string) => updateBeat(beat.id, { prompt: value })
      },
      {
        id: `${beat.id}-duration`,
        label: t("pass3_13.video.review.fields.seconds"),
        value: lengths[beat.id] ?? secondsText(beat.duration_ms),
        placeholder: rangeText,
        compact: true,
        onChange: (value: string) =>
          handleLength(beat.id, value, beat.duration_ms),
        onCommit: (value: string) => commitLength(beat.id, value)
      },
      {
        id: `${beat.id}-transition`,
        label: t("pass3_13.video.review.fields.transition"),
        value: beat.transition ?? PLAIN_CUT,
        // A closed set the renderer already enumerates, so it is a select:
        // typed free text left the row holding a word the cut has no
        // meaning for, and the list of legal words in a placeholder read
        // as data rather than as help.
        options: transitionOptions,
        compact: true,
        onChange: (value: string) =>
          updateBeat(beat.id, {
            transition: value === PLAIN_CUT ? null : value
          })
      },
      {
        id: `${beat.id}-voiceover`,
        label: t("pass3_13.video.review.fields.voiceover"),
        readOnly:
          !!beat.production?.speech_binding?.script_line_id ||
          !!beat.production?.speech_binding?.audio_asset_id,
        value: beat.voiceover ?? beat.production?.speech_binding?.text ?? "",
        multiline: true,
        placeholder: t("pass3_13.video.review.fields.voiceoverPlaceholder"),
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
      }).map((field) => ({
        ...field,
        label: translateProductionText(field.label, t) ?? field.label,
        hint: translateProductionText(field.hint, t),
        placeholder: translateProductionText(field.placeholder, t),
        options: field.options?.map((option) => ({
          ...option,
          label: translateProductionText(option.label, t) ?? option.label
        }))
      }))
    ]
  }));

  const handleReplan = useCallback(() => onReplan(), [onReplan]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_13.video.review.title")}
        </Text>
        <FlexRow gap={GAP.normal} align="baseline">
          <Text size="normal" color={over ? "warning" : "secondary"}>
            {format
              ? t("pass3_13.video.review.durationOf", {
                  current: formatSeconds(totalMs, t),
                  total: formatSeconds(format.durationMs, t)
                })
              : formatSeconds(totalMs, t)}
          </Text>
          {over ? (
            <Text size="small" color="warning" role="status">
              {t("pass3_13.video.review.overFormat")}
            </Text>
          ) : null}
          {unusable > 0 ? (
            <Text size="small" color="warning" role="status">
              {t("pass3_13.video.review.invalidLengths", {
                count: unusable,
                range: rangeText
              })}
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
        replanLabel={t("pass3_13.video.review.actions.replan")}
        onReplan={handleReplan}
        replanPending={replanPending}
        onRemoveSection={removeBeat}
        sectionNoun={t("pass3_13.video.review.fields.beat")}
      />
      {generation ? <GenerationSummary {...generation} compact /> : null}
      {error ? (
        <ErrorBanner
          report={{
            source: "provider-call",
            summary: t("pass3_13.video.review.errors.replanFailed"),
            errorText: error
          }}
        >
          {error}
        </ErrorBanner>
      ) : null}
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "VideoReviewStep";

export default ReviewStep;
