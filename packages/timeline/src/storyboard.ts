/**
 * Storyboard → timeline assembly.
 *
 * The one mapping from a board's rendered shots to a timeline document, shared
 * by the web surface (`ui_storyboard_assemble_timeline`) and the server-side
 * `assemble_storyboard_timeline` agent tool, so a cut assembled headlessly is
 * the same cut the editor would have produced.
 *
 * Rendered shots become imported, asset-backed video clips laid end to end in
 * shot order, each as long as the footage it holds, and each stamped with
 * `storyboardBoardId`/`storyboardShotId` so a later shot revision can
 * round-trip into the cut. Every shot clip also gets an audio twin on its own
 * track (`shotAudioClip`), because the preview and the export mute video
 * elements and take sound only from audio clips. Narration and music become
 * draft text-to-audio clips on their own tracks — the timeline's generation
 * machinery renders them on demand.
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
  /**
   * Shots whose place in the cut is not the length of the footage they hold.
   * Empty for a plain storyboard cut, which lays every shot down at its
   * rendered length; a jointly assembled cut fills it, because there the
   * words decide how long a shot runs.
   */
  trimmedShots: TrimmedShot[];
  /**
   * Shots laid down at a length other than the one they were directed at, and
   * what each was directed at. A model returns the length it returns: saying
   * which shots came back off-plan is what lets a caller re-render or re-time
   * on purpose instead of discovering it in playback.
   */
  retimedShots: RetimedShot[];
}

/** A shot whose source footage does not match its place in the cut. */
export interface TrimmedShot {
  shotId: string;
  /** Length used on the timeline. */
  usedMs: number;
  /** Length of the rendered source. */
  sourceMs: number;
}

