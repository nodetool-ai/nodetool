/**
 * assembledSequenceMerge — re-assembling into a sequence that already exists.
 *
 * A second assemble of the same documents must not orphan the first: it
 * rewrites what those documents put in the sequence and leaves everything the
 * editor added — an imported track, a hand-cut clip, a second script's
 * voiceover. Ownership is read off the clips' own linkage keys, so a script,
 * a board, or a linked pair all merge by the same rule.
 *
 * Draft narration and music clips carry no shot or line key, so
 * {@link stampBoardProvenance} marks them with the board that produced them
 * before they are written. Without it a re-assemble would keep the old music
 * clip as foreign and add a second one next to it.
 */

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

/** The documents a cut was assembled from, by id. */
interface AssemblyOwner {
  boardId?: string | null;
  scriptId?: string | null;
}

interface MergedSequence {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

/** Whether this clip came from one of the documents being re-assembled. */
export const isOwnedClip = (
  clip: TimelineClip,
  owner: AssemblyOwner
): boolean =>
  (!!owner.boardId && clip.storyboardBoardId === owner.boardId) ||
  (!!owner.scriptId && clip.scriptId === owner.scriptId);

/** Record the board behind every clip of a fresh build, draft clips included. */
export const stampBoardProvenance = (
  clips: TimelineClip[],
  boardId: string
): TimelineClip[] =>
  clips.map((clip) =>
    clip.storyboardBoardId ? clip : { ...clip, storyboardBoardId: boardId }
  );

/**
 * The document a re-assemble writes: the fresh build, plus every track and clip
 * the assembling documents do not own.
 */
export function mergeIntoSequence(
  built: MergedSequence,
  existing: MergedSequence,
  owner: AssemblyOwner
): MergedSequence {
  const foreignClips = existing.clips.filter(
    (clip) => !isOwnedClip(clip, owner)
  );
  // Drop only the tracks these documents filled and no one else uses. Empty
  // tracks and tracks the editor added stay.
  const ownedTrackIds = new Set(
    existing.clips
      .filter((clip) => isOwnedClip(clip, owner))
      .map((clip) => clip.trackId)
  );
  const foreignTrackIds = new Set(foreignClips.map((clip) => clip.trackId));
  const foreignTracks = existing.tracks.filter(
    (track) => foreignTrackIds.has(track.id) || !ownedTrackIds.has(track.id)
  );
  return {
    tracks: [...built.tracks, ...foreignTracks],
    clips: [...built.clips, ...foreignClips]
  };
}
