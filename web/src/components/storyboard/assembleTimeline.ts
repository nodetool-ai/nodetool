/**
 * assembleTimeline — pure mapping from a storyboard board to a timeline
 * document.
 *
 * Rendered shots become imported, asset-backed video clips laid end to end in
 * shot order, each stamped with `storyboardBoardId`/`storyboardShotId` so a
 * later shot revision can round-trip into the cut. The screenplay's narration
 * and music become draft text-to-audio clips on their own tracks — the
 * timeline's generation machinery renders them on demand.
 */

import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type {
  TimelineClip,
  TimelineTrack
} from "@nodetool-ai/timeline";
import type { Shot } from "@nodetool-ai/protocol";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";

const DEFAULT_SHOT_MS = 4000;

export interface AssembledDocument {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total duration of the shot track in ms. */
  durationMs: number;
  /** Shots that were skipped because they have no persisted clip asset. */
  skippedShotIds: string[];
}

/** A shot is assemblable when its clip landed as a persisted asset. */
export const isAssemblableShot = (shot: Shot): boolean =>
  shot.status === "rendered" &&
  !!shot.clip &&
  typeof shot.clip.asset_id === "string" &&
  shot.clip.asset_id.length > 0;

export function buildTimelineDocument(
  board: StoryboardBoard
): AssembledDocument {
  const ordered = [...board.shots].sort((a, b) => a.index - b.index);
  const assemblable = ordered.filter(isAssemblableShot);
  const skippedShotIds = ordered
    .filter((s) => !isAssemblableShot(s))
    .map((s) => s.id);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];

  let cursorMs = 0;
  for (const shot of assemblable) {
    const durationMs =
      typeof shot.duration_seconds === "number" && shot.duration_seconds > 0
        ? Math.round(shot.duration_seconds * 1000)
        : DEFAULT_SHOT_MS;
    clips.push(
      makeClip({
        trackId: shotTrack.id,
        name: shot.slug ?? `Shot ${shot.index + 1}`,
        startMs: cursorMs,
        durationMs,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        currentAssetId: shot.clip?.asset_id ?? undefined,
        storyboardBoardId: board.id,
        storyboardShotId: shot.id,
        versions: []
      })
    );
    cursorMs += durationMs;
  }

  const narration = board.screenplay?.narration?.trim();
  if (narration && cursorMs > 0) {
    const track = makeTrack({ type: "audio", name: "Narration", index: 1 });
    tracks.push(track);
    clips.push(
      makeClip({
        trackId: track.id,
        name: "Narration",
        startMs: 0,
        durationMs: cursorMs,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: narration,
        status: "draft",
        versions: []
      })
    );
  }

  const musicPrompt = board.screenplay?.music_prompt?.trim();
  if (musicPrompt && cursorMs > 0) {
    const track = makeTrack({ type: "audio", name: "Music", index: tracks.length });
    tracks.push(track);
    clips.push(
      makeClip({
        trackId: track.id,
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

  return { tracks, clips, durationMs: cursorMs, skippedShotIds };
}
