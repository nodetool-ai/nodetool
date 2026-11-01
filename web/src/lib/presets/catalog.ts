/**
 * The preset catalogue every web surface shares: the storyboard's camera
 * picker, the shot prompt preview, the Effects gallery and the start page's
 * studios. One instance, built from the generated `preset-catalog.json`.
 */

import { createCatalog } from "@nodetool-ai/presets";
import presetData from "@nodetool-ai/presets/preset-catalog.json";

export const presetCatalog = createCatalog(presetData);

/** Every camera preset, in catalogue order. */
export const CAMERA_PRESETS = presetCatalog.filter({ kind: "camera" });
/** Every look preset, in catalogue order. */
export const LOOK_PRESETS = presetCatalog.filter({ kind: "look" });

/** Image-input effects supported by the Effects gallery. */
export const EFFECT_PRESETS = presetCatalog.filter({ kind: "effect" }).filter(preset => preset.inputs.includes("image") && !preset.modes.includes("video_edit"));

/** Composer presets share one stack across camera, look and effect kinds. */
export const MEDIA_PRESETS = presetCatalog.presets;

/** Every studio, in catalogue order: the start page's outcome tiles. */
export const STUDIOS = presetCatalog.studios;
