import {
  productionRequirement,
  type ProductionRequirement
} from "@nodetool-ai/protocol";
import {
  productionRequirementsFrom,
  deterministicFingerprint
} from "../../../hooks/storyboard/productionContext";
import type { PlanReviewField } from "../PlanReview";

export const REVIEW_REQUIRED =
  "Production context changed. Return to the plan, review it, and continue to Look.";

export function productionReviewFingerprint(context: unknown): string {
  return deterministicFingerprint(context);
}

export function reviewFingerprintOf(value: unknown): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("production_review_fingerprint" in value)
  ) {
    return undefined;
  }
  return typeof value.production_review_fingerprint === "string"
    ? value.production_review_fingerprint
    : undefined;
}

/** Keep canonical writes separate from the tolerant legacy reader. */
export function productionPatch(
  current: ProductionRequirement | undefined,
  patch: Partial<ProductionRequirement>
): ProductionRequirement {
  const next = { ...current, ...patch };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined || next[key] === "") {
      delete next[key];
    }
  }
  return { ...productionRequirement.parse(next), ...next };
}

interface ProductionFieldsOptions {
  readonly id: string;
  readonly value: unknown;
  readonly speechText: string;
  readonly linkedLineIds?: readonly string[];
  readonly onChange: (production: ProductionRequirement) => void;
}

export function productionForEditing(
  value: unknown
): ProductionRequirement | undefined {
  const normalized = productionRequirementsFrom(value);
  if (typeof value === "object" && value !== null && "production" in value) {
    const parsed = productionRequirement.safeParse(value.production);
    if (parsed.success) {
      const result = { ...parsed.data, ...normalized };
      for (const alias of [
        "editorialPurpose",
        "visualTreatment",
        "speechMode",
        "speechBinding",
        "referenceBindings",
        "durationMs",
        "speechDurationMs",
        "direction",
        "requestedTakeCount"
      ]) {
        delete result[alias];
      }
      return result;
    }
  }
  return normalized;
}

