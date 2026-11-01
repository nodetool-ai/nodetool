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
/** Every look preset, in catalogue order. */
export const LOOK_PRESETS = presetCatalog.filter({ kind: "look" });

/** Every effect preset, in catalogue order. */
export const EFFECT_PRESETS = presetCatalog.filter({ kind: "effect" });

/** Composer presets share one stack across camera, look and effect kinds. */
export const MEDIA_PRESETS = presetCatalog.presets;