/** A shot whose length in the cut is not the length it was directed at. */
export interface RetimedShot {
  shotId: string;
  /** Length used on the timeline. */
  usedMs: number;
  /** Length `duration_seconds` asked for, or the default. */
  directedMs: number;
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

/** Clip length a shot was directed at: its target duration, or the default. */
export const shotDurationMs = (shot: Shot): number =>
  typeof shot.duration_seconds === "number" && shot.duration_seconds > 0
    ? Math.round(shot.duration_seconds * 1000)
    : DEFAULT_SHOT_MS;

/** Length of the footage a shot's selected clip actually holds, when known. */
export const shotSourceDurationMs = (shot: Shot): number | null => {
  const seconds = shot.clip?.duration;
  return typeof seconds === "number" && seconds > 0
    ? Math.round(seconds * 1000)
    : null;
};

/** Shots by id, for resolving {@link Shot.covered_by}. */
export const shotsById = (shots: readonly Shot[]): Map<string, Shot> =>
  new Map(shots.map((shot) => [shot.id, shot]));

/**
 * Where a shot's picture comes from: its own clip, or a window into another's.
 *
 * Assembly used to read `shot.clip` directly, so a shot covered by a fused
 * generation had no picture at all and was skipped — the run that hit this
 * trimmed the fused clips onto the track by hand and the board never caught up.
 */
export interface ShotSource {
  /** The asset the clip plays. */
  assetId: string;
  /** The shot that owns it — this shot, unless it is covered. */
  sourceShotId: string;
  /** Where this shot starts inside that asset, in ms. */
  inPointMs: number;
  /**
   * Footage available from `inPointMs` on, or null when the asset's length is
   * unknown and no coverage window pins it.
   */
  availableMs: number | null;
  /**
   * Length somebody's window fixes rather than the direction: the coverage
   * window when this shot is covered, the point another shot cuts into this
   * one's clip when it is not. Null when nothing but the shot itself decides.
   */
  windowMs: number | null;
}

export interface ShotSourceOptions {
  /**
   * Require the shot's lifecycle status to be `rendered`, as assembly does.
   * The in-editor preview passes false: it plays a selected take while the
   * board is still working, and its own tests pin that.
   */
  requireRendered?: boolean;
  /**
   * Where another shot cuts into each clip, from {@link coverageClaims}. A
   * shot that owns a fused generation plays only up to the first slice
   * somebody else took out of it.
   */
  claims?: ReadonlyMap<string, number>;
}

/** Whether a shot has a clip of its own to play, under a caller's bar. */
const playableShot = (shot: Shot, options?: ShotSourceOptions): boolean =>
  options?.requireRendered === false
    ? assetIdOf(shot.clip) !== undefined
    : isAssemblableShot(shot);

/**
 * The earliest point another shot cuts into each shot's clip.
 *
 * A fused generation lands on the first shot of the run and the rest name it
 * in `covered_by`. Its owner holds the whole asset, so a cut that laid it down
 * at its full length would play the whole run and then play the covered slices
 * again after it. The claim is where the owner's own picture ends.
 */
export function coverageClaims(
  shots: readonly Shot[],
  options?: ShotSourceOptions
): Map<string, number> {
  const claims = new Map<string, number>();
  for (const shot of shots) {
    const coveringId = shot.covered_by?.shot_id;
    // A shot with a clip of its own plays it and never reaches its coverage,
    // so it takes nothing out of the covering shot.
    if (!coveringId || coveringId === shot.id || playableShot(shot, options)) {
      continue;
    }
    const startMs = Math.max(
      0,
      Math.round((shot.covered_by?.start_seconds ?? 0) * 1000)
    );
    const claimed = claims.get(coveringId);
    if (claimed === undefined || startMs < claimed) {
      claims.set(coveringId, startMs);
    }
  }
  return claims;
}

/**
 * Resolve a shot's picture, following {@link Shot.covered_by} one hop.
 *
 * Returns null for a shot that has neither its own clip nor a covering shot
 * that has one — the same shots assembly skipped before.
 */
export function shotSource(
  shot: Shot,
  byId?: ReadonlyMap<string, Shot>,
  options?: ShotSourceOptions
): ShotSource | null {
  const playable = (candidate: Shot): boolean =>
    playableShot(candidate, options);
  if (playable(shot)) {
    const sourceMs = shotSourceDurationMs(shot);
    // The head of the clip, when other shots cover the rest of it.
    const claimMs = options?.claims?.get(shot.id) ?? null;
    return {
      assetId: shot.clip!.asset_id as string,
      sourceShotId: shot.id,
      inPointMs: 0,
      availableMs:
        claimMs === null
          ? sourceMs
          : sourceMs === null
            ? claimMs
            : Math.min(sourceMs, claimMs),
      windowMs: claimMs
    };
  }
  const coverage = shot.covered_by;
  if (!coverage || !byId) return null;
  const cover = byId.get(coverage.shot_id);
  // One hop: a covering shot that is itself covered has no source length to
  // measure a window against.
  if (!cover || !playable(cover)) return null;
  const inPointMs = Math.max(0, Math.round((coverage.start_seconds ?? 0) * 1000));
  const windowMs =
    typeof coverage.end_seconds === "number" && coverage.end_seconds > 0
      ? Math.max(0, Math.round(coverage.end_seconds * 1000) - inPointMs)
      : null;
  const coverSourceMs = shotSourceDurationMs(cover);
  const remainingMs =
    coverSourceMs === null ? null : Math.max(0, coverSourceMs - inPointMs);
  const availableMs =
    windowMs === null
      ? remainingMs
      : remainingMs === null
        ? windowMs
        : Math.min(windowMs, remainingMs);
  return {
    assetId: cover.clip!.asset_id as string,
    sourceShotId: cover.id,
    inPointMs,
    availableMs,
    windowMs
  };
}

/**
 * Every shot's picture in one pass: the coverage claims are computed once and
 * shared, so resolving a board is linear in the number of shots.
 */
export function shotSources(
  shots: readonly Shot[],
  options?: ShotSourceOptions
): Map<string, ShotSource | null> {
  const byId = shotsById(shots);
  const resolveOptions: ShotSourceOptions = {
    ...options,
    claims: coverageClaims(shots, options)
  };
  return new Map(
    shots.map((shot) => [shot.id, shotSource(shot, byId, resolveOptions)])
  );
}

/** Whether a shot's picture is a window into another shot's clip. */
export const isCoveredShot = (shot: Shot): boolean =>
  !isAssemblableShot(shot) && !!shot.covered_by?.shot_id;

/** How a shot's laid-down length was decided. */
export interface ShotLayout {
  /** Length on the timeline. */
  durationMs: number;
  /** Explicit source window, set whenever the source length is known. */
  inPointMs?: number;
  outPointMs?: number;
  /** Length the shot was directed at: `duration_seconds`, or the default. */
  directedMs: number;
}

/**
 * Lay a shot down at the length of the footage that came back.
 *
 * A video model returns what it returns: eight shots directed at 1.0-3.5s all
 * rendered as 5.184s. Assembly used to cut each clip down to its directed
 * length, so most of every render was discarded before anyone saw it. The
 * render is the picture, so it is the clip: a shot whose source length is
 * known plays all of it, and `duration_seconds` only decides the length of a
 * shot whose footage cannot be measured.
 *
 * A covered shot is cut out of the middle of someone else's clip, so its
 * coverage window is the footage it has — `shotSource` already folds the
 * window into `availableMs` — and that window is what it plays.
 */
export function layoutShot(shot: Shot, source?: ShotSource | null): ShotLayout {
  const resolved = source === undefined ? shotSource(shot) : source;
  const available = resolved?.availableMs ?? null;
  const inPointMs = resolved?.inPointMs ?? 0;
  const directedMs = shotDurationMs(shot);
  if (available === null) {
    // No source length to lay down. The window is still written when the shot
    // starts inside someone else's clip, or it would play that clip's head.
    const layout: ShotLayout = { durationMs: directedMs, directedMs };
    if (inPointMs > 0) {
      layout.inPointMs = inPointMs;
      layout.outPointMs = inPointMs + directedMs;
    }
    return layout;
  }
  return {
    durationMs: available,
    inPointMs,
    outPointMs: inPointMs + available,
    directedMs
  };
}

export function buildStoryboardTimeline(
  input: StoryboardAssemblyInput
): AssembledTimeline {
  const ordered = [...input.shots].sort((a, b) => a.index - b.index);
  const sources = shotSources(input.shots);
  const assemblable = ordered.filter((s) => sources.get(s.id) != null);
  const skippedShotIds = ordered
    .filter((s) => sources.get(s.id) == null)
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
  const retimedShots: RetimedShot[] = [];
  for (const shot of assemblable) {
    const source = sources.get(shot.id) ?? null;
    const layout = layoutShot(shot, source);
    const durationMs = layout.durationMs;
    // A shot cut to a coverage window is exactly as long as the caller asked
    // for when they split the generation; only a shot playing a clip of its
    // own can come back off the length it was directed at.
    if (source?.windowMs === null && durationMs !== layout.directedMs) {
      retimedShots.push({
        shotId: shot.id,
        usedMs: durationMs,
        directedMs: layout.directedMs
      });
    }
    const videoClip = makeClip({
      trackId: shotTrack.id,
      name: shot.slug ?? `Shot ${shot.index + 1}`,
      startMs: cursorMs,
      durationMs,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: source?.assetId,
      linkId: createTimeOrderedUuid(),
      storyboardBoardId: input.boardId,
      storyboardShotId: shot.id,
      versions: []
    });
    // The window is written only when the source length is known: an unknown
    // length leaves the clip exactly as it was before assembly could read one.
    if (layout.inPointMs !== undefined) {
      videoClip.inPointMs = layout.inPointMs;
      videoClip.outPointMs = layout.outPointMs;
    }
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

  return {
    tracks,
    clips,
    durationMs: cursorMs,
    skippedShotIds,
    // Nothing is trimmed: every shot is laid down at the length of the
    // footage it holds, so no clip leaves any of its render unplayed.
    trimmedShots: [],
    retimedShots
  };
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

  const sources = shotSources(input.shots, { requireRendered: false });
  let cursorMs = 0;
  for (const shot of ordered) {
    const source = sources.get(shot.id) ?? null;
    const clipAssetId = source?.assetId;
    const stillAssetId = clipAssetId ? undefined : assetIdOf(shot.keyframe);
    const assetId = clipAssetId ?? stillAssetId;
    if (!assetId) {
      skippedShotIds.push(shot.id);
      continue;
    }
    if (stillAssetId) {
      stillShotIds.push(shot.id);
    }

    // A held keyframe is a still with no source length of its own; only a
    // real clip gets fitted to its footage.
    const directedMs = shotDurationMs(shot);
    const layout: ShotLayout = clipAssetId
      ? layoutShot(shot, source)
      : { durationMs: directedMs, directedMs };
    const durationMs = layout.durationMs;
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
    if (layout.inPointMs !== undefined) {
      shotClip.inPointMs = layout.inPointMs;
      shotClip.outPointMs = layout.outPointMs;
    }
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
