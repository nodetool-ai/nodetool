/**
 * Step 2b of the image flow — the expanded brief, before anything is spent
 * (PRD § 10.2, D4).
 *
 * Five editable fields and a variation count. Every edit writes straight back
 * onto the document, because the document is the draft; `Re-refine` runs the
 * expansion again over whatever the creator has left in the boxes.
 */

import React, { memo, useCallback, useMemo } from "react";
import type { SketchRefinedBrief } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import {
  AlertBanner,
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  SPACING_PX,
  Text
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import GenerationSummary, {
  type GenerationSummaryProps
} from "../GenerationSummary";
import { PlanReview, type PlanReviewSection } from "../PlanReview";
import { SetupCardButton, useRovingRadioGroup } from "../SetupCardButton";
import BriefModelSelect from "./BriefModelSelect";

/** The counts the flow offers (PRD § 10.2). */
export const VARIATION_COUNTS: readonly number[] = [1, 2, 4];

/** One count card. Wide enough for a digit and its focus ring. */
const COUNT_CARD_WIDTH = SPACING_PX.xxxl * 2;

/** The counts as the radio group reads them: an id per option. */
const COUNT_OPTIONS = VARIATION_COUNTS.map((count) => ({ id: String(count) }));

const FIELD_LABELS: ReadonlyArray<[keyof SketchRefinedBrief, string]> = [
  ["subject", "Subject"],
  ["composition", "Composition"],
  ["lighting", "Lighting"],
  ["style_words", "Style words"],
  ["negative", "Leave out"]
];

const EMPTY: SketchRefinedBrief = {
  subject: "",
  composition: "",
  lighting: "",
  style_words: "",
  negative: ""
};

export interface ReviewStepProps {
  onReRefine: () => void;
  refining: boolean;
  /** Why the last expansion failed, shown where it was asked for (F9). */
  error?: string | null;
  /** What another expansion costs, before it is asked for (F23). */
  generation?: GenerationSummaryProps;
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  onReRefine,
  refining,
  error = null,
  generation
}) => {
  const refined = useSketchStore(
    (state) => state.document.setup?.refined ?? EMPTY
  );
  const variations = useSketchStore(
    (state) => state.document.setup?.variations ?? 1
  );
  const setSetup = useSketchStore((state) => state.setSetup);

  const selectCount = useCallback(
    (id: string) => setSetup({ variations: Number(id) }),
    [setSetup]
  );
  const countRadio = useRovingRadioGroup(
    COUNT_OPTIONS,
    String(variations),
    selectCount
  );

  const setField = useCallback(
    (field: keyof SketchRefinedBrief, value: string) => {
      const current = useSketchStore.getState().document.setup?.refined ?? EMPTY;
      setSetup({ refined: { ...current, [field]: value } });
    },
    [setSetup]
  );

  const sections = useMemo<PlanReviewSection[]>(
    () => [
      {
        id: "brief",
        header: "Your brief",
        subheader: "Edit anything here before it is rendered.",
        rows: FIELD_LABELS.map(([field, label]) => ({
          id: field,
          label,
          value: refined[field],
          multiline: true,
          onChange: (value: string) => setField(field, value)
        }))
      }
    ],
    [refined, setField]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <BriefModelSelect />
      <PlanReview
        sections={sections}
        replanLabel="Re-refine"
        onReplan={onReRefine}
        replanPending={refining}
      />
      {/* What `Re-refine` costs, beside `Re-refine` — a regeneration is a paid
          action and gets the same summary the first one did (F23). */}
      {generation ? <GenerationSummary {...generation} /> : null}
      {/* The failure sits under the button that asked for it, and the brief in
          the boxes above is untouched — a refused expansion overwrites
          nothing (F9). */}
      {error ? (
        <AlertBanner
          severity="error"
          role="alert"
          action={
            <EditorButton
              variant="text"
              onClick={onReRefine}
              disabled={refining}
            >
              Try again
            </EditorButton>
          }
        >
          {error}
        </AlertBanner>
      ) : null}
      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          How many variations?
        </Text>
        {/* One count out of three, so the cards are radios in a named radio
            group: three chips announcing themselves as independent toggles
            described the wrong control (F26). */}
        <FlexRow role="radiogroup" aria-label="Variations" gap={GAP.normal} wrap>
          {COUNT_OPTIONS.map((option) => (
            <Box key={option.id} sx={{ width: COUNT_CARD_WIDTH }}>
              <SetupCardButton
                {...countRadio(option)}
                onSelect={() => selectCount(option.id)}
              >
                <Text size="normal" component="span">
                  {option.id}
                </Text>
              </SetupCardButton>
            </Box>
          ))}
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ImageReviewStep";

export default ReviewStep;
