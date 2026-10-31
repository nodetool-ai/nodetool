/**
 * Keys of the generated `preset_catalog` locale block. Names and descriptions
 * come from the preset catalogue through `web/scripts/generate-preset-i18n.mjs`.
 */

import type { Preset } from "@nodetool-ai/presets";

/** `camera.dolly-in` becomes `preset_catalog.camera.dolly-in`. */
export const presetTextKey = (id: string): string => `preset_catalog.${id}`;

/** Localized name and description, falling back to the catalogue's English. */
export const presetText = (
  t: (key: string, options: { defaultValue: string }) => string,
  preset: Pick<Preset, "id" | "name" | "description">
): { name: string; description: string } => ({
  name: t(`${presetTextKey(preset.id)}.name`, { defaultValue: preset.name }),
  description: t(`${presetTextKey(preset.id)}.description`, {
    defaultValue: preset.description
  })
});
