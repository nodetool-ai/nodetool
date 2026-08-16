/**
 * Joint assembly: a storyboard and the script it links become one cut.
 *
 * The two documents keep their jobs — the board owns the picture, the script
 * owns the words — and this is where they meet. Shots lay out end to end as in
 * `buildStoryboardTimeline`, but each one is as long as the takes it covers
 * (`linkedShotDurationMs`), and every voiced line gets its own clip on the
 * voiceover track, parked where its words fall inside the shot. The whole-cut
 * narration draft clip is gone: the script says the words now, so a prompt
 * spanning the cut would be a second, competing answer.
 *
 * Each voiceover clip carries both linkage families —
 * `scriptId`/`scriptLineId` and `storyboardBoardId`/`storyboardShotId` — so the
 * existing `stores/script/timelineSync` and `stores/storyboard/timelineSync`
 * back-sync paths both find the clips they own without a line of change.
 *
 * `buildStoryboardTimeline` and `buildScriptTimeline` stay exactly as they are:
 * an unlinked board and a script with no board assemble the way they always
 * did, and this is a third function rather than a branch inside either.
 */

import type { Shot } from "@nodetool-ai/protocol";
import { makeClip, makeTrack } from "./defaults.js";
import {
  currentTake,
  effectiveVoice,
  takeCaptionWords,
  type ScriptAssemblyInput
} from "./script.js";
import {
  linkedLineDurationMs,
  linkedShotDurationMs,
  scriptLinesById
} from "./script-link.js";
import { isAssemblableShot, shotDurationMs } from "./storyboard.js";
import type { AssembledTimeline } from "./storyboard.js";
import type { TimelineClip, TimelineTrack } from "./types.js";

export interface LinkedAssemblyInput {
  /** Board id stamped onto every clip, linking the cut back to the board. */
  boardId: string;
  shots: Shot[];
  /** Score direction, laid across the full cut as one draft audio clip. */
  musicPrompt?: string | null;
  /** The linked script: the words, the cast, and the id to stamp. */
  script: ScriptAssemblyInput;
}

export interface AssembledLinkedTimeline extends AssembledTimeline {
  /** Lines that got no clip: unvoiced, or covered by a skipped shot. */
  skippedLineIds: string[];
}

export function buildLinkedTimeline(
  input: LinkedAssemblyInput
): AssembledLinkedTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);
  const linesById = scriptLinesById(input.script.sections);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const voiceTrack = makeTrack({ type: "audio", name: "Voiceover", index: 1 });
  const tracks: TimelineTrack[] = [shotTrack, voiceTrack];
  const clips: TimelineClip[] = [];
  const skippedShotIds: string[] = [];
  const skippedLineIds: string[] = [];

  const speakerName = (speakerId?: string | null): string | undefined =>
    speakerId
      ? input.script.cast.find((s) => s.id === speakerId)?.name
      : undefined;

  let cursorMs = 0;
  for (const shot of ordered) {
    const lineIds = shot.script_line_ids ?? [];
    if (!isAssemblableShot(shot)) {
      skippedShotIds.push(shot.id);
      skippedLineIds.push(...lineIds);
      continue;
    }

    const shotStartMs = cursorMs;
    const durationMs =
      linkedShotDurationMs(shot, linesById) ?? shotDurationMs(shot);
    clips.push(
      makeClip({
        trackId: shotTrack.id,
        name: shot.slug ?? `Shot ${shot.index + 1}`,
        startMs: shotStartMs,
        durationMs,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: shot.clip?.asset_id ?? undefined,
        storyboardBoardId: input.boardId,
        storyboardShotId: shot.id,
        versions: []
      })
    );
    cursorMs += durationMs;

    let offsetMs = 0;
    for (const lineId of lineIds) {
      const line = linesById.get(lineId);
      const take = line ? currentTake(line) : undefined;
      const lineMs = line ? linkedLineDurationMs(line) : null;
      if (!line || !take || lineMs === null) {
        skippedLineIds.push(lineId);
        continue;
      }
      const words = takeCaptionWords(take);
      const pauseMs = Math.max(0, line.pauseAfterMs ?? 0);
      clips.push(
        makeClip({
          trackId: voiceTrack.id,
          name: line.text.slice(0, 40) || "Line",
          startMs: shotStartMs + offsetMs,
          durationMs: lineMs - pauseMs,
          mediaType: "audio",
          sourceType: "imported",
          bindingKind: "text-to-audio",
          status: "generated",
          currentAssetId: take.assetId,
          prompt: line.text,
          voice: effectiveVoice(line, input.script.cast)?.voice,
          speaker: speakerName(line.speakerId),
          caption: words.length ? { words } : undefined,
          scriptId: input.script.scriptId,
          scriptLineId: line.id,
          storyboardBoardId: input.boardId,
          storyboardShotId: shot.id,
          versions: []
        })
      );
      offsetMs += lineMs;
    }
  }

  const musicPrompt = input.musicPrompt?.trim();
  if (musicPrompt && cursorMs > 0) {
    const musicTrack = makeTrack({
      type: "audio",
      name: "Music",
      index: tracks.length
    });
    tracks.push(musicTrack);
    clips.push(
      makeClip({
        trackId: musicTrack.id,
        name: "Music",
        startMs: 0,
        durationMs: cursorMs,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: musicPrompt,
        status: "draft",
        versions: []
      })
    );
  }

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    skippedLineIds
  };
}
