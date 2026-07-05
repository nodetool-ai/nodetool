/**
 * imageModelOptions — shared derivation of the resolution / aspect controls
 * offered for an image model.
 *
 * The image counterpart to `videoModelOptions`: one source of truth for the
 * surfaces that generate images (the media chat composer, {@link MediaChatComposer},
 * and the sketch connected-mode prompt bar), so the two present identical,
 * model-constrained options and can't drift apart.
 */

import DisplaySettingsIcon from "@mui/icons-material/DisplaySettings";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";
import type { ImageModel } from "../../../stores/ApiTypes";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_EDIT_STRENGTHS,
  IMAGE_RESOLUTIONS,
  INFERENCE_STEPS,
  type AspectRatioOption,
  type ImageResolution
} from "../../../stores/MediaGenerationStore";
import type { MediaOption } from "./MediaOptionMenu";
import { buildAspectOptions, clampToAllowed } from "./videoModelOptions";

// Shared generic helpers live in videoModelOptions — re-export them so image
// consumers have a parallel surface without duplicating the logic.
export { buildAspectOptions, clampToAllowed };

/** Extract per-model option constraints (manifest enums) from a raw model.
 *  Resolutions are narrowed to the app's ImageResolution vocabulary (1K/2K/4K)
 *  so callers can clamp the current value against them safely — a model may
 *  declare provider-specific values (480p, 1MP, …) the composer can't resolve. */
export function imageModelConstraints(model: ImageModel): {
  aspectRatios?: string[];
  resolutions?: ImageResolution[];
} {
  const aspectRatios = model.aspect_ratios ?? undefined;
  const resolutions = (model.resolutions ?? []).filter(
    (r): r is ImageResolution => (IMAGE_RESOLUTIONS as string[]).includes(r)
  );
  return {
    aspectRatios:
      aspectRatios && aspectRatios.length > 0 ? aspectRatios : undefined,
    resolutions: resolutions.length > 0 ? resolutions : undefined
  };
}

/**
 * Build the resolution / aspect menu options for a selected image model,
 * falling back to the full sets when the model declares no constraints.
 */
export function buildImageModelOptions(
  model:
    | { aspectRatios?: string[]; resolutions?: string[] }
    | null
    | undefined
): {
  aspectOptions: AspectRatioOption[];
  resolutionOptions: MediaOption<ImageResolution>[];
} {
  const aspectOptions =
    model?.aspectRatios && model.aspectRatios.length > 0
      ? buildAspectOptions(model.aspectRatios, IMAGE_ASPECT_RATIOS)
      : IMAGE_ASPECT_RATIOS;
  const allowed = (model?.resolutions ?? []).filter(
    (r): r is ImageResolution => (IMAGE_RESOLUTIONS as string[]).includes(r)
  );
  const resolutions = allowed.length > 0 ? allowed : IMAGE_RESOLUTIONS;
  return {
    aspectOptions,
    resolutionOptions: resolutions.map((r) => ({
      id: r,
      label: r,
      icon: <DisplaySettingsIcon fontSize="small" />
    }))
  };
}

/**
 * Menu options for the image-to-image edit controls (strength + inference
 * steps), shared by the media chat composer and the editor prompt panels.
 */
export function buildImageEditOptions(): {
  strengthOptions: MediaOption<number>[];
  stepsOptions: MediaOption<number>[];
} {
  return {
    strengthOptions: IMAGE_EDIT_STRENGTHS.map((s) => ({
      id: s,
      label: s.toFixed(2),
      description: s <= 0.35 ? "subtle" : s >= 0.85 ? "strong" : "balanced",
      icon: <TuneIcon fontSize="small" />
    })),
    stepsOptions: INFERENCE_STEPS.map((n) => ({
      id: n,
      label: `${n}`,
      description: n <= 15 ? "fast" : n >= 40 ? "high quality" : "balanced",
      icon: <LayersIcon fontSize="small" />
    }))
  };
}
