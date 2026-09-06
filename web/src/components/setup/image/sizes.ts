/**
 * The five output sizes the look step offers (PRD § 10.3).
 *
 * One tile per aspect, each with the pixel size it produces, because "portrait"
 * on its own does not tell you what you get. The pixels are the 1K tier from
 * the shared image-size table, so a size picked here is the same size the
 * generate popover would have produced.
 */

import { resolveImageSize } from "../../../stores/MediaGenerationStore";

export interface SizePreset {
  id: string;
  label: string;
  /** Aspect id the provider is asked for. */
  aspectRatio: string;
  width: number;
  height: number;
}

const at1K = (id: string, label: string, aspectRatio: string): SizePreset => {
  const { width, height } = resolveImageSize("1K", aspectRatio);
  return { id, label, aspectRatio, width, height };
};

export const SIZE_PRESETS: readonly SizePreset[] = [
  at1K("square", "Square", "1:1"),
  at1K("portrait", "Portrait", "4:5"),
  at1K("landscape", "Landscape", "3:2"),
  at1K("story", "Story", "9:16"),
  at1K("banner", "Banner", "21:9")
];

/** The preset whose pixels match a canvas, or null when none does. */
export const sizePresetFor = (
  width: number,
  height: number
): SizePreset | null =>
  SIZE_PRESETS.find(
    (preset) => preset.width === width && preset.height === height
  ) ?? null;
