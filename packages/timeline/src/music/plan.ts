/**
 * The music planner (MUSIC-MODE.md section 8, MD12).
 *
 * One pure function from the tempo, the selection on one track, the tracks
 * and the audio clips to a plan: the operation the selection implies (GN-4),
 * the operations that would produce a valid request, one line that says why,
 * and the frame windows of the request (GN-5, GN-6). The panel calls it on
 * every selection change. The job module calls it once at submission and
 * turns the plan into the `music` object of `generate_media` with
 * `planToMusicRequest`.
 *
 * Every frame counts 48 kHz frames. Selection frames are timeline positions.
 * `segments` and `region` count from the window start, and `splice` counts
 * frames in the clip's active take asset.
 *
 * `native/timeline/src/music/MusicPlan.cpp` is the port, held to this file by
 * the music oracle (`native/timeline/src/music/music-oracle.test.ts`).
 */

import {
  MUSIC_MAX_WINDOW_SECONDS,
  MUSIC_MIN_WINDOW_SECONDS,
  MUSIC_SAMPLE_RATE,
  type MusicGenerationRequest
} from "@nodetool-ai/protocol";
import { MUSIC_TASKS } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { sourceRate } from "../sourceRate.js";
import type {
  MusicKey,
  MusicRole,
  MusicTask,
  TimelineClip,
  TimelineTempo,
  TimelineTrack
} from "../types.js";
import {
  barStartFrame,
  beatLengthFrames,
  beatStartFrame,
  gridLineAtOrAfter,
  gridLineAtOrBefore,
  msToFrame
} from "./frames.js";
import { musicTempoRefusal } from "./tempoRules.js";

/** What the person names an operation. */
export const MUSIC_OPERATION_LABELS: Readonly<Record<MusicTask, string>> = {
  text2music: "Generate",
  repaint: "Regenerate",
  lego: "Add instrument"
};

/** Shortest window, and longest window or request, in frames. */
export const MUSIC_MIN_WINDOW_FRAMES = MUSIC_MIN_WINDOW_SECONDS * MUSIC_SAMPLE_RATE;
export const MUSIC_MAX_WINDOW_FRAMES = MUSIC_MAX_WINDOW_SECONDS * MUSIC_SAMPLE_RATE;
/** Bars of pre-roll a context window may reach back (GN-5 rule 2). */
export const MUSIC_MAX_PREROLL_BARS = 2;

/** A half-open frame range `[startFrame, endFrame)`. */
export interface MusicFrameRange {
  startFrame: number;
  endFrame: number;
}

/** The generation target: one track and a range on it (MD10). */
export interface MusicSelection extends MusicFrameRange {
  trackId: string;
}

export type MusicPlanTrack = Pick<TimelineTrack, "id" | "type"> &
  Partial<Pick<TimelineTrack, "muted" | "solo" | "musicRole">>;

export type MusicPlanClip = Pick<TimelineClip, "id" | "trackId" | "startMs" | "durationMs" | "mediaType"> &
  Partial<
    Pick<TimelineClip, "inPointMs" | "muted" | "speedMultiplier" | "speedBaked" | "timeRemap" | "currentAssetId">
  >;

export interface MusicPlanInput {
  tempo: TimelineTempo;
  selection: MusicSelection;
  tracks: ReadonlyArray<MusicPlanTrack>;
  /** Clips of every media type. Only audio clips take part. */
  clips: ReadonlyArray<MusicPlanClip>;
  /** An operation the person chose over the inferred one. */
  operation?: MusicTask;
}

export type MusicPlanRefusal =
  | "invalid_selection"
  | "no_track"
  | "not_audio_track"
  | "tempo"
  | "partial_overlap"
  | "several_clips"
  | "no_clip"
  | "occupied"
  | "speed"
  | "time_remap"
  | "no_asset"
  | "missing_role"
  | "no_context"
  | "window_too_long";

export interface MusicPlan {
  /** The GN-4 row the selection falls in. Null for a partial overlap or several clips. */
  inferred: MusicTask | null;
  /** Operations that give a valid request, in `MUSIC_TASKS` order. */
  valid: MusicTask[];
  /** The chosen operation: the override, else the inferred one. */
  operation: MusicTask | null;
  /** One line for the panel: why this operation, or why none. */
  reason: string;
  /** Set when no request can be built. */
  refusal?: MusicPlanRefusal;
  target: MusicSelection;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  key?: MusicKey;
  /** Timeline frame of the window start. Absent when refused. */
  windowStartFrame?: number;
  /** Window length asked of the model. */
  requestFrames?: number;
  /** Generate: where the first beat sits in the window. */
  beatPhaseFrames?: number;
  /** Generate: `k` segments of the target length inside the window (GN-6). */
  segments?: MusicFrameRange[];
  /** Regenerate and Add instrument: the target range inside the window. */
  region?: MusicFrameRange;
  /** Regenerate: the clip whose bars are replaced. */
  clipId?: string;
  /** Regenerate: the region's frames in the clip's active take asset. */
  splice?: { parentAssetId: string; startFrame: number; endFrame: number };
  /** Add instrument: the stem to add. */
  trackRole?: MusicRole;
}

