import type { ProductionRequirements } from "../../hooks/storyboard/productionContext";
import type { PlanReviewField } from "./PlanReview";

export const EDITORIAL_PURPOSE_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "hook", label: "Hook" },
  { value: "problem", label: "Problem" },
  { value: "demonstration", label: "Demonstration" },
  { value: "proof", label: "Proof" },
  { value: "cta", label: "Call to action" },
  { value: "story", label: "Story" }
] as const;

export const VISUAL_TREATMENT_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "actor_to_camera", label: "Actor to camera" },
  { value: "product_close_up", label: "Product close-up" },
  { value: "lifestyle_b_roll", label: "Lifestyle b-roll" },
  { value: "generated_scene", label: "Generated scene" }
] as const;

const TAKE_COUNT_OPTIONS = [
  { value: "1", label: "1 take" },
  { value: "2", label: "2 takes" },
  { value: "3", label: "3 takes" }
] as const;

const isEditorialPurpose = (
  value: string
): value is NonNullable<ProductionRequirements["editorial_purpose"]> =>
  EDITORIAL_PURPOSE_OPTIONS.some(
    (option) => option.value === value && option.value !== ""
  );

const isVisualTreatment = (
  value: string
): value is NonNullable<ProductionRequirements["visual_treatment"]> =>
  VISUAL_TREATMENT_OPTIONS.some(
    (option) => option.value === value && option.value !== ""
  );

const isSpeechMode = (
  value: string
): value is NonNullable<ProductionRequirements["speech_mode"]> =>
  value === "off_camera" || value === "on_camera";

const takeCount = (value: string): 1 | 2 | 3 =>
  value === "2" ? 2 : value === "3" ? 3 : 1;

const mergeProduction = (
  current: ProductionRequirements | undefined,
  patch: Partial<ProductionRequirements>
): ProductionRequirements => ({
  schema_version: 1,
  speech_mode: "none",
  requested_take_count: 1,
  ...(current ?? {}),
  ...patch
});

const without = <K extends keyof ProductionRequirements>(
  production: ProductionRequirements,
  key: K
): ProductionRequirements => {
  const next = { ...production };
  delete next[key];
  return next;
};

export interface ProductionPlanFieldOptions {
  idPrefix: string;
  production: ProductionRequirements | undefined;
  speechText: string;
  onChange: (production: ProductionRequirements) => void;
}

export const productionPlanFields = ({
  idPrefix,
  production,
  speechText,
  onChange
}: ProductionPlanFieldOptions): PlanReviewField[] => {
  const current = mergeProduction(production, {});
  const hasSpeech = speechText.trim().length > 0;
  const speechOptions = [
    { value: "none", label: "No speech" },
    ...(hasSpeech
      ? [
          { value: "off_camera", label: "Off-camera narration" },
          { value: "on_camera", label: "On-camera speech" }
        ]
      : [])
  ];
  return [
    {
      id: `${idPrefix}:purpose`,
      label: "Editorial purpose",
      compact: true,
      value: current.editorial_purpose ?? "",
      options: EDITORIAL_PURPOSE_OPTIONS,
      onChange: (value) => {
        const next = mergeProduction(current, {});
        if (value === "") {
          delete next.editorial_purpose;
        } else if (isEditorialPurpose(value)) {
          next.editorial_purpose = value;
        }
        onChange(next);
      }
    },
    {
      id: `${idPrefix}:treatment`,
      label: "Visual treatment",
      compact: true,
      value: current.visual_treatment ?? "",
      options: VISUAL_TREATMENT_OPTIONS,
      onChange: (value) => {
        const next = mergeProduction(current, {});
        if (value === "") {
          delete next.visual_treatment;
        } else if (isVisualTreatment(value)) {
          next.visual_treatment = value;
        }
        onChange(next);
      }
    },
    {
      id: `${idPrefix}:speech`,
      label: "Speech mode",
      compact: true,
      value: current.speech_mode,
      options: speechOptions,
      onChange: (value) => {
        if (value === "none") {
          onChange(without(mergeProduction(current, { speech_mode: "none" }), "speech_binding"));
          return;
        }
        if (!hasSpeech) {
          return;
        }
        if (isSpeechMode(value)) {
          onChange(
            mergeProduction(current, {
              speech_mode: value,
              speech_binding: { text: speechText }
            })
          );
        }
      }
    },
    {
      id: `${idPrefix}:takes`,
      label: "Alternatives",
      compact: true,
      value: String(current.requested_take_count),
      options: TAKE_COUNT_OPTIONS,
      onChange: (value) =>
        onChange(mergeProduction(current, { requested_take_count: takeCount(value) }))
    },
    {
      id: `${idPrefix}:direction`,
      label: "Production direction",
      value: current.local_direction ?? "",
      multiline: true,
      placeholder: "Visible action, framing or delivery direction",
      onChange: (value) => {
        const next = mergeProduction(current, {});
        if (value.trim().length === 0) {
          delete next.local_direction;
        } else {
          next.local_direction = value;
        }
        onChange(next);
      }
    }
  ];
};
