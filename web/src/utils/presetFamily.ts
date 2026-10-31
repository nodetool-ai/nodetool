/**
 * Which prompt family a chosen model belongs to, and which presets have no
 * fragment for it. The compiler falls back to the `default` fragment for those
 * presets, so the composer warns about them before the request is sent.
 */

import {
  modelFamily,
  type ModelFamily,
  type Preset,
  type PresetMode
} from "@nodetool-ai/presets";
import { resolveNodetoolDelegate } from "@nodetool-ai/protocol";

/** The model task a preset mode runs, as `resolveNodetoolDelegate` names it. */
function taskOfMode(mode: PresetMode): string {
  switch (mode) {
    case "video":
      return "text_to_video";
    case "image":
      return "text_to_image";
    case "video_edit":
      return "video_to_video";
    case "image_edit":
      return "image_to_image";
    default:
      return mode;
  }
}

/** The id the compiler sees: a nodetool model resolves to its delegate. */
function effectiveModelId(
  model: { id: string; provider?: string | null },
  mode: PresetMode
): string {
  return model.provider === "nodetool"
    ? (resolveNodetoolDelegate(model.id, taskOfMode(mode))?.model ?? model.id)
    : model.id;
}

/** The prompt family of a chosen model, or null when none is chosen or known. */
export function presetFamilyOf(
  model: { id: string; provider?: string | null } | null | undefined,
  mode: PresetMode
): ModelFamily | null {
  return model ? modelFamily(effectiveModelId(model, mode)) : null;
}

/**
 * The presets with no fragment for the model's family. The compiler falls back
 * to the `default` fragment for these and returns a warning. Empty while no
 * model is chosen, since there is no family to miss.
 */
export function presetsWithoutFragment(
  presets: readonly Preset[],
  model: { id: string; provider?: string | null } | null | undefined,
  mode: PresetMode
): Preset[] {
  if (!model) {
    return [];
  }
  const family = presetFamilyOf(model, mode);
  return presets.filter(
    (preset) => family === null || !Object.hasOwn(preset.prompt, family)
  );
}
