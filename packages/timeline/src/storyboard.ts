/**
 * Storyboard → timeline assembly.
 *
 * The one mapping from a board's rendered shots to a timeline document, shared
 * by the web surface (`ui_storyboard_assemble_timeline`) and the server-side
 * `assemble_storyboard_timeline` agent tool, so a cut assembled headlessly is
 * the same cut the editor would have produced.
 *
 * Rendered shots become imported, asset-backed video clips laid end to end in
 * shot order, each stamped with `storyboardBoardId`/`storyboardShotId` so a
 * later shot revision can round-trip into the cut. Narration and music become
 * draft text-to-audio clips on their own tracks — the timeline's generation
 * machinery renders them on demand.
 *
 * `buildStoryboardPreviewTimeline` is the same mapping for the in-editor
 * player, where a board that is only half rendered still has to play.
 */

import type { Shot } from "@nodetool-ai/protocol";
import { makeClip, makeTrack } from "./defaults.js";
import type { TimelineClip, TimelineTrack } from "./types.js";

/** Clip length used for a shot that carries no duration. */
export const DEFAULT_SHOT_MS = 4000;

export interface StoryboardAssemblyInput {
  /** Board id stamped onto each clip, linking the cut back to the board. */
  boardId: string;
  shots: Shot[];
  /** Voiceover script, laid across the full cut as one draft audio clip. */
  narration?: string | null;
  /** Score direction, laid across the full cut as one draft audio clip. */
  musicPrompt?: string | null;
}

export interface AssembledTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total duration of the shot track in ms. */
  durationMs: number;
  /** Shots skipped because they have no persisted clip asset. */
  skippedShotIds: string[];
}

/** A shot is assemblable when its clip landed as a persisted asset. */
export const isAssemblableShot = (shot: Shot): boolean =>
  shot.status === "rendered" &&
  !!shot.clip &&
  typeof shot.clip.asset_id === "string" &&
  shot.clip.asset_id.length > 0;

/** The persisted asset id on a media ref, or undefined when it has none. */
const assetIdOf = (ref: { asset_id?: string | null } | null | undefined) =>
  ref?.asset_id != null && ref.asset_id.length > 0
    ? ref.asset_id
    : undefined;

/** Clip length for a shot: its target duration, or the default. */
const shotDurationMs = (shot: Shot): number =>
  typeof shot.duration_seconds === "number" && shot.duration_seconds > 0
    ? Math.round(shot.duration_seconds * 1000)
    : DEFAULT_SHOT_MS;

export function buildStoryboardTimeline(
  input: StoryboardAssemblyInput
): AssembledTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);
  const assemblable = ordered.filter(isAssemblableShot);
  const skippedShotIds = ordered
    .filter((s) => !isAssemblableShot(s))
    .map((s) => s.id);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];

  let cursorMs = 0;
  for (const shot of assemblable) {
    const durationMs = shotDurationMs(shot);
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
        storyboardBoardId: input.boardId,
        storyboardShotId: shot.id,
        versions: []
      })
    );
    cursorMs += durationMs;
  }

  const narration = input.narration?.trim();
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

  const musicPrompt = input.musicPrompt?.trim();
  if (musicPrompt && cursorMs > 0) {
    const track = makeTrack({
      type: "audio",
      name: "Music",
      index: tracks.length
    });
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

export interface StoryboardPreviewInput {
  /** Board id stamped onto each clip. */
  boardId: string;
  shots: Shot[];
}

export interface StoryboardPreviewTimeline {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** Total duration of the shot track in ms. */
  durationMs: number;
  /** Shots skipped because neither clip nor keyframe has a persisted asset. */
  skippedShotIds: string[];
  /** Shots shown as held keyframe stills because no clip asset exists. */
  stillShotIds: string[];
}

/**
 * Assemble a board into the cut an in-editor player scrubs.
 *
 * Unlike {@link buildStoryboardTimeline}, which only lays down finished shots,
 * this fills the gaps: a shot with a selected clip asset plays that clip, a
 * shot that so far has only a keyframe holds that still for the shot's length,
 * and a shot with neither is dropped. A selected take plays whatever the shot's
 * lifecycle status says, so a preview keeps working while the board is still
 * rendering. Narration and music are left out — they are draft prompts with no
 * audio behind them yet.
 */
export function buildStoryboardPreviewTimeline(
  input: StoryboardPreviewInput
): StoryboardPreviewTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];
  const skippedShotIds: string[] = [];
  const stillShotIds: string[] = [];

  let cursorMs = 0;
  for (const shot of ordered) {
    const clipAssetId = assetIdOf(shot.clip);
    const stillAssetId = clipAssetId ? undefined : assetIdOf(shot.keyframe);
    const assetId = clipAssetId ?? stillAssetId;
    if (!assetId) {
      skippedShotIds.push(shot.id);
      continue;
    }
    if (stillAssetId) {
      stillShotIds.push(shot.id);
    }

    const durationMs = shotDurationMs(shot);
    clips.push(
      makeClip({
        trackId: shotTrack.id,
        name: shot.slug ?? `Shot ${shot.index + 1}`,
        startMs: cursorMs,
        durationMs,
        mediaType: clipAssetId ? "video" : "image",
        sourceType: "imported",
        status: "generated",
        currentAssetId: assetId,
        storyboardBoardId: input.boardId,
        storyboardShotId: shot.id,
        versions: []
      })
    );
    cursorMs += durationMs;
  }

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    stillShotIds
  };
}
