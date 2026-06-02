/**
 * transcriptOps — pure reducers for the Studio transcript document.
 *
 * Every Studio transcript mutation (add / edit / delete / reorder / reword)
 * is expressed here as a pure `(document) => document` transform over the
 * `{ transcript, clips }` slice of the timeline document. `TimelineTranscriptStore`
 * computes the next document with these helpers and commits it atomically via
 * `TimelineStore.setTranscriptAndClips`, so each user action lands as one
 * coherent edit (and one undo entry).
 *
 * Nothing here touches the DOM, the network, or any store — it is trivially
 * unit-testable, mirroring `sceneModel`.
 */

import { createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type { TimelineClip, TranscriptLine } from "@nodetool-ai/timeline";

/** Beat length used before a line's voiceover has been generated/probed. */
export const PLACEHOLDER_BEAT_MS = 3000;

export interface TranscriptDoc {
  transcript: TranscriptLine[];
  clips: TimelineClip[];
}

export interface ReflowedDoc extends TranscriptDoc {
  /** Total timeline length after laying beats end-to-end. */
  durationMs: number;
}

/** The voiceover (audio) clip bound to a line, if one has been created. */
export function beatAudioClip(
  line: TranscriptLine,
  clips: TimelineClip[]
): TimelineClip | undefined {
  return clips.find(
    (c) => line.clipIds.includes(c.id) && c.mediaType === "audio"
  );
}

/** The caption clip bound to a line, if one has been created. */
export function beatCaptionClip(
  line: TranscriptLine,
  clips: TimelineClip[]
): TimelineClip | undefined {
  return clips.find(
    (c) => line.clipIds.includes(c.id) && c.caption !== undefined
  );
}

/**
 * The duration of a line's beat: the voiceover clip's length once generated,
 * otherwise a placeholder so empty/ungenerated beats still occupy the timeline.
 */
export function beatDurationMs(
  line: TranscriptLine,
  clips: TimelineClip[]
): number {
  const audio = beatAudioClip(line, clips);
  if (audio && audio.durationMs > 0) return audio.durationMs;
  return PLACEHOLDER_BEAT_MS;
}

/**
 * Lay beats end-to-end in transcript order: each line's `beatStartMs` is the
 * cumulative length of the beats before it, and every clip bound to the line
 * (voiceover + caption) is repositioned to start there. The caption clip's
 * duration is kept equal to the beat duration so it covers the whole beat.
 * Clips not bound to any transcript line are left untouched.
 */
export function reflowBeats(
  transcript: TranscriptLine[],
  clips: TimelineClip[]
): ReflowedDoc {
  const clipById = new Map(clips.map((c) => [c.id, c]));
  const patched = new Map<string, TimelineClip>();
  const nextTranscript: TranscriptLine[] = [];

  let cursor = 0;
  for (const line of transcript) {
    const dur = beatDurationMs(line, clips);
    nextTranscript.push({ ...line, beatStartMs: cursor });

    for (const clipId of line.clipIds) {
      const clip = clipById.get(clipId);
      if (!clip) continue;
      const isCaption = clip.caption !== undefined;
      patched.set(clipId, {
        ...clip,
        startMs: cursor,
        // Captions span the whole beat; the audio clip keeps its own length.
        durationMs: isCaption ? dur : clip.durationMs
      });
    }

    cursor += dur;
  }

  const nextClips = clips.map((c) => patched.get(c.id) ?? c);
  return { transcript: nextTranscript, clips: nextClips, durationMs: cursor };
}

/** Append a new, empty line (no clips yet). Position is set on reflow. */
export function addLine(
  transcript: TranscriptLine[],
  text: string
): { transcript: TranscriptLine[]; line: TranscriptLine } {
  const line: TranscriptLine = {
    id: createTimeOrderedUuid(),
    text,
    beatStartMs: 0,
    clipIds: []
  };
  return { transcript: [...transcript, line], line };
}

/** Remove a line and all clips bound to it, then re-flow the remaining beats. */
export function removeLine(
  transcript: TranscriptLine[],
  clips: TimelineClip[],
  lineId: string
): ReflowedDoc {
  const line = transcript.find((l) => l.id === lineId);
  const removedClipIds = new Set(line?.clipIds ?? []);
  const nextTranscript = transcript.filter((l) => l.id !== lineId);
  const nextClips = clips.filter((c) => !removedClipIds.has(c.id));
  return reflowBeats(nextTranscript, nextClips);
}

/** Reorder lines to match `orderedIds`, then re-flow so clips follow. */
export function reorderLines(
  transcript: TranscriptLine[],
  clips: TimelineClip[],
  orderedIds: string[]
): ReflowedDoc {
  const byId = new Map(transcript.map((l) => [l.id, l]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((l): l is TranscriptLine => l !== undefined);
  // Keep any lines not named in orderedIds (defensive) at the end.
  for (const line of transcript) {
    if (!orderedIds.includes(line.id)) reordered.push(line);
  }
  return reflowBeats(reordered, clips);
}

/**
 * The idle status a generated clip should take once its inputs change: `stale`
 * if it already has a render to invalidate, otherwise unchanged. Mirrors the
 * staleness rule used by `TimelineStore.setClipPrompt`.
 */
function staleStatus(clip: TimelineClip): TimelineClip["status"] {
  return clip.lastGeneratedHash || clip.currentAssetId ? "stale" : clip.status;
}

/**
 * Edit a line's text. The bound voiceover clip's prompt is updated and, if it
 * already has a render, marked stale (the existing dependency-hash machinery
 * then drives regeneration). The caption clip is marked stale too, since its
 * words no longer match the new text.
 */
export function rewordLine(
  transcript: TranscriptLine[],
  clips: TimelineClip[],
  lineId: string,
  text: string
): TranscriptDoc {
  const line = transcript.find((l) => l.id === lineId);
  const nextTranscript = transcript.map((l) =>
    l.id === lineId ? { ...l, text } : l
  );
  if (!line) return { transcript: nextTranscript, clips };

  const boundIds = new Set(line.clipIds);
  const nextClips = clips.map((c) => {
    if (!boundIds.has(c.id)) return c;
    if (c.mediaType === "audio") {
      return { ...c, prompt: text, status: staleStatus(c) };
    }
    if (c.caption !== undefined) {
      // A populated caption is a render of the old words; invalidate it.
      const hasCaption = c.caption.words.length > 0;
      return {
        ...c,
        status: hasCaption || c.currentAssetId ? "stale" : c.status
      };
    }
    return c;
  });

  return { transcript: nextTranscript, clips: nextClips };
}
