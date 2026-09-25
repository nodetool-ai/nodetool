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

/** Number of existing clips a re-assemble will remove before writing fresh ones. */
export const countOwnedClips = (
  clips: readonly TimelineClip[],
  owner: AssemblyOwner
): number => {
  let count = 0;
  for (const clip of clips) {
    if (isOwnedClip(clip, owner)) {
      count++;
    }
  }
  return count;
};

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
  const foreignClips: TimelineClip[] = [];
  const ownedTrackIds = new Set<string>();
  const foreignTrackIds = new Set<string>();

  for (const clip of existing.clips) {
    if (isOwnedClip(clip, owner)) {
      ownedTrackIds.add(clip.trackId);
    } else {
      foreignClips.push(clip);
      foreignTrackIds.add(clip.trackId);
    }
  }

  // Drop only the tracks these documents filled and no one else uses. Empty
  // tracks and tracks the editor added stay.
  const foreignTracks = existing.tracks.filter(
    (track) => foreignTrackIds.has(track.id) || !ownedTrackIds.has(track.id)
  );
  // A track's `index` is its position in `tracks`, and `sceneModel` reads it as
  // the composite z-order. Concatenating two documents' tracks breaks that: a
  // kept track can claim the index a fresh one already took, stacking two
  // visual layers at the same `trackZ`. Renumber by position.
  const tracks = [...built.tracks, ...foreignTracks].map((track, index) =>
    track.index === index ? track : { ...track, index }
  );
  return { tracks, clips: [...built.clips, ...foreignClips] };
}