interface Refused {
  refusal: MusicPlanRefusal;
  message: string;
}

type Windows = Pick<
  MusicPlan,
  "windowStartFrame" | "requestFrames" | "beatPhaseFrames" | "segments" | "region" | "clipId" | "splice" | "trackRole"
>;

interface FrameClip {
  clip: MusicPlanClip;
  startFrame: number;
  endFrame: number;
}

const overlaps = (c: FrameClip, from: number, to: number): boolean => c.startFrame < to && c.endFrame > from;

const TOO_LONG = (label: string): string =>
  `${label} needs a window of at most ${MUSIC_MAX_WINDOW_SECONDS} seconds. Select a shorter range.`;

/**
 * GN-5: the window starts on the bar line at or before the target start,
 * reaches back up to two bars while the context has audio there, ends on the
 * bar line at or after the target end and grows in whole bars to 10 seconds.
 * A window that would start before frame 0 starts at frame 0.
 */
function contextWindow(
  tempo: TimelineTempo,
  target: MusicFrameRange,
  context: ReadonlyArray<FrameClip>
): MusicFrameRange {
  let startBar = gridLineAtOrBefore(target.startFrame, tempo, "bar");
  for (let step = 0; step < MUSIC_MAX_PREROLL_BARS; step += 1) {
    const from = barStartFrame(startBar - 1, tempo);
    if (from < 0 || !context.some((c) => overlaps(c, from, barStartFrame(startBar, tempo)))) break;
    startBar -= 1;
  }
  const startFrame = Math.max(0, barStartFrame(startBar, tempo));
  let endBar = gridLineAtOrAfter(target.endFrame, tempo, "bar");
  while (barStartFrame(endBar, tempo) - startFrame < MUSIC_MIN_WINDOW_FRAMES) endBar += 1;
  return { startFrame, endFrame: barStartFrame(endBar, tempo) };
}

function planGenerate(tempo: TimelineTempo, target: MusicFrameRange, onTrack: FrameClip[]): Windows | Refused {
  const label = MUSIC_OPERATION_LABELS.text2music;
  if (onTrack.length > 0) {
    return { refusal: "occupied", message: `${label} needs an empty range. The range overlaps a clip on this track.` };
  }
  const length = target.endFrame - target.startFrame;
  const k = Math.max(1, Math.ceil(MUSIC_MIN_WINDOW_FRAMES / length));
  const requestFrames = k * length + beatLengthFrames(tempo);
  if (requestFrames > MUSIC_MAX_WINDOW_FRAMES) return { refusal: "window_too_long", message: TOO_LONG(label) };
  const firstBeat = beatStartFrame(gridLineAtOrAfter(target.startFrame, tempo, "beat"), tempo);
  const segments: MusicFrameRange[] = [];
  for (let i = 0; i < k; i += 1) segments.push({ startFrame: i * length, endFrame: (i + 1) * length });
  return {
    windowStartFrame: target.startFrame,
    requestFrames,
    beatPhaseFrames: firstBeat - target.startFrame,
    segments
  };
}

function inWindow(
  tempo: TimelineTempo,
  target: MusicFrameRange,
  context: ReadonlyArray<FrameClip>,
  label: string
): { window: MusicFrameRange; region: MusicFrameRange } | Refused {
  const window = contextWindow(tempo, target, context);
  if (window.endFrame - window.startFrame > MUSIC_MAX_WINDOW_FRAMES) {
    return { refusal: "window_too_long", message: TOO_LONG(label) };
  }
  return {
    window,
    region: { startFrame: target.startFrame - window.startFrame, endFrame: target.endFrame - window.startFrame }
  };
}

