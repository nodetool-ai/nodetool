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
 * later shot revision can round-trip into the cut. Every shot clip also gets an
 * audio twin on its own track (`shotAudioClip`), because the preview and the
 * export mute video elements and take sound only from audio clips. Narration
 * and music become draft text-to-audio clips on their own tracks — the
 * timeline's generation machinery renders them on demand.
 *
 * `buildStoryboardPreviewTimeline` is the same mapping for the in-editor
 * player, where a board that is only half rendered still has to play.
 */

import type { Shot } from "@nodetool-ai/protocol";
import { createTimeOrderedUuid, makeClip, makeTrack } from "./defaults.js";
import type { TimelineClip, TimelineTrack } from "./types.js";

/** Clip length used for a shot that carries no duration. */
export const DEFAULT_SHOT_MS = 4000;

/**
 * Frame size for an aspect ratio, at a 1080px short edge.
 *
 * The one mapping from a board's `aspectRatio` to a sequence's width/height,
 * so the assemble button and the `assemble_storyboard_timeline` capability
 * create a timeline with the same frame. An unparseable ratio falls back to
 * 1920x1080.
 */
export function frameSizeForAspect(aspectRatio: string | null | undefined): {
  width: number;
  height: number;
} {
  const [w, h] = String(aspectRatio ?? "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1920, height: 1080 };
  }
  const short = 1080;
  const even = (n: number) => Math.round(n / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}

/** Track holding the sound that came with the shots' own rendered clips. */
export const SHOT_AUDIO_TRACK_NAME = "Shot Audio";

/**
 * The audio twin of a shot's video clip.
 *
 * A rendered shot carries its own sound — dialogue the video model spoke, room
 * tone, whatever the render produced — but every surface that plays a timeline
 * mutes its video elements and mixes audio clips only, so without a twin that
 * sound never reaches the cut. The twin points at the same asset, sits at the
 * same place, and shares a `linkId` with the video clip so the two move and
 * trim together.
 */
export function shotAudioClip(
  videoClip: TimelineClip,
  trackId: string
): TimelineClip {
  return makeClip({
    trackId,
    name: `${videoClip.name} (audio)`,
    startMs: videoClip.startMs,
    durationMs: videoClip.durationMs,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    currentAssetId: videoClip.currentAssetId,
    linkId: videoClip.linkId,
    storyboardBoardId: videoClip.storyboardBoardId,
    storyboardShotId: videoClip.storyboardShotId,
    versions: []
  });
}

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
export const shotDurationMs = (shot: Shot): number =>
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
  const shotAudioTrack = makeTrack({
    type: "audio",
    name: SHOT_AUDIO_TRACK_NAME,
    index: 1
  });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];

  let cursorMs = 0;
  for (const shot of assemblable) {
    const durationMs = shotDurationMs(shot);
    const videoClip = makeClip({
      trackId: shotTrack.id,
      name: shot.slug ?? `Shot ${shot.index + 1}`,
      startMs: cursorMs,
      durationMs,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: shot.clip?.asset_id ?? undefined,
      linkId: createTimeOrderedUuid(),
      storyboardBoardId: input.boardId,
      storyboardShotId: shot.id,
      versions: []
    });
    clips.push(videoClip, shotAudioClip(videoClip, shotAudioTrack.id));
    cursorMs += durationMs;
  }
  if (cursorMs > 0) {
    tracks.push(shotAudioTrack);
  }

  const narration = input.narration?.trim();
  if (narration && cursorMs > 0) {
    const track = makeTrack({
      type: "audio",
      name: "Narration",
      index: tracks.length
    });
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
 * rendering. Each played clip gets its audio twin, so a preview sounds like the
 * assembled cut. Narration and music are left out — they are draft prompts with
 * no audio behind them yet.
 */
export function buildStoryboardPreviewTimeline(
  input: StoryboardPreviewInput
): StoryboardPreviewTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);

  const shotTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const shotAudioTrack = makeTrack({
    type: "audio",
    name: SHOT_AUDIO_TRACK_NAME,
    index: 1
  });
  const tracks: TimelineTrack[] = [shotTrack];
  const clips: TimelineClip[] = [];
  const skippedShotIds: string[] = [];
  const stillShotIds: string[] = [];
  let hasShotAudio = false;

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
    const shotClip = makeClip({
      trackId: shotTrack.id,
      name: shot.slug ?? `Shot ${shot.index + 1}`,
      startMs: cursorMs,
      durationMs,
      mediaType: clipAssetId ? "video" : "image",
      sourceType: "imported",
      status: "generated",
      currentAssetId: assetId,
      linkId: clipAssetId ? createTimeOrderedUuid() : undefined,
      storyboardBoardId: input.boardId,
      storyboardShotId: shot.id,
      versions: []
    });
    clips.push(shotClip);
    // A held keyframe is a still: there is no rendered clip to take sound from.
    if (clipAssetId) {
      clips.push(shotAudioClip(shotClip, shotAudioTrack.id));
      hasShotAudio = true;
    }
    cursorMs += durationMs;
  }
  if (hasShotAudio) {
    tracks.push(shotAudioTrack);
  }

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    stillShotIds
  };
}
