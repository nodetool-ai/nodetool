/**
 * Document tempo, and what changing it does to the clips.
 *
 * Milliseconds are the stored master clock and a note's ticks are read against
 * the tempo, so a tempo change has to move the stored milliseconds or every
 * midi clip would play at the new speed inside a window sized for the old one.
 * The rescale is `oldBpm / newBpm` around `tempo.offsetMs`: halving the BPM
 * doubles each midi clip's start offset and length, and the notes inside keep
 * their tick positions. Nothing else on the timeline moves — a picture cut is
 * where the editor put it.
 */

import type { TimelineClip, TimelineTempo, TimelineTrack } from "../types.js";

/** What a document with no `tempo` is read at: 120 BPM, 4/4, beat one at 0. */
export const DEFAULT_TEMPO: TimelineTempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};

/** The tempo a document is read at. */
export function resolveTempo(doc: { tempo?: TimelineTempo }): TimelineTempo {
  return doc.tempo ?? DEFAULT_TEMPO;
}

/** Whether this clip's timing is measured in beats rather than seconds. */
function isMidiClip(
  clip: TimelineClip,
  midiTrackIds: ReadonlySet<string>
): boolean {
  return clip.mediaType === "midi" || midiTrackIds.has(clip.trackId);
}

/**
 * Rescale the midi clips for a tempo change, leaving every other clip untouched
 * and returned by reference.
 *
 * `tracks` is read only to catch a clip sitting on a midi track — a clip
 * authored before its media type was set still belongs to the beat grid.
 */
export function rescaleClipsForTempo(
  clips: ReadonlyArray<TimelineClip>,
  tracks: ReadonlyArray<TimelineTrack>,
  oldTempo: TimelineTempo,
  newTempo: TimelineTempo
): TimelineClip[] {
  const scale = oldTempo.bpm / newTempo.bpm;
  const midiTrackIds = new Set(
    tracks.filter((t) => t.type === "midi").map((t) => t.id)
  );
  const origin = oldTempo.offsetMs;
  const nextOrigin = newTempo.offsetMs;

  return clips.map((clip) => {
    if (!isMidiClip(clip, midiTrackIds)) return clip;
    const next: TimelineClip = {
      ...clip,
      startMs: nextOrigin + (clip.startMs - origin) * scale,
      durationMs: clip.durationMs * scale
    };
    // The window over the note content scales with it: a clip that showed bars
    // 2–3 still shows bars 2–3 after the tempo change.
    if (clip.inPointMs !== undefined) {
      next.inPointMs = clip.inPointMs * scale;
    }
    if (clip.outPointMs !== undefined) {
      next.outPointMs = clip.outPointMs * scale;
    }
    return next;
  });
}