/** Rows share the existing beat/shot review, with no additional flow stage. */
export function productionFields({
  id,
  value,
  speechText,
  linkedLineIds = [],
  onChange
}: ProductionFieldsOptions): PlanReviewField[] {
  const current = productionForEditing(value);
  const binding = current?.speech_binding;
  const change = (patch: Partial<ProductionRequirement>): void => {
    onChange(productionPatch(current, patch));
  };
  const canBind =
    !!binding || speechText.trim().length > 0 || linkedLineIds.length > 0;
  // What the speech is bound to, under the control that binds it. It was a
  // read-only field of its own, which read as a filled-in value and put the
  // explanation a row below the select it explains.
  const speechHint = !canBind
    ? "Add voiceover or dialogue before choosing a speech mode."
    : binding?.script_line_id
      ? "Bound to a Script line. Edit the words and the voice in Script."
      : binding?.audio_asset_id
        ? "Bound to a recorded audio take."
        : binding?.text
          ? "Uses local speech. Production voice and audio resolution are unavailable in this setup."
          : undefined;
  // The enums are short values on a narrow column, so they pack into one row
  // of properties rather than four full-width controls down the card.
  return [
    {
      id: `${id}:purpose`,
      label: "Editorial purpose",
      compact: true,
      value: current?.editorial_purpose ?? "",
      options: [
        { value: "", label: "Unspecified" },
        { value: "hook", label: "Hook" },
        { value: "problem", label: "Problem" },
        { value: "demonstration", label: "Demonstration" },
        { value: "proof", label: "Proof" },
        { value: "cta", label: "Call to action" },
        { value: "story", label: "Story" }
      ],
      onChange: (editorial_purpose) => {
        onChange(
          productionRequirement.parse({
            ...current,
            editorial_purpose: editorial_purpose || undefined
          })
        );
      }
    },
    {
      id: `${id}:treatment`,
      label: "Visual treatment",
      compact: true,
      value: current?.visual_treatment ?? "",
      options: [
        { value: "", label: "Unspecified" },
        { value: "actor_to_camera", label: "Actor to camera" },
        { value: "product_close_up", label: "Product close-up" },
        { value: "lifestyle_b_roll", label: "Lifestyle B-roll" },
        { value: "generated_scene", label: "Generated scene" }
      ],
      onChange: (visual_treatment) => {
        onChange(
          productionRequirement.parse({
            ...current,
            visual_treatment: visual_treatment || undefined
          })
        );
      }
    },
    {
      id: `${id}:takes`,
      label: "Requested takes",
      compact: true,
      value: String(current?.requested_take_count ?? 1),
      options: [1, 2, 3].map((count) => ({
        value: String(count),
        label: String(count)
      })),
      onChange: (count) => change({ requested_take_count: Number(count) })
    },
    {
      id: `${id}:speech`,
      label: "Speech mode",
      value: current?.speech_mode ?? "none",
      readOnly: !canBind,
      hint: speechHint,
      options: [
        { value: "none", label: "None" },
        { value: "off_camera", label: "Off-camera" },
        { value: "on_camera", label: "On-camera" }
      ],
      onChange: (speech_mode) => {
        onChange(
          productionRequirement.parse({
            ...current,
            speech_mode,
            speech_binding:
              speech_mode === "none"
                ? undefined
                : (binding ??
                  (linkedLineIds[0]
                    ? { script_line_id: linkedLineIds[0] }
                    : { text: speechText }))
          })
        );
      }
    },
    ...(linkedLineIds.length > 1 && current && current.speech_mode !== "none"
      ? [
          {
            id: `${id}:line`,
            label: "Script line",
            value: binding?.script_line_id ?? "",
            options: linkedLineIds.map((lineId) => ({
              value: lineId,
              label: lineId
            })),
            onChange: (script_line_id: string) =>
              change({ speech_binding: { script_line_id } })
          }
        ]
      : []),
    {
      id: `${id}:direction`,
      label: "Production direction",
      value: current?.local_direction ?? "",
      multiline: true,
      placeholder: "Optional performance or camera direction",
      onChange: (local_direction) =>
        change({
          local_direction: local_direction.trim() ? local_direction : undefined
        })
    }
  ];
}

export function productionAuthoringBlocker(
  items: readonly unknown[]
): string | undefined {
  for (const item of items) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("production" in item) ||
      item.production === undefined
    ) {
      continue;
    }
    // Validate canonical data before a tolerant reader can normalize invalid counts.
    const parsed = productionRequirement.safeParse(item.production);
    if (!parsed.success) {
      return "Complete production requirements: speech needs a binding and takes must be 1–3.";
    }
    if (
      parsed.data.speech_binding?.text &&
      !parsed.data.speech_binding.script_line_id
    ) {
      const text =
        "voiceover" in item
          ? item.voiceover
          : "dialogue" in item
            ? item.dialogue
            : undefined;
      if (typeof text === "string" && !text.trim()) {
        return "Add the local speech line, or choose Speech mode None. The last saved binding is retained.";
      }
    }
  }
  return undefined;
}

/** Guard the setup flow before the shared production compiler runs. */
export function productionGenerationBlocker(
  items: readonly unknown[],
  hasReferences: boolean
): string | undefined {
  const invalid = productionAuthoringBlocker(items);
  if (invalid) {
    return invalid;
  }
  // Reference-conditioned video is an executable route. The compiler and
  // server preflight verify the actual asset IDs before dispatch.
  void hasReferences;
  for (const item of items) {
    const production = productionRequirementsFrom(item);
    if (!production) {
      continue;
    }
    const parsed = productionRequirement.safeParse(production);
    if (!parsed.success) {
      return "Complete the production requirements: speech needs a line or audio binding, and takes must be 1–3.";
    }
    if (production.speech_mode === "on_camera") {
      return "On-camera speech requires a supported audio-driven performance route. Choose off-camera speech or provide a supported performance source.";
    }
  }
  return undefined;
}
