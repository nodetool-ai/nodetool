/**
 * What a re-assemble must not throw away.
 *
 * Assembling a script or a board into a sequence that already exists rewrites
 * only what that document owns. Anything another surface put in the sequence —
 * a second script's voiceover, a music bed the editor dropped in, an empty
 * track someone made room with — survives, because the sequence is a shared
 * place and only the owner's clips are being regenerated.
 *
 * The rule is one predicate plus one track question, and both the script
 * assemble and the storyboard assemble ask it identically, so it lives here
 * rather than twice in `packages/agents`.
 */

import type { TimelineClip, TimelineTrack } from "./types.js";

export interface TimelineParts {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

/**
 * The part of `previous` a re-assemble keeps, given which clips the assembling
 * document owns.
 *
 * Clips: every clip the caller does not own. Tracks: every track that still
 * holds one of those clips, plus every track that never held an owned clip —
 * so an empty track the editor added stays, while the track the last assemble
 * wrote its own clips onto is dropped and rebuilt.
 */
export function foreignTimelineParts(
  previous: TimelineParts,
  owns: (clip: TimelineClip) => boolean
): TimelineParts {
  const clips = previous.clips.filter((clip) => !owns(clip));
  const ownedTrackIds = new Set(
    previous.clips.filter(owns).map((clip) => clip.trackId)
  );
  const foreignTrackIds = new Set(clips.map((clip) => clip.trackId));
  const tracks = previous.tracks.filter(
    (track) => foreignTrackIds.has(track.id) || !ownedTrackIds.has(track.id)
  );
  return { tracks, clips };
}