function planRegenerate(
  tempo: TimelineTempo,
  target: MusicFrameRange,
  onTrack: FrameClip[],
  dryContext: FrameClip[]
): Windows | Refused {
  const label = MUSIC_OPERATION_LABELS.repaint;
  if (onTrack.length === 0) {
    return { refusal: "no_clip", message: `${label} needs a range inside one clip.` };
  }
  if (onTrack.length > 1) {
    return { refusal: "several_clips", message: `${label} needs a range inside one clip. The range spans several clips.` };
  }
  const only = onTrack[0];
  if (only.startFrame > target.startFrame || only.endFrame < target.endFrame) {
    return { refusal: "partial_overlap", message: `${label} needs a range inside one clip. The range reaches past the clip's edge.` };
  }
  const clip = only.clip;
  if (sourceRate(clip) !== 1) {
    return { refusal: "speed", message: `${label} cannot replace bars in a clip that plays at a speed other than 1.` };
  }
  if (clip.timeRemap) {
    return { refusal: "time_remap", message: `${label} cannot replace bars in a clip with a time remap.` };
  }
  if (!clip.currentAssetId) {
    return { refusal: "no_asset", message: `${label} needs a clip with audio.` };
  }
  // The context of a repaint is the target track (GN-5 rule 2).
  const placed = inWindow(tempo, target, dryContext, label);
  if ("refusal" in placed) return placed;
  const spliceStart = msToFrame(clip.inPointMs ?? 0) + (target.startFrame - only.startFrame);
  return {
    windowStartFrame: placed.window.startFrame,
    requestFrames: placed.window.endFrame - placed.window.startFrame,
    region: placed.region,
    clipId: clip.id,
    splice: {
      parentAssetId: clip.currentAssetId,
      startFrame: spliceStart,
      endFrame: spliceStart + (target.endFrame - target.startFrame)
    }
  };
}

function planAddInstrument(
  tempo: TimelineTempo,
  target: MusicFrameRange,
  onTrack: FrameClip[],
  others: FrameClip[],
  role: MusicRole | undefined
): Windows | Refused {
  const label = MUSIC_OPERATION_LABELS.lego;
  if (onTrack.length > 0) {
    return { refusal: "occupied", message: `${label} needs an empty range. The range overlaps a clip on this track.` };
  }
  if (!role) {
    return { refusal: "missing_role", message: `${label} needs a role on the target track.` };
  }
  if (!others.some((c) => overlaps(c, target.startFrame, target.endFrame))) {
    return { refusal: "no_context", message: `${label} needs audible audio on another track in the range.` };
  }
  const placed = inWindow(tempo, target, others, label);
  if ("refusal" in placed) return placed;
  return {
    windowStartFrame: placed.window.startFrame,
    requestFrames: placed.window.endFrame - placed.window.startFrame,
    region: placed.region,
    trackRole: role
  };
}

