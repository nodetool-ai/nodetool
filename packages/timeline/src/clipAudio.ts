/**
 * Which clips sound, shared by the three mixers: the live preview, the browser
 * export and the server `RenderTimeline` node. A rule kept in only one of them
 * is a soundtrack the others render differently.
 */

import type { TimelineClip, TimelineTrack } from "./types.js";

/**
 * The asset a clip draws and plays in its current status. A failed or draft
 * regeneration keeps the previous `currentAssetId` on the clip, and that asset
 * is neither drawn nor heard.
 */
export function effectiveAssetId(clip: TimelineClip): string | undefined {
  switch (clip.status) {
    case "generated":
    case "stale":
    case "locked":
    case "generating":
      return clip.currentAssetId;
    default:
      return undefined;
  }
}

/** Audio and midi tracks form the solo group; picture tracks cannot be soloed. */
export function soundTrackSoloed(tracks: readonly TimelineTrack[]): boolean {
  return tracks.some(
    (track) => (track.type === "audio" || track.type === "midi") && track.solo
  );
}

/**
 * linkIds of audio-track clips that are the detached audio of a video clip.
 * Such a clip existing at all means the linked video's own audio is not
 * played: audio comes only from the audio track. This is intentionally not
 * gated on mute or status — those govern whether the audio clip is mixed in,
 * not whether the video's embedded audio resurfaces. Deleting the audio clip
 * unlinks the survivor, so the video's audio returns on its own.
 */
export function extractedAudioLinkIds(
  clips: readonly TimelineClip[],
  tracks: readonly TimelineTrack[]
): Set<string> {
  const audioTrackIds = new Set(
    tracks.filter((track) => track.type === "audio").map((track) => track.id)
  );
  const ids = new Set<string>();
  for (const clip of clips) {
    if (
      audioTrackIds.has(clip.trackId) &&
      clip.mediaType === "audio" &&
      typeof clip.linkId === "string" &&
      clip.linkId.length > 0
    ) {
      ids.add(clip.linkId);
    }
  }
  return ids;
}

/**
 * Video clips whose own audio is mixed: on an unmuted picture track, unmuted,
 * with a playable asset and no extracted-audio clip standing in for them. A
 * soloed sound track silences every one of them. A direct generation with
 * native sound, or a video an agent placed, has no audio partner and sounds
 * through this rule.
 */
export function videoClipsWithOwnAudio(
  clips: readonly TimelineClip[],
  tracks: readonly TimelineTrack[]
): TimelineClip[] {
  if (soundTrackSoloed(tracks)) return [];
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const suppressed = extractedAudioLinkIds(clips, tracks);
  return clips.filter((clip) => {
    const track = byId.get(clip.trackId);
    return (
      (track?.type === "video" || track?.type === "overlay") &&
      track.muted !== true &&
      !clip.muted &&
      clip.mediaType === "video" &&
      !!effectiveAssetId(clip) &&
      clip.durationMs > 0 &&
      !(typeof clip.linkId === "string" && suppressed.has(clip.linkId))
    );
  });
}
