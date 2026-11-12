/**
 * Track roles of a music project (MUSIC-MODE.md MD4, UI-3). A role names the
 * stem Add instrument asks for and is the default label of a new track.
 */

import { MUSIC_ROLES } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type { MusicRole } from "../types.js";

export { MUSIC_ROLES };

/** What the role picker and the track chip show. */
export const MUSIC_ROLE_LABELS: Readonly<Record<MusicRole, string>> = {
  vocals: "Vocals",
  backing_vocals: "Backing vocals",
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  keyboard: "Keyboard",
  percussion: "Percussion",
  strings: "Strings",
  synth: "Synth",
  fx: "FX",
  brass: "Brass",
  woodwinds: "Woodwinds"
};

/** The four audio tracks a new music project starts with, top to bottom (section 15). */
export const DEFAULT_MUSIC_TRACK_ROLES: readonly MusicRole[] = ["drums", "bass", "keyboard", "guitar"];

export function isMusicRole(value: unknown): value is MusicRole {
  return typeof value === "string" && (MUSIC_ROLES as readonly string[]).includes(value);
}

export function musicRoleLabel(role: MusicRole): string {
  return MUSIC_ROLE_LABELS[role];
}
