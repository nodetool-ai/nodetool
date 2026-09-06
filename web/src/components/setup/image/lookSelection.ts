/**
 * The look step's choices, on the document rather than in component state
 * (PRD § 10.5, F17).
 *
 * Style and model decide what the batch looks like and what it costs, so they
 * belong where the stage does: a reload, a second host or a remount resumes on
 * the same step with the same choices. `setup` passes unknown keys through, so
 * these read back as `unknown` and are narrowed here, once.
 *
 * Only choices that change the output live here. Which menu is open does not.
 */

import type { SketchSetup } from "@nodetool-ai/protocol/api-schemas/sketch.js";

/** The style choice meaning "render exactly what the brief says" (F28). */
export const NO_STYLE_ID = "no-style";

export interface LookSelection {
  /** A style entity id, {@link NO_STYLE_ID}, or null when untouched. */
  styleChoice: string | null;
  provider: string;
  model: string;
}

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const readLookSelection = (
  setup: SketchSetup | undefined
): LookSelection => ({
  styleChoice: readString(setup?.style_entity_id),
  provider: readString(setup?.image_provider) ?? "",
  model: readString(setup?.image_model) ?? ""
});

export const styleChoicePatch = (choice: string): Partial<SketchSetup> => ({
  style_entity_id: choice
});

export const modelChoicePatch = (
  provider: string,
  model: string
): Partial<SketchSetup> => ({
  image_provider: provider,
  image_model: model
});
