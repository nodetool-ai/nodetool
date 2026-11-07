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
import { canClipFade, parseEffectCurveName } from "@nodetool-ai/timeline";

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
 * The group a `paramCurves` entry travels with. A volume key reaches a sound
 * clip, which takes no animations, and an effect's keys arrive with the effect.
 */
export function paramCurveGroup(property: string): PasteAttributeGroup {
  if (parseEffectCurveName(property)) return "effects";
  return property === "volumeDb" ? "volume" : "animations";
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
  if (source.paramCurves || target.paramCurves) {
    const taken = (property: string) => {
      const group = paramCurveGroup(property);
      return groups.has(group) && attributeGroupApplies(group, target);
    };
    const curves = [
      ...(target.paramCurves ?? []).filter((curve) => !taken(curve.property)),
      ...(source.paramCurves ?? []).filter((curve) => taken(curve.property))
    ];
    patch.paramCurves = curves.length > 0 ? structuredClone(curves) : undefined;
  }
  return patch;
}
