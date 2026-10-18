/**
 * Premiere's Paste Attributes (Ctrl+Alt+V): copy chosen groups of settings
 * from the copied clip onto the selected clips, leaving their media, timing
 * and everything not chosen alone.
 *
 * Picture groups apply only to clips that draw something and sound groups
 * only to clips that can be heard, so pasting a video clip's attributes onto
 * a mixed selection does not give a music clip a position. Speed goes
 * through the store's `setClipSpeed`, which owns the retime, so it is not a
 * field patch here.
 */

import type { TimelineClip } from "@nodetool-ai/timeline";
import { canClipFade } from "@nodetool-ai/timeline";

export const PASTE_ATTRIBUTE_GROUPS = [
  "motion",
  "opacity",
  "effects",
  "animations",
  "speed",
  "volume",
  "audioEffects"
] as const;

export type PasteAttributeGroup = (typeof PASTE_ATTRIBUTE_GROUPS)[number];

export const PASTE_ATTRIBUTE_LABELS: Record<PasteAttributeGroup, string> = {
  motion: "Motion (position, scale, rotation, crop, corners)",
  opacity: "Opacity and blend mode",
  effects: "Video effects",
  animations: "Animations and keyframes",
  speed: "Speed",
  volume: "Volume",
  audioEffects: "Audio effects"
};

const FIELDS: Record<
  Exclude<PasteAttributeGroup, "speed">,
  readonly (keyof TimelineClip)[]
> = {
  motion: ["transform", "crop", "borderRadius"],
  opacity: ["opacity", "blendMode"],
  effects: ["effects"],
  animations: ["animations"],
  volume: ["volumeDb"],
  audioEffects: ["audioEffects"]
};

const SOUND_GROUPS: ReadonlySet<PasteAttributeGroup> = new Set([
  "volume",
  "audioEffects"
]);

const drawsPicture = (clip: TimelineClip): boolean =>
  clip.mediaType !== "audio" && clip.mediaType !== "midi";

/** Whether `group` means anything on `target`. */
export function attributeGroupApplies(
  group: PasteAttributeGroup,
  target: TimelineClip
): boolean {
  if (group === "speed") {
    return target.mediaType === "video" || target.mediaType === "audio";
  }
  return SOUND_GROUPS.has(group)
    ? canClipFade(target.mediaType)
    : drawsPicture(target);
}

/**
 * The fields `target` takes from `source` for `groups`, deep-copied. A field
 * the source leaves unset is cleared on the target, so it ends up with the
 * source's look rather than a mix of both.
 */
export function attributePatch(
  source: TimelineClip,
  target: TimelineClip,
  groups: ReadonlySet<PasteAttributeGroup>
): Partial<TimelineClip> {
  const patch: Partial<TimelineClip> = {};
  for (const group of groups) {
    if (group === "speed" || !attributeGroupApplies(group, target)) continue;
    for (const field of FIELDS[group]) {
      const value = source[field];
      (patch as Record<string, unknown>)[field] =
        value === undefined ? undefined : structuredClone(value);
    }
  }
  return patch;
}
