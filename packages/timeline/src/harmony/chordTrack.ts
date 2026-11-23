/**
 * Which chord track a clip follows. Kept apart from `expand.ts` so step
 * pattern expansion can read it without importing harmony expansion back.
 */

import type { ClipHarmony, TimelineTempo, TimelineTrack } from "../types.js";

/** What expansion reads from the document. */
export interface HarmonyDocument {
  tracks: ReadonlyArray<Pick<TimelineTrack, "id" | "type" | "chords"> & Partial<Pick<TimelineTrack, "instrument">>>;
  tempo?: TimelineTempo;
}

/** The chord track a clip follows: `chordTrackId`, else the first chord track. */
export function chordTrackFor(
  harmony: Pick<ClipHarmony, "chordTrackId"> | undefined,
  tracks: HarmonyDocument["tracks"]
): Pick<TimelineTrack, "id" | "type" | "chords"> | undefined {
  const chordTracks = tracks.filter((t) => t.type === "chord");
  return (
    (harmony?.chordTrackId && chordTracks.find((t) => t.id === harmony.chordTrackId)) ||
    chordTracks[0]
  );
}
