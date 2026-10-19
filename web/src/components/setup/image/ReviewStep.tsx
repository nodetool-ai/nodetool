/**
 * Step 2b of the image flow — the expanded brief, before anything is spent
 * (PRD § 10.2, D4).
 *
 * Five editable fields and a variation count. Every edit writes straight back
 * onto the document, because the document is the draft; `Re-refine` runs the
 * expansion again over whatever the creator has left in the boxes.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SketchRefinedBrief } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import {
  AlertBanner,
  Box,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
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
import ReportBugButton from "../../support/ReportBugButton";

/** The counts the flow offers (PRD § 10.2). */
export const VARIATION_COUNTS: readonly number[] = [1, 2, 4];

/** One count card. Wide enough for a digit and its focus ring. */
const COUNT_CARD_WIDTH = SPACING_PX.xxxl * 2;

/** The counts as the radio group reads them: an id per option. */
const COUNT_OPTIONS = VARIATION_COUNTS.map((count) => ({ id: String(count) }));

const FIELD_LABELS: ReadonlyArray<[keyof SketchRefinedBrief, string]> = [
  ["subject", "subject"],
  ["composition", "composition"],
  ["lighting", "lighting"],
  ["style_words", "styleWords"],
  ["negative", "leaveOut"]
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
  const { t } = useTranslation();
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
        header: t("pass3_8.image.review.brief.heading"),
        subheader: t("pass3_8.image.review.brief.description"),
        rows: FIELD_LABELS.map(([field, label]) => ({
          id: field,
          label: t(`pass3_8.image.review.fields.${label}`),
          value: refined[field],
          multiline: true,
          onChange: (value: string) => setField(field, value)
        }))
      }
    ],
    [refined, setField, t]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <BriefModelSelect />
      <PlanReview
        sections={sections}
        replanLabel={t("pass3_8.image.review.reRefine")}
        onReplan={onReRefine}
        replanPending={refining}
      />
      {/* The failure sits under the button that asked for it, and the brief in
          the boxes above is untouched — a refused expansion overwrites
          nothing (F9). */}
      {error ? (
        <AlertBanner
          severity="error"
          role="alert"
          action={
            <FlexRow gap={GAP.tight} align="center">
              <EditorButton
                variant="text"
                onClick={onReRefine}
                disabled={refining}
              >
                {t("pass3_8.common.tryAgain")}
              </EditorButton>
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: t("pass3_8.image.review.refinementFailed"),
                  errorText: error
                }}
              />
            </FlexRow>
          }
        >
          {error}
        </AlertBanner>
      ) : null}
      <FormField label={t("pass3_8.image.review.variationCountLabel")}>
        {/* One count out of three, so the cards are radios in a named radio
            group: three chips announcing themselves as independent toggles
            described the wrong control (F26). */}
        <FlexRow
          role="radiogroup"
          aria-label={t("pass3_8.image.review.variations")}
          gap={GAP.normal}
          wrap
        >
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
      </FormField>
      {/* What `Re-refine` costs — a regeneration is a paid action and gets the
          same summary the first one did (F23). It sits below the count so the
          count stays above the footer without scrolling at 1440 × 900. */}
      {generation ? <GenerationSummary {...generation} /> : null}
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ImageReviewStep";

export default ReviewStep;
