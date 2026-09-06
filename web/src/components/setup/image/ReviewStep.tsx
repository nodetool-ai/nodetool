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

import { Chip, FlexColumn, FlexRow, GAP, Text } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { PlanReview, type PlanReviewSection } from "../PlanReview";

/** The counts the flow offers (PRD § 10.2). */
export const VARIATION_COUNTS: readonly number[] = [1, 2, 4];

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
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  onReRefine,
  refining
}) => {
  const refined = useSketchStore(
    (state) => state.document.setup?.refined ?? EMPTY
  );
  const variations = useSketchStore(
    (state) => state.document.setup?.variations ?? 1
  );
  const setSetup = useSketchStore((state) => state.setSetup);

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
      <PlanReview
        sections={sections}
        replanLabel="Re-refine"
        onReplan={onReRefine}
        replanPending={refining}
      />
      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          How many variations?
        </Text>
        <FlexRow role="group" aria-label="Variations" gap={GAP.normal}>
          {VARIATION_COUNTS.map((count) => (
            <Chip
              key={count}
              label={String(count)}
              active={count === variations}
              aria-pressed={count === variations}
              onClick={() => setSetup({ variations: count })}
            />
          ))}
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ImageReviewStep";

export default ReviewStep;
