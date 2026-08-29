/**
 * cameraOptions
 *
 * The vocabularies the shot inspector offers for a shot's camera direction.
 * They are suggestions, not a schema: `CameraDirection` holds free strings, and
 * an agent or an imported screenplay may write anything. {@link cameraOptions}
 * therefore keeps whatever the shot already carries as an option of its own, so
 * opening a select never silently rewrites a value it does not recognise.
 */

import type { SelectOption } from "../ui_primitives";

export const FRAMING_OPTIONS = [
  "extreme wide",
  "wide",
  "medium wide",
  "medium",
  "medium close-up",
  "close-up",
  "extreme close-up",
  "over-the-shoulder",
  "two-shot",
  "insert"
] as const;

export const LENS_OPTIONS = [
  "14mm",
  "18mm",
  "24mm",
  "28mm",
  "35mm",
  "50mm",
  "85mm",
  "135mm",
  "macro",
  "anamorphic"
] as const;

export const ANGLE_OPTIONS = [
  "eye level",
  "low angle",
  "high angle",
  "overhead",
  "bird's eye",
  "worm's eye",
  "dutch angle"
] as const;

export const MOVEMENT_OPTIONS = [
  "static",
  "slow push in",
  "slow pull out",
  "pan left",
  "pan right",
  "tilt up",
  "tilt down",
  "dolly in",
  "dolly out",
  "tracking",
  "handheld",
  "crane up",
  "crane down",
  "orbit",
  "zoom in",
  "zoom out"
] as const;

/** The suggested values plus an empty entry, with `current` kept when it is new. */
export const cameraOptions = (
  suggestions: readonly string[],
  current: string
): SelectOption[] => {
  const options: SelectOption[] = [{ value: "", label: "—" }];
  for (const value of suggestions) {
    options.push({ value, label: value });
  }
  if (current !== "" && !suggestions.includes(current)) {
    options.push({ value: current, label: current });
  }
  return options;
};
