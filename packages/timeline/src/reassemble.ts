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
 *
 * {@link refillShotClips} is the other half: what the assembling document owns
 * and still must not rebuild, because a person placed it.
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

/**
 * Identity of a shot clip inside a cut: the shot it plays, in which medium.
 *
 * Null for a clip a re-assemble rebuilds rather than refills — one that plays
 * no shot, and one that plays a script line, because there the words decide
 * where the clip sits and how long it runs.
 */
const shotClipKey = (clip: TimelineClip): string | null =>
  clip.storyboardShotId && !clip.scriptLineId
    ? `${clip.storyboardShotId} ${clip.mediaType}`
    : null;

/** The edit a refilled clip keeps: where it sits, and what it plays of its source. */
const placementOf = (clip: TimelineClip) => ({
  startMs: clip.startMs,
  durationMs: clip.durationMs,
  inPointMs: clip.inPointMs,
  outPointMs: clip.outPointMs
});

/** An existing shot clip pointed at the media the new assembly resolved. */
function refilledClip(
  clip: TimelineClip,
  source: TimelineClip | undefined
): TimelineClip {
  // A shot still on the board that this assembly could not resolve — not
  // rendered yet, or its render cleared — holds its place and its media.
  if (!source) return clip;
  const next: TimelineClip = {
    ...clip,
    mediaType: source.mediaType,
    sourceType: source.sourceType,
    status: source.status,
    storyboardBoardId: source.storyboardBoardId
  };
  if (source.currentAssetId === undefined) {
    delete next.currentAssetId;
  } else {
    next.currentAssetId = source.currentAssetId;
  }
  if (next.currentAssetId !== clip.currentAssetId) {
    delete next.thumbnailAssetId;
    delete next.waveformAssetId;
    delete next.dependencyHash;
    delete next.lastGeneratedHash;
  }
  return next;
}

export interface ShotRefillInput {
  /** Clips the assembling document owns, as {@link foreignTimelineParts} asks. */
  owns: (clip: TimelineClip) => boolean;
  /** Shots still on the board. A clip playing any other shot is dropped. */
  liveShotIds: ReadonlySet<string>;
}

/**
 * Re-assemble a cut without rebuilding the shots a person already placed.
 *
 * `foreignTimelineParts` keeps what the assembling document does not own; this
 * keeps what it does. A shot clip is identified by the shot it plays, so a
 * re-assemble refills it — new asset, same placement, same trim, same
 * transform — instead of laying a fresh clip down in board order and dropping
 * the edit. That is what lets a recast copy inherit the approved cut, and what
 * lets a board be re-rendered and re-cut without losing one.
 *
 * Three cases, each explicit:
 * - **Kept.** An owned clip whose shot is still on the board survives, with
 *   the media of the matching assembled clip swapped in. A shot the assembly
 *   could not resolve (nothing rendered yet) holds its place.
 * - **Added.** An assembled clip with no owned counterpart. When the shot
 *   already has a clip in the cut — a video clip and its audio twin — the new
 *   one takes that clip's placement; otherwise it is appended after everything
 *   the cut already held, so a new shot joins the cut without moving anything
 *   already placed.
 * - **Removed.** An owned clip whose shot is gone from the board.
 *
 * With no previous cut this is the assembly itself, clip for clip and track
 * for track, so a first assemble is unchanged.
 *
 * A preserved trim outlives the footage it was cut from: a clip trimmed to a
 * window of the template's render keeps that window over the copy's, which is
 * the point when the copy is the same shot again and the caller's problem when
 * the new render is shorter.
 */
export function refillShotClips(
  previous: TimelineParts,
  assembled: TimelineParts,
  input: ShotRefillInput
): TimelineParts {
  const owned = previous.clips.filter(input.owns);
  const foreignClips = previous.clips.filter((clip) => !input.owns(clip));

  const fresh = new Map<string, TimelineClip>();
  for (const clip of assembled.clips) {
    const key = shotClipKey(clip);
    if (key !== null && !fresh.has(key)) fresh.set(key, clip);
  }

  /** Assembled track → the track the kept clip it refilled already sits on. */
  const trackFor = new Map<string, string>();
  const refilled = new Set<string>();
  const anchors = new Map<string, TimelineClip>();
  const kept: TimelineClip[] = [];
  for (const clip of owned) {
    const key = shotClipKey(clip);
    const shotId = key === null ? undefined : clip.storyboardShotId;
    if (key === null || !shotId || !input.liveShotIds.has(shotId)) continue;
    const source = fresh.get(key);
    if (source) {
      refilled.add(key);
      trackFor.set(source.trackId, clip.trackId);
    }
    const next = refilledClip(clip, source);
    kept.push(next);
    if (!anchors.has(shotId)) anchors.set(shotId, next);
  }

  const onTrack = (clip: TimelineClip): string =>
    trackFor.get(clip.trackId) ?? clip.trackId;
  const added: TimelineClip[] = [];
  const appended = new Map<string, TimelineClip[]>();
  for (const clip of assembled.clips) {
    const key = shotClipKey(clip);
    if (key !== null && refilled.has(key)) continue;
    const shotId = key === null ? undefined : clip.storyboardShotId;
    const anchor = shotId ? anchors.get(shotId) : undefined;
    if (anchor) {
      added.push({
        ...clip,
        ...placementOf(anchor),
        linkId: anchor.linkId ?? clip.linkId,
        trackId: onTrack(clip)
      });
    } else if (!shotId) {
      added.push({ ...clip, trackId: onTrack(clip) });
    } else {
      const group = appended.get(shotId);
      if (group) group.push(clip);
      else appended.set(shotId, [clip]);
    }
  }
  let cursorMs = [...kept, ...added].reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
  for (const group of appended.values()) {
    const delta = cursorMs - Math.min(...group.map((clip) => clip.startMs));
    for (const clip of group) {
      const startMs = clip.startMs + delta;
      added.push({ ...clip, startMs, trackId: onTrack(clip) });
      cursorMs = Math.max(cursorMs, startMs + clip.durationMs);
    }
  }

  const clips = [...kept, ...added, ...foreignClips];
  const usedTrackIds = new Set(clips.map((clip) => clip.trackId));
  const ownedTrackIds = new Set(owned.map((clip) => clip.trackId));
  // The same track rule as `foreignTimelineParts`, over what survived: a track
  // still holding a clip stays, and so does one the assembling document never
  // wrote to — an empty track the editor made room with.
  const tracks = previous.tracks.filter(
    (track) => usedTrackIds.has(track.id) || !ownedTrackIds.has(track.id)
  );
  const have = new Set(tracks.map((track) => track.id));
  tracks.push(
    ...assembled.tracks.filter(
      (track) => usedTrackIds.has(track.id) && !have.has(track.id)
    )
  );
  return { tracks, clips };
}