function isFrame(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Plan a music operation for a selection (section 8). */
export function planMusicOperation(input: MusicPlanInput): MusicPlan {
  const { tempo, selection } = input;
  const plan: MusicPlan = {
    inferred: null,
    valid: [],
    operation: null,
    reason: "",
    target: { trackId: selection.trackId, startFrame: selection.startFrame, endFrame: selection.endFrame },
    bpm: tempo.bpm,
    beatsPerBar: tempo.timeSignature.beatsPerBar,
    beatUnit: tempo.timeSignature.beatUnit,
    ...(tempo.key ? { key: { tonic: tempo.key.tonic, mode: tempo.key.mode } } : {})
  };
  const refuse = (refusal: MusicPlanRefusal, reason: string): MusicPlan => ({ ...plan, refusal, reason });

  if (!isFrame(selection.startFrame) || !isFrame(selection.endFrame) || selection.endFrame <= selection.startFrame) {
    return refuse("invalid_selection", "Select a range on one track.");
  }
  const track = input.tracks.find((t) => t.id === selection.trackId);
  if (!track) return refuse("no_track", "The selected track is not in this sequence.");
  if (track.type !== "audio") return refuse("not_audio_track", "Music generation needs an audio track.");

  const target: MusicFrameRange = { startFrame: selection.startFrame, endFrame: selection.endFrame };
  const tracksById = new Map(input.tracks.map((t) => [t.id, t]));
  const anySolo = input.tracks.some((t) => (t.type === "audio" || t.type === "midi") && t.solo === true);
  const audibleTrack = (t: MusicPlanTrack | undefined): boolean =>
    t !== undefined && t.muted !== true && (!anySolo || t.solo === true);
  const audio: FrameClip[] = input.clips
    .filter((c) => c.mediaType === "audio")
    .map((clip) => {
      const startFrame = msToFrame(clip.startMs);
      return { clip, startFrame, endFrame: startFrame + msToFrame(clip.durationMs) };
    });
  // The target track as the dry bounce renders it: every clip except muted ones.
  const onTrackAll = audio.filter((c) => c.clip.trackId === track.id);
  const overlapping = onTrackAll.filter((c) => overlaps(c, target.startFrame, target.endFrame));
  const others = audio.filter(
    (c) => c.clip.trackId !== track.id && c.clip.muted !== true && audibleTrack(tracksById.get(c.clip.trackId))
  );
  const othersInRange = others.some((c) => overlaps(c, target.startFrame, target.endFrame));

  if (overlapping.length === 0) {
    plan.inferred = othersInRange ? "lego" : "text2music";
  } else if (
    overlapping.length === 1 &&
    overlapping[0].startFrame <= target.startFrame &&
    overlapping[0].endFrame >= target.endFrame
  ) {
    plan.inferred = "repaint";
  }

  const tempoProblem = musicTempoRefusal(tempo);
  const dryContext = onTrackAll.filter((c) => c.clip.muted !== true);
  const build = (task: MusicTask): Windows | Refused => {
    if (task === "text2music") return planGenerate(tempo, target, overlapping);
    if (task === "repaint") return planRegenerate(tempo, target, overlapping, dryContext);
    return planAddInstrument(tempo, target, overlapping, others, track.musicRole);
  };
  const built = new Map<MusicTask, Windows | Refused>();
  for (const task of MUSIC_TASKS) built.set(task, build(task));
  if (tempoProblem === null) {
    plan.valid = MUSIC_TASKS.filter((task) => !("refusal" in built.get(task)!));
  }

  plan.operation = input.operation ?? plan.inferred;
  if (plan.operation === null) {
    return overlapping.length > 1
      ? refuse("several_clips", "Select a range inside one clip or an empty range. The range spans several clips.")
      : refuse("partial_overlap", "Select a range inside one clip or an empty range. The range reaches past a clip's edge.");
  }
  if (tempoProblem !== null) return refuse("tempo", tempoProblem);
  const result = built.get(plan.operation)!;
  if ("refusal" in result) return refuse(result.refusal, result.message);

  const label = MUSIC_OPERATION_LABELS[plan.operation];
  if (plan.operation !== plan.inferred) {
    plan.reason =
      plan.inferred === null
        ? `${label} is chosen.`
        : `${label} is chosen in place of ${MUSIC_OPERATION_LABELS[plan.inferred]}.`;
  } else if (plan.operation === "repaint") {
    plan.reason = "The range lies inside one clip, so Regenerate replaces these bars.";
  } else if (plan.operation === "lego") {
    plan.reason = "The range is empty and other tracks play here, so Add instrument follows them.";
  } else {
    plan.reason = "The range is empty and no other track plays here, so Generate creates a clip.";
  }
  return { ...plan, ...result };
}

/** What the job module adds to a plan to make a request. */
export interface MusicRequestExtras {
  candidates: number;
  seed?: number;
  steps?: number;
  lmModel?: string;
  audioCodes?: string;
  /** The uploaded context bounce. Required for Regenerate and Add instrument. */
  contextAssetId?: string;
  /** Generate: measure and correct the grid offset. Defaults to true. */
  align?: boolean;
}

const wireRange = (r: MusicFrameRange): { start_frame: number; end_frame: number } => ({
  start_frame: r.startFrame,
  end_frame: r.endFrame
});

/**
 * The `music` object of `generate_media` for a plan (section 10). The fields
 * map one to one onto `musicGenerationRequestSchema`. Throws for a refused
 * plan, and for Regenerate or Add instrument without a context asset.
 */
export function planToMusicRequest(plan: MusicPlan, extras: MusicRequestExtras): MusicGenerationRequest {
  if (plan.refusal || plan.operation === null || plan.windowStartFrame === undefined || plan.requestFrames === undefined) {
    throw new Error(`A refused plan has no request: ${plan.reason}`);
  }
  const task = plan.operation;
  if (task !== "text2music" && !extras.contextAssetId) {
    throw new Error(`${MUSIC_OPERATION_LABELS[task]} needs the context bounce's asset id.`);
  }
  const request: MusicGenerationRequest = {
    task,
    bpm: plan.bpm,
    // musicTempoRefusal accepted the signature, so these are the schema's literals.
    beats_per_bar: plan.beatsPerBar as MusicGenerationRequest["beats_per_bar"],
    beat_unit: plan.beatUnit as MusicGenerationRequest["beat_unit"],
    candidates: extras.candidates,
    request_frames: plan.requestFrames,
    window_start_frame: plan.windowStartFrame
  };
  if (plan.key) request.key = plan.key;
  if (extras.seed !== undefined) request.seed = extras.seed;
  if (extras.steps !== undefined) request.steps = extras.steps;
  if (extras.lmModel !== undefined) request.lm_model = extras.lmModel;
  if (extras.audioCodes !== undefined) request.audio_codes = extras.audioCodes;
  if (task === "text2music") {
    request.beat_phase_frames = plan.beatPhaseFrames;
    request.segments = (plan.segments ?? []).map(wireRange);
    request.align = extras.align ?? true;
    return request;
  }
  request.context_asset_id = extras.contextAssetId;
  if (plan.region) request.region = wireRange(plan.region);
  if (task === "repaint" && plan.splice) {
    request.splice = {
      parent_asset_id: plan.splice.parentAssetId,
      start_frame: plan.splice.startFrame,
      end_frame: plan.splice.endFrame
    };
  }
  if (task === "lego") request.track_role = plan.trackRole;
  return request;
}
