/**
 * The value range of a controller lane. Kept apart from `controllers.ts` so
 * step pattern expansion can read it without importing loop expansion.
 */

import type { MidiControllerKind } from "../types.js";

export const MIDI_PITCH_BEND_MIN = -8192;
export const MIDI_PITCH_BEND_MAX = 8191;

/** The value range of a lane's points. */
export function controllerValueRange(kind: MidiControllerKind): {
  min: number;
  max: number;
} {
  return kind === "pitchBend"
    ? { min: MIDI_PITCH_BEND_MIN, max: MIDI_PITCH_BEND_MAX }
    : { min: 0, max: 127 };
}
