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

/** Every effect preset, in catalogue order. */
export const EFFECT_PRESETS = presetCatalog.filter({ kind: "effect" });

/** Composer kinds available before the dedicated look controls. */
export const MEDIA_PRESETS = presetCatalog.presets.filter((preset) => preset.kind !== "look");

/** Every studio, in catalogue order: the start page's outcome tiles. */
export const STUDIOS = presetCatalog.studios;
