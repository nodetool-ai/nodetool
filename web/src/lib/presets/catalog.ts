/**
 * The preset catalogue every web surface shares: the storyboard's camera
 * picker, the shot prompt preview and the Effects gallery. One instance, built
 * from the generated `preset-catalog.json`.
 */

import { createCatalog } from "@nodetool-ai/presets";
import presetData from "@nodetool-ai/presets/preset-catalog.json";

export const presetCatalog = createCatalog(presetData);

/** Every camera preset, in catalogue order. */
export const CAMERA_PRESETS = presetCatalog.filter({ kind: "camera" });

/** Image-input effects supported by the Effects gallery. */
export const EFFECT_PRESETS = presetCatalog.filter({ kind: "effect" }).filter(preset => preset.inputs.includes("image") && !preset.modes.includes("video_edit"));
