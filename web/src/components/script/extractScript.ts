/**
 * extractScript — the reverse of assemble: project a timeline's transcript into
 * a script document.
 *
 * This closes the loop for recorded/imported media: transcribe a recording in
 * the timeline, extract it as a script, then re-voice it with a cast. Each
 * transcript paragraph becomes a line; distinct speaker labels become the cast
 * (voiceless — the user assigns voices afterward). When a paragraph is backed
 * by a single asset-bearing clip, its recording is carried across as the line's
 * first take so the extracted script is immediately playable.
 */

import { buildTranscriptDoc } from "../../stores/timeline/transcriptOps";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type {
  ScriptCaptionWord,
  ScriptLine,
  ScriptSection,
  ScriptSpeaker,
  ScriptTake
} from "../../stores/script/ScriptStore";

export interface ExtractedScript {
  cast: ScriptSpeaker[];
  sections: ScriptSection[];
}

let counter = 0;
const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function buildScriptFromTimeline(
  clips: TimelineClip[]
): ExtractedScript {
  const doc = buildTranscriptDoc(clips);
  const clipsById = new Map(clips.map((c) => [c.id, c]));

  // Distinct speaker labels → cast, in first-seen order.
  const speakerIdByName = new Map<string, string>();
  const cast: ScriptSpeaker[] = [];
  for (const segment of doc.segments) {
    const name = segment.speaker?.trim();
    if (!name || speakerIdByName.has(name)) continue;
    const id = uid("spk");
    speakerIdByName.set(name, id);
    cast.push({ id, name, voice: null });
  }

  const lines: ScriptLine[] = doc.segments.map((segment) => {
    const text = segment.isDraft
      ? segment.draftText
      : segment.tokens.map((t) => t.text).join(" ");
    const speakerName = segment.speaker?.trim();
    const speakerId = speakerName
      ? (speakerIdByName.get(speakerName) ?? null)
      : null;

    const takes: ScriptTake[] = [];
    let currentTakeId: string | null = null;
    // Carry a single-clip recording across as the line's first take.
    if (segment.clipIds.length === 1) {
      const clip = clipsById.get(segment.clipIds[0]);
      if (clip?.currentAssetId) {
        const words: ScriptCaptionWord[] = (clip.caption?.words ?? []).map(
          (w) => ({ word: w.word, startMs: w.startMs, endMs: w.endMs })
        );
        const take: ScriptTake = {
          id: uid("take"),
          assetId: clip.currentAssetId,
          durationMs: clip.durationMs,
          words,
          textSnapshot: text,
          voiceSnapshot: null,
          createdAt: new Date().toISOString()
        };
        takes.push(take);
        currentTakeId = take.id;
      }
    }

    return {
      id: uid("line"),
      speakerId,
      text,
      takes,
      currentTakeId
    };
  });

  return { cast, sections: [{ id: uid("sec"), lines }] };
}
