/**
 * Headless bridge for the timeline / video editor tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/timeline.ts`) delegate to
 * a `TimelineAgentHandler` the live `TimelineEditor` registers per open
 * sequence on `timelineAgentBridge` — it mutates Zustand document/UI/playback
 * stores and (for `ui_timeline_get_clip_frames`) samples rendered video
 * frames. None of that can run under Node. This bridge reimplements the
 * *effects* of the non-rendering tools against a plain in-memory sequence
 * (tracks + clips from `@nodetool-ai/timeline`), so a model can drive the same
 * `ui_timeline_*` tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter shapes are copied verbatim from the builtin file (minus the
 * `timeline_id` parameter — this bridge holds a single implicit sequence, so
 * there is nothing to disambiguate). `ui_timeline_get_clip_frames` is
 * intentionally excluded: it requires real rendered video frames and has no
 * meaningful headless equivalent.
 *
 * Real cut/preset logic is reused from the pure `@nodetool-ai/timeline`
 * package (`splitClip`, `ANIMATION_PRESETS`, `makeClip`/`makeTrack`) rather
 * than reimplemented, so this bridge exercises the same behavior the live
 * editor does.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  ANIMATION_PRESETS,
  ANIMATED_PROPERTIES,
  makeClip,
  makeTrack,
  STAGGER_UNITS,
  parseEasing,
  parseStaggerUnit,
  DEFAULT_BEAT_TOLERANCE_MS,
  type AnimationRole,
  type CustomClipAnimation,
  type TimelineClip,
  type TimelineMarker,
  type TimelineTrack,
  type ClipAnimation,
  type TimelineComposition
} from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  type AddMarkerOp,
  type AddMediaClipOp,
  type AddGroupOp,
  type AddTextClipOp,
  type AnimateClipOp,
  type GenerateClipOp,
  type InsertCompositionOp,
  type MoveClipOp,
  type SetClipBindingOp,
  type SetClipParamsOp,
  type SetEffectsOp,
  type SetMaskOp,
  type SetMatteOp,
  type SetParentOp,
  type SetMarkersFromBeatsOp,
  type SetTimeRemapOp,
  type SetTransitionOp,
  type SnapToBeatsOp,
  type TimelineOp,
  type TimelineOpContext,
  type TimelineOpIdKind,
  type TimelineOpState,
  type TrimClipOp
} from "@nodetool-ai/timeline/ops";
import {
  computeActiveLayers,
  countTextStaggerUnits,
  parseSvgPath
} from "@nodetool-ai/timeline/scene";
import {
  addGroupParams,
  captionStyleParams,
  effectParams,
  maskParams,
  matteParams,
  partialTextStyleParams,
  deleteTrackShape,
  withTextClipRemedies,
  DELETE_TRACK_DESCRIPTION,
  setParentParams,
  setTimeRemapParams,
  timeRemapParams,
  shapeStyleParams,
  ADD_SHAPE_CLIP_DESCRIPTION,
  ADD_TEXT_CLIP_DESCRIPTION,
  ADD_TRACK_DESCRIPTION,
  clipOpacityParam,
  MOVE_TRACK_DESCRIPTION,
  moveTrackShape,
  trackTargetParam,
  targetParam,
  textStyleParams,
  transitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";
import { findSystemSkill } from "../../system-skills.js";

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

/** Units a failed lookup names before it stops and points at get_state. */
const MAX_LISTED_UNITS = 12;

/**
 * The `custom` preset's inputs. Values are checked by
 * `normalizeCustomCurves`/`resolveCustomMask` rather than by Zod: those are the
 * gates the compiler and the validator already run, and a second, looser copy
 * of the rules here would refuse or admit different curves than the engine.
 */
const customCurvesParam = z
  .array(
    z.object({
      property: z
        .string()
        .describe(`One of: ${ANIMATED_PROPERTIES.join(", ")}.`),
      keyframes: z
        .array(
          z.object({
            t: z.number().describe("0..1 across the animation's window."),
            value: z.number(),
            easing: z.string().optional()
          })
        )
        .min(1)
    })
  )
  .optional()
  .describe(
    'Keyframes for `preset: "custom"`. Exactly one of `curves` and `code`.'
  );

const customCodeParam = z
  .string()
  .optional()
  .describe(
    'JS body for `preset: "custom"`, baked into curves once. It returns ' +
      "`{curves}` or `{samples}` and reads its clip context off `inputs`. " +
      "Exactly one of `curves` and `code`."
  );

const customMaskParam = z
  .object({
    direction: z.enum(["left", "right", "up", "down"]),
    softness: z.number().min(0).max(1)
  })
  .optional()
  .describe("Required when a curve drives wipeProgress, ignored otherwise.");

/**
 * What the bridge needs to know about an asset to place it as a clip. A host
 * that can read the asset table supplies {@link TimelineAssetResolver}; the
 * eval bridge seeds a fixed table instead, so the op is exercised with no
 * database in reach.
 */
export interface TimelineBridgeAsset {
  id: string;
  name: string;
  contentType: string;
  /** Length in ms, when the catalogue knows it. */
  durationMs?: number;
  thumbnailAssetId?: string;
}

/** Look up an asset by id or `asset://<id>[.ext]` URI. */
/**
 * Reads a composition by id and lists what is available. The bridge holds no
 * library of its own: a capability run resolves shipped files and the caller's
 * assets, and an eval hands over a fixture.
 */
export interface TimelineCompositionLoader {
  get(id: string): Promise<TimelineComposition | null>;
  listIds(): Promise<string[]>;
}

export type TimelineAssetResolver = (
  ref: string
) => Promise<TimelineBridgeAsset | null>;

/** A whole sequence handed to the bridge as-is, fields and all. */
export interface TimelineBridgeSequenceSeed {
  fps?: number;
  width?: number;
  height?: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** The document's markers. Absent reads as a sequence with none. */
  markers?: TimelineMarker[];
}

/**
 * One custom-animation bake: a JS body plus the clip context it is written
 * against. The bridge never runs the body itself — a sandbox belongs to the
 * host, so `edit_timeline` hands `bakeCustomAnimation` down and the eval
 * surface runs without one.
 */
export interface TimelineAnimationBakeRequest {
  code: string;
  role: AnimationRole;
  /** The animation's own window, in ms. */
  durationMs: number;
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  /** Stagger units the clip splits into (a text clip's word count), else 0. */
  staggerCount?: number;
}

/** What a bake returns. Mirrors `BakeCustomAnimationResult` minus the logs. */
export interface TimelineAnimationBakeResult {
  ok: boolean;
  curves?: CustomClipAnimation["curves"];
  mask?: { direction: string; softness: number };
  error?: string;
}

export type TimelineAnimationBaker = (
  request: TimelineAnimationBakeRequest
) => Promise<TimelineAnimationBakeResult>;

/** Case-supplied starting point for a run. */
export interface TimelineBridgeInitialState {
  fps?: number;
  width?: number;
  height?: number;
  /**
   * A real sequence to start from — every track and clip field preserved
   * (effects, animations, generation bindings, styles). Wins over the
   * `tracks`/`clips` shorthand below, which only carries what an eval case
   * needs to state a starting position. The bridge deep-clones it, so a caller
   * can hand over state it still owns.
   */
  sequence?: TimelineBridgeSequenceSeed;
  /**
   * Resolve an asset ref for `ui_timeline_add_media_clip`. Without one the op
   * reports that this surface has no asset lookup rather than inventing a
   * clip that points at nothing.
   */
  resolveAsset?: TimelineAssetResolver;
  /**
   * Bake a `preset: "custom"` animation's `code` into curves. Without one the
   * op says so and points at `curves`, rather than storing an animation whose
   * body nothing ever ran.
   */
  bakeAnimation?: TimelineAnimationBaker;
  /**
   * Resolve a composition for `ui_timeline_insert_composition`, and report the
   * ids this host offers so a bad one can name the alternatives. Without one
   * the op says this surface has no composition library rather than inventing
   * a template.
   */
  loadComposition?: TimelineCompositionLoader;
  /**
   * Offer `preview_timeline_frame` — a look at the layer stack at a timecode.
   * Off by default: `edit_timeline` builds this bridge too and reads its ops
   * off the `ui_timeline_` prefix, so a tool outside it would sit in that
   * catalogue as a verb nothing can call.
   */
  preview?: boolean;
  /**
   * The id `ui_timeline_get_state` reports. `edit_timeline` builds this bridge
   * against a real row and passes that row's id, because an agent reads the id
   * out of the state it just fetched and uses it in the next call — the eval
   * placeholder went out to real callers as the id of a sequence that does not
   * exist.
   */
  sequenceId?: string;
  tracks?: { name?: string; type: "video" | "audio" | "overlay" | "subtitle" }[];
  clips?: {
    name: string;
    trackIndex: number;
    mediaType?: TimelineClip["mediaType"];
    startMs: number;
    durationMs: number;
  }[];
}

/** Snapshot of the sequence handed to final-state predicates. */
export interface TimelineBridgeFinalState {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  playheadMs: number;
  tracks: { id: string; name: string; type: string; index: number }[];
  clips: {
    id: string;
    name: string;
    trackId: string;
    mediaType: string;
    startMs: number;
    durationMs: number;
    prompt?: string;
    animations: { role: string; preset: string }[];
  }[];
  /**
   * The full tracks and clips, not the reduced view above. Predicates read the
   * reduced shape; a host that has to reconstruct a document from the session
   * (the `nodetool timeline debug` harness) needs every field back.
   */
  documentTracks: TimelineTrack[];
  documentClips: TimelineClip[];
  /**
   * The document's markers. There is no reduced twin: a marker is four fields
   * wide, so a predicate and a document reader want the same shape.
   */
  markers: TimelineMarker[];
  /**
   * Every tool this bridge ran, in call order, by name — failed calls
   * included, because a call that errored still happened. A document cannot
   * say whether the agent *looked* at what it made: "previewed after the last
   * edit" is a fact about the transcript, and a final-state predicate is all
   * the runner hands a case.
   */
  toolLog: string[];
  /**
   * Every timecode `preview_timeline_frame` was asked for, in call order. The
   * tool names alone say a look happened; these say where it looked, which is
   * what {@link previewedMidMotion} grades.
   */
  previewTimesMs: number[];
}

/**
 * Tools that read the sequence without changing it. Everything else is an
 * edit, which is what {@link previewedAfterLastEdit} measures "last" against.
 */
export const TIMELINE_READ_ONLY_TOOLS: readonly string[] = [
  "ui_timeline_get_state",
  "ui_timeline_list_animation_presets",
  "ui_timeline_select_clip",
  "ui_timeline_seek",
  "preview_timeline_frame"
];

/**
 * The frame a predicate measures against. `staggerUnitsOf` wraps lines to it,
 * so a check run against the wrong size counts a vertical cut's lines as a
 * landscape one's. Every predicate takes it from the state it is grading.
 */
export interface TimelineFrameSize {
  width: number;
  height: number;
}

/** Whether the last edit in a transcript is followed by a preview call. */
export function previewedAfterLastEdit(toolLog: readonly string[]): boolean {
  const lastEdit = toolLog.reduce(
    (index, name, i) => (TIMELINE_READ_ONLY_TOOLS.includes(name) ? index : i),
    -1
  );
  if (lastEdit === -1) return false;
  return toolLog.indexOf("preview_timeline_frame", lastEdit + 1) !== -1;
}

/**
 * Whether a preview landed inside a motion rather than beside it.
 *
 * {@link previewedAfterLastEdit} reads the transcript's shape: a preview call
 * came last. That passes on a look at 0ms, where an entrance has not started —
 * the endpoints tell you nothing, which is what the skill's "sample the middle
 * of a motion" is about. This reads the timecodes instead: at least one falls
 * strictly inside the window of an animation the document now carries.
 *
 * Every animation in a graded final state is one the run authored, since the
 * seeded worlds carry none.
 */
export function previewedMidMotion(
  previewTimesMs: readonly number[],
  clips: readonly TimelineClip[],
  canvas: TimelineFrameSize
): boolean {
  if (previewTimesMs.length === 0) return false;
  return clips.some((clip) =>
    (clip.animations ?? []).some((animation) => {
      const window = animationWindow(clip, animation, canvas);
      if (!(window.endMs > window.startMs)) return false;
      return previewTimesMs.some(
        (timeMs) => timeMs > window.startMs && timeMs < window.endMs
      );
    })
  );
}

/**
 * How long an animation is in motion for: its own window, widened by the
 * stagger's last unit. `durationMs` unset takes the preset's default.
 */
function motionSpanMs(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: TimelineFrameSize
): number {
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  const durationMs = animation.durationMs ?? preset?.defaultDurationMs ?? 0;
  const stagger = animation.stagger;
  if (!stagger || !(stagger.offsetMs > 0)) return durationMs;
  const units = staggerUnitsOf(clip, stagger.unit, canvas);
  if (units < 2) return durationMs;
  return durationMs + stagger.offsetMs * (units - 1);
}

/**
 * When an animation runs, in timeline ms. `delayMs` offsets an `in` and an
 * `emphasis` from the clip's start and an `out` backwards from its end, which
 * is the role rule the skill states. A `loop` runs for the whole clip.
 */
export function animationWindow(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: TimelineFrameSize
): { startMs: number; endMs: number } {
  const clipEndMs = clip.startMs + clip.durationMs;
  if (animation.role === "loop") {
    return { startMs: clip.startMs, endMs: clipEndMs };
  }
  const delayMs = animation.delayMs ?? 0;
  const spanMs = motionSpanMs(clip, animation, canvas);
  if (animation.role === "out") {
    const endMs = clipEndMs - delayMs;
    return { startMs: endMs - spanMs, endMs };
  }
  const startMs = clip.startMs + delayMs;
  return { startMs, endMs: startMs + spanMs };
}

/**
 * Whether a staggered animation finishes inside its clip: the last unit
 * starts `offsetMs × (units − 1)` in and still runs the full `durationMs`.
 * An animation with no stagger, or one on a clip that splits into fewer than
 * two units, fits by construction — it is one block.
 */
export function staggerSpanFitsClip(
  clip: TimelineClip,
  animation: ClipAnimation,
  canvas: TimelineFrameSize
): boolean {
  const stagger = animation.stagger;
  if (!stagger || !(stagger.offsetMs > 0)) return true;
  if (staggerUnitsOf(clip, stagger.unit, canvas) < 2) return true;
  const span = (animation.delayMs ?? 0) + motionSpanMs(clip, animation, canvas);
  return span <= clip.durationMs;
}

/**
 * How many units a clip's text splits into for a stagger unit. `character`
 * counts grapheme clusters plus one unit per gap between words; `line` wraps
 * against `canvas`, and with no text measurer every authored paragraph is one
 * line, which is what a headless surface can know.
 */
export function staggerUnitsOf(
  clip: TimelineClip,
  unit: string,
  canvas: TimelineFrameSize
): number {
  const style = clip.textStyle;
  const parsed = parseStaggerUnit(unit);
  // An unknown unit compiles as a plain block animation, so it splits into
  // nothing — same answer as a clip with no text.
  if (!style || !parsed) return 0;
  return countTextStaggerUnits(style, canvas, parsed);
}

/**
 * The easing an animation actually runs with: its own, else the preset's, else
 * the role default (`in` decelerates, `out` accelerates).
 */
export function effectiveEasing(animation: ClipAnimation): string {
  if (animation.easing) return animation.easing;
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  if (preset?.defaultEasing) return preset.defaultEasing;
  switch (animation.role) {
    case "in":
      return "easeOut";
    case "out":
      return "easeIn";
    case "emphasis":
      return "easeInOut";
    default:
      return "linear";
  }
}

/** How far either side of the curve a slope is measured over. */
const EASING_SLOPE_STEP = 0.02;

/**
 * Whether an easing decelerates into its landing.
 *
 * The `easeOut` family qualifies by name: its endpoints are exact, and
 * `easeOutBounce` deliberately accelerates into its last bounce, which a slope
 * reading at t=1 would score as an ease-in. Everything else in the grammar is
 * measured — the curve's slope entering the landing against its slope leaving
 * the start — so `cubic-bezier(0.16,1,0.3,1)`, the deceleration the skill
 * recommends for entrances, passes and `cubic-bezier(0.7,0,0.84,0)`, the exit
 * curve beside it, does not. An easing outside the grammar eases linearly and
 * does not decelerate.
 */
export function easingDecelerates(easing: string): boolean {
  const text = easing.trim();
  if (/^easeOut/.test(text)) return true;
  const curve = parseEasing(text);
  if (!curve) return false;
  const entry = (curve(EASING_SLOPE_STEP) - curve(0)) / EASING_SLOPE_STEP;
  const landing = (curve(1) - curve(1 - EASING_SLOPE_STEP)) / EASING_SLOPE_STEP;
  return landing < entry;
}

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

/**
 * Timing and geometry are their own ops, and a key this tool does not read
 * used to be stripped by the schema — a call that reported success and changed
 * nothing. Name the op that does the job instead.
 */
const CLIP_PARAM_ELSEWHERE: Record<string, string> = {
  animations: "animate_clip",
  transition: "set_transition",
  parentId: "set_parent",
  mask: "set_mask",
  effects: "set_effects",
  timeRemap: "set_time_remap"
};

const CLIP_PARAM_KEYS = [
  "name",
  "startMs",
  "trackId",
  "durationMs",
  "inPointMs",
  "outPointMs",
  "opacity",
  "speedMultiplier",
  "volumeDb",
  "fadeInMs",
  "fadeOutMs",
  "blendMode",
  "borderRadius",
  "hidden",
  "muted",
  "locked",
  "fontSizePx",
  "textStyle",
  "shapeStyle",
  "captionStyle"
];

function rejectUnknownClipParams(patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if (CLIP_PARAM_KEYS.includes(key)) continue;
    const elsewhere = CLIP_PARAM_ELSEWHERE[key];
    if (elsewhere) {
      throw new Error(
        `set_clip_params does not change \`${key}\`; use ${elsewhere}.`
      );
    }
    throw new Error(
      `set_clip_params has no \`${key}\` param. It takes: ${CLIP_PARAM_KEYS.join(", ")}.`
    );
  }
}

/**
 * Lift a nested `custom: {curves|code|mask}` onto the animation itself. The
 * flat form is the contract, but the nested one is the obvious guess from
 * `preset: "custom"`, and it used to be stripped by the schema and then
 * rejected as an animation with neither curves nor code.
 */
function liftCustom<
  T extends {
    curves?: unknown;
    code?: string;
    mask?: unknown;
    custom?: { curves?: unknown; code?: string; mask?: unknown };
  }
>(input: T): T {
  if (!input.custom) return input;
  const { custom, ...rest } = input;
  return {
    ...rest,
    curves: input.curves ?? custom.curves,
    code: input.code ?? custom.code,
    mask: input.mask ?? custom.mask
  } as T;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Units a staggered animation splits into — a text clip's word count, which is
 * what a custom body reads off `inputs.staggerCount`. Zero when the clip does
 * not stagger, matching the un-staggered block case.
 */
function staggerUnitCount(
  clip: TimelineClip,
  stagger: ClipAnimation["stagger"]
): number {
  if (!stagger || clip.mediaType !== "text") return 0;
  const text = clip.textStyle?.text ?? "";
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

/**
 * Build an in-memory timeline bridge whose tools share the `ui_timeline_*`
 * contract but run headlessly against a plain sequence of tracks/clips (no
 * Zustand stores, no rendering).
 */
export function createTimelineToolBridge(
  initial: TimelineBridgeInitialState = {}
): HeadlessSurfaceBridge<TimelineBridgeFinalState> {
  const seed = initial.sequence;
  const sequenceId = initial.sequenceId ?? "seq_eval";

  let state: TimelineOpState = {
    fps: seed?.fps ?? initial.fps ?? 30,
    width: seed?.width ?? initial.width ?? 1920,
    height: seed?.height ?? initial.height ?? 1080,
    tracks: [],
    clips: [],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };

  const toolLog: string[] = [];
  const previewTimesMs: number[] = [];

  // Ids the sequence already uses. A seeded document brings its own, which the
  // `track_1`/`clip_1` counters would otherwise collide with on the first edit.
  const usedIds = new Set<string>();
  const counters: Record<TimelineOpIdKind, number> = {
    track: 0,
    clip: 0,
    anim: 0,
    marker: 0
  };
  const newId = (kind: TimelineOpIdKind): string => {
    let id = `${kind}_${++counters[kind]}`;
    while (usedIds.has(id)) id = `${kind}_${++counters[kind]}`;
    usedIds.add(id);
    return id;
  };

  const ctx: TimelineOpContext = {
    newId,
    resolveAsset: initial.resolveAsset,
    bakeAnimation: initial.bakeAnimation,
    loadComposition: initial.loadComposition,
    parseSvgPath
  };

  /**
   * Run one op through the shared implementation and keep the document it
   * returns. A refusal comes back as `error`; the tool loop reports a throw,
   * so it is rethrown here rather than returned.
   */
  async function run(op: TimelineOp): Promise<unknown> {
    const outcome = await applyTimelineOp(state, op, ctx);
    if (outcome.error !== undefined) throw new Error(outcome.error);
    state = outcome.state;
    return outcome.result;
  }

  // Seed from a real sequence when one was handed over, otherwise from the
  // shorthand. Cloned, so the bridge never writes through to the caller's state.
  if (seed) {
    for (const track of seed.tracks) {
      const copy = structuredClone(track);
      usedIds.add(copy.id);
      state.tracks.push(copy);
    }
    for (const clip of seed.clips) {
      const copy = structuredClone(clip);
      usedIds.add(copy.id);
      for (const animation of copy.animations ?? []) usedIds.add(animation.id);
      state.clips.push(copy);
    }
    for (const marker of seed.markers ?? []) {
      const copy = structuredClone(marker);
      usedIds.add(copy.id);
      state.markers.push(copy);
    }
  }

  // Seed initial tracks and clips.
  for (const t of seed ? [] : (initial.tracks ?? [])) {
    state.tracks.push(
      makeTrack({
        id: newId("track"),
        type: t.type,
        name:
          t.name ??
          `${t.type[0]!.toUpperCase()}${t.type.slice(1)} ${state.tracks.length + 1}`,
        index: state.tracks.length
      })
    );
  }
  for (const c of seed ? [] : (initial.clips ?? [])) {
    const track = state.tracks[c.trackIndex];
    if (!track) {
      throw new Error(
        `Initial clip "${c.name}" references trackIndex ${c.trackIndex}, but only ${state.tracks.length} track(s) exist.`
      );
    }
    state.clips.push(
      makeClip({
        id: newId("clip"),
        trackId: track.id,
        name: c.name,
        startMs: c.startMs,
        durationMs: c.durationMs,
        mediaType: c.mediaType ?? "video",
        sourceType: "imported",
        status: "generated"
      })
    );
  }

  const tools: HeadlessTool[] = [
    tool(
      "ui_timeline_get_state",
      "Read the specified timeline sequence: resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
      z.object({}),
      async () => {
        const { ok, ...rest } = (await run({ op: "get_state" })) as {
          ok: true;
        } & Record<string, unknown>;
        return { ok, sequenceId, ...rest };
      }
    ),

    tool(
      "ui_timeline_add_track",
      ADD_TRACK_DESCRIPTION,
      z.object({
        type: z.enum(["video", "audio", "overlay", "subtitle"]),
        name: z.string().optional()
      }),
      async ({ type, name }) =>
        run({
          op: "add_track",
          type: type as TimelineTrack["type"],
          name: name as string | undefined
        })
    ),

    tool(
      "ui_timeline_move_track",
      MOVE_TRACK_DESCRIPTION,
      z.object(moveTrackShape).strict(),
      async (args) => run({ op: "move_track", ...args })
    ),

    tool(
      "ui_timeline_add_text_clip",
      ADD_TEXT_CLIP_DESCRIPTION,
      withTextClipRemedies(
        z
          .object({
            text: z.string().trim().min(1),
            trackId: z.string().optional(),
            startMs: z.number().optional(),
            durationMs: z.number().optional(),
            opacity: clipOpacityParam,
            style: partialTextStyleParams.optional()
          })
          .merge(partialTextStyleParams)
          .strict()
      ),
      async ({ text, trackId, startMs, durationMs, opacity, style, ...loose }) =>
        run({
          op: "add_text_clip",
          text: text as string,
          trackId: trackId as string | undefined,
          startMs: startMs as number | undefined,
          durationMs: durationMs as number | undefined,
          opacity: opacity as number | undefined,
          style: style as AddTextClipOp["style"],
          loose: loose as AddTextClipOp["loose"]
        })
    ),

    tool(
      "ui_timeline_delete_track",
      DELETE_TRACK_DESCRIPTION,
      z.object(deleteTrackShape).strict(),
      async (args) => run({ op: "delete_track", ...args })
    ),

    tool(
      "ui_timeline_add_media_clip",
      "Place an existing asset — a video, image, or audio file already in the library — on the specified timeline sequence. `asset` is an asset id or `asset://<id>.<ext>` URI (list_assets returns both). Without a track the clip lands on a track matching its media kind, creating one when needed; without `startMs` it is appended after that track's existing content, so calling this once per asset lays them end to end. Duration comes from the asset when known.",
      z.object({
        asset: z.string().trim().min(1),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        name: z.string().optional()
      }),
      async (args) =>
        run({ op: "add_media_clip", ...(args as Omit<AddMediaClipOp, "op">) })
    ),

    tool(
      "ui_timeline_add_shape_clip",
      ADD_SHAPE_CLIP_DESCRIPTION,
      z
        .object({
          shape: shapeStyleParams.optional(),
          shapeStyle: shapeStyleParams.optional(),
          trackId: z.string().optional(),
          startMs: z.number().optional(),
          durationMs: z.number().optional(),
          opacity: clipOpacityParam
        })
        .merge(shapeStyleParams.partial())
        .strict(),
      async ({
        shape,
        shapeStyle,
        trackId,
        startMs,
        durationMs,
        opacity,
        ...loose
      }) =>
        run({
          op: "add_shape_clip",
          shape,
          shapeStyle,
          trackId: trackId as string | undefined,
          startMs: startMs as number | undefined,
          durationMs: durationMs as number | undefined,
          opacity: opacity as number | undefined,
          loose
        })
    ),

    tool(
      "ui_timeline_generate_clip",
      'Generate a new media clip from a text prompt and place it on the specified timeline sequence. `kind` is text-to-video, text-to-image, or text-to-audio (TTS). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used model for that media kind is reused. `voice` is required for text-to-audio. Without a track the clip lands on a sensible track for its media kind; without `startMs` it is appended after the track\'s existing content. Generation starts immediately unless `autoGenerate` is false. For text-to-video, `aspectRatio` (e.g. "16:9") and `resolution` (e.g. "720p") and `durationMs` are honoured by video models.',
      z.object({
        kind: z.enum(["text-to-video", "text-to-image", "text-to-audio"]),
        prompt: z.string(),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        voice: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        autoGenerate: z.boolean().optional()
      }),
      async (args) =>
        run({ op: "generate_clip", ...(args as Omit<GenerateClipOp, "op">) })
    ),

    tool(
      "ui_timeline_split_clip",
      "Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall inside the clip; omit it to split at the current playhead. Returns the two resulting halves.",
      z.object({
        target: targetParam,
        atMs: z.number().optional()
      }),
      async ({ target, atMs }) =>
        run({
          op: "split_clip",
          target: target as string,
          atMs: atMs as number | undefined
        })
    ),

    tool(
      "ui_timeline_trim_clip",
      "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length; `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        durationMs: z.number().optional(),
        inPointMs: z.number().optional(),
        outPointMs: z.number().optional()
      }),
      async (args) =>
        run({ op: "trim_clip", ...(args as Omit<TrimClipOp, "op">) })
    ),

    tool(
      "ui_timeline_move_clip",
      "Move a clip to a new absolute start time and/or onto a different track. `startMs` is the new start on the timeline (ms, clamped to >= 0); `trackId` reassigns the track. Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        startMs: z.number().optional(),
        trackId: z.string().optional()
      }),
      async (args) =>
        run({ op: "move_clip", ...(args as Omit<MoveClipOp, "op">) })
    ),

    tool(
      "ui_timeline_delete_clip",
      "Remove a clip from the specified timeline sequence.",
      z.object({ target: targetParam }),
      async ({ target }) => run({ op: "delete_clip", target: target as string })
    ),

    tool(
      "ui_timeline_duplicate_clip",
      "Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding so you can tweak the copy for a variation.",
      z.object({
        target: targetParam,
        gapMs: z.number().optional()
      }),
      async ({ target, gapMs }) =>
        run({
          op: "duplicate_clip",
          target: target as string,
          gapMs: gapMs as number | undefined
        })
    ),

    tool(
      "ui_timeline_set_clip_params",
      "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, a shape clip's `shapeStyle`, or a caption clip's `captionStyle`. `fontSizePx` is shorthand for `textStyle.fontSizePx`. Timing is accepted too and applied as trim_clip/move_clip would: `durationMs`, `inPointMs`, `outPointMs`, `startMs`, `trackId`. A key this tool does not know is refused by name rather than ignored. Omit a field to leave it unchanged.",
      z
        .object({
          target: targetParam,
          startMs: z.number().optional(),
          trackId: z.string().optional(),
          durationMs: z.number().optional(),
          inPointMs: z.number().optional(),
          outPointMs: z.number().optional(),
          fontSizePx: z.number().optional(),
          name: z.string().optional(),
          opacity: z.number().optional(),
          speedMultiplier: z.number().optional(),
          volumeDb: z.number().optional(),
          fadeInMs: z.number().optional(),
          fadeOutMs: z.number().optional(),
          blendMode: z.string().optional(),
          borderRadius: z.number().optional(),
          hidden: z.boolean().optional(),
          muted: z.boolean().optional(),
          locked: z.boolean().optional(),
          textStyle: textStyleParams.optional(),
          shapeStyle: shapeStyleParams.optional(),
          captionStyle: captionStyleParams.optional()
          // A key the schema does not list is kept rather than stripped, so it
          // can be refused by name in the op: silently dropping `startMs`
          // looked like a successful call that changed nothing.
        })
        .catchall(z.unknown()),
      async ({ target, ...patch }) =>
        run({
          op: "set_clip_params",
          target: target as string,
          patch: patch as SetClipParamsOp["patch"]
        })
    ),

    tool(
      "ui_timeline_add_group",
      "Create a group clip: a clip with no media of its own whose transform, opacity and window every clip naming it inherits. Move the group and its children move with it; fade the group and they fade together; a child outside the group's window is not drawn. Children keep their own tracks, so what covers what is unchanged. Pass `children` to parent clips as the group is created, or use set_parent afterwards.",
      addGroupParams,
      async (args) =>
        run({ op: "add_group", ...(args as Omit<AddGroupOp, "op">) })
    ),

    tool(
      "ui_timeline_set_parent",
      "Parent a clip to a group so it inherits the group's transform, opacity and window, or release it with `parentId: null`. The parent must be a clip created with add_group; a clip cannot parent itself or any group beneath it.",
      setParentParams,
      async ({ target, parentId }) =>
        run({
          op: "set_parent",
          target: target as string,
          parentId: parentId as SetParentOp["parentId"]
        })
    ),

    tool(
      "ui_timeline_set_transition",
      "Set the transition a clip opens with, or clear it with `transition: null`. A transition is between two clips: it plays over the head of `target` against whatever sits beneath it on the same track, so overlap the two clips by at least `durationMs` for both to be seen. Types: crossfade (dissolve), dipToColor (through a solid), wipe (feathered reveal), push (both clips travel), slide (only the incoming moves), zoom. With no transition set, overlapping clips still auto-dissolve across the overlap.",
      z.object({
        target: targetParam,
        transition: transitionParams.nullable()
      }),
      async ({ target, transition }) =>
        run({
          op: "set_transition",
          target: target as string,
          transition: transition as SetTransitionOp["transition"]
        })
    ),

    tool(
      "ui_timeline_set_mask",
      "Mask a clip to a rectangle, an ellipse or an SVG path, or clear it with `mask: null`. Coordinates are 0..1 in the clip's own space, so the mask turns and scales with the clip. `featherPx` softens the edge; `invert` keeps what the shape excludes instead.",
      z.object({
        target: targetParam,
        mask: maskParams.nullable()
      }),
      async ({ target, mask }) =>
        run({
          op: "set_mask",
          target: target as string,
          mask: mask as SetMaskOp["mask"]
        })
    ),

    tool(
      "ui_timeline_set_matte",
      "Drive a clip's transparency from another clip — a track matte — or clear it with `matte: null`. The source clip stops drawing itself: its alpha (`mode: \"alpha\"`) or its brightness (`mode: \"luma\"`) becomes the target's transparency, so a white shape over black shows the target only where the shape is. Both clips are placed by their own transforms, so where the source sits on the frame is where the target shows through.",
      z.object({
        target: targetParam,
        matte: matteParams.nullable()
      }),
      async ({ target, matte }) =>
        run({
          op: "set_matte",
          target: target as string,
          matte: matte as SetMatteOp["matte"]
        })
    ),

    tool(
      "ui_timeline_set_time_remap",
      "Retime a clip's source with a curve, or clear it with `timeRemap: null`. Each keyframe says where in the source media (`sourceMs`) the clip sits at position `t`, normalized 0..1 over the clip's own window — so the list must start at 0, end at 1 and ascend in `t`. A `sourceMs` that descends is reverse playback, a flat pair is a freeze, and a steeper segment plays faster. A remap replaces the clip's rate entirely, and split and trim refuse a remapped clip.",
      setTimeRemapParams,
      async ({ target, timeRemap }) =>
        run({
          op: "set_time_remap",
          target: target as string,
          timeRemap: timeRemap as SetTimeRemapOp["timeRemap"]
        })
    ),

    tool(
      "ui_timeline_set_effects",
      "Replace a clip's effect chain, or clear it with `effects: []`. The list runs in order on the clip's own pixels, before it is placed on the frame. Types: color (brightness/contrast/saturation/hue/temperature/tint/shadows/highlights), blur, glow, dropShadow, vignette, sharpen, chromaKey, curves (control points, 0..1 on both axes), levels (in/out black and white plus gamma), liftGammaGain (a three-way grade, one number per channel). This replaces the whole chain — send every effect the clip should keep.",
      z.object({
        target: targetParam,
        effects: z
          .array(effectParams)
          .describe("The chain, in order. An empty list clears it.")
      }),
      async ({ target, effects }) =>
        run({
          op: "set_effects",
          target: target as string,
          effects: effects as SetEffectsOp["effects"]
        })
    ),

    tool(
      "ui_timeline_set_clip_binding",
      "Edit a generated clip's generation binding — its `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, dimensions, `aspectRatio`/`resolution`, `strength`, or `numInferenceSteps`. Set `regenerate` true to immediately re-run generation with the new settings. Only applies to generated clips.",
      z.object({
        target: targetParam,
        prompt: z.string().optional(),
        negativePrompt: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        voice: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        strength: z.number().optional(),
        numInferenceSteps: z.number().optional(),
        regenerate: z.boolean().optional()
      }),
      async (args) =>
        run({
          op: "set_clip_binding",
          ...(args as Omit<SetClipBindingOp, "op">)
        })
    ),

    tool(
      "ui_timeline_animate_clip",
      'Attach motion-design animations to a clip. Roles: `in` (entrance: fade, slide, pop, spin, wipe, blur, colorFade), `out` (exit: fade, slide, pop, spin, wipe, blur, colorFade), `emphasis` (mid-clip: pulse, flash, shake, bounce, squash), `loop` (continuous: kenBurns, float, breathe, rotate, hueShift). Each animation: `role`, `preset`, optional `durationMs` (defaults per preset), `delayMs`, `easing`, and preset `params`. For motion no preset covers, use `preset: "custom"` with exactly one of `curves` (keyframes you write: [{property, keyframes:[{t, value, easing?}]}], `t` running 0..1 over the window) or `code` (a JS body baked into curves once, host-side); add `mask` when a curve drives wipeProgress. On text clips, add `stagger` for per-word motion typography: each word runs the animation for `durationMs`, offset `stagger.offsetMs` from the previous word (`from`: start|end|center picks the leading word) — e.g. a pop-in title whose words land one after another. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets for the full param list and the animatable properties.',
      z.object({
        target: targetParam,
        mode: z.enum(["add", "replace"]).optional(),
        animations: z
          .array(
            z.object({
              role: animationRole,
              preset: z
                .string()
                .describe(
                  'Preset id, e.g. fade, slide, wipe, pop, kenBurns, float — or "custom" with `curves` or `code`.'
                ),
              durationMs: z.number().positive().optional(),
              delayMs: z.number().nonnegative().optional(),
              easing: z.string().optional(),
              params: z
                .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
                .optional(),
              curves: customCurvesParam,
              code: customCodeParam,
              mask: customMaskParam,
              custom: z
                .object({
                  curves: customCurvesParam,
                  code: customCodeParam,
                  mask: customMaskParam
                })
                .optional()
                .describe(
                  'Same as `curves`/`code`/`mask` one level down: {preset: "custom", custom: {curves: [...]}} is accepted and lifted.'
                ),
              stagger: z
                .object({
                  unit: z.enum(STAGGER_UNITS),
                  offsetMs: z
                    .number()
                    .positive()
                    .describe("Delay between successive units in ms."),
                  from: z.enum(["start", "end", "center"]).optional()
                })
                .optional()
                .describe(
                  "Per-unit stagger — text clips only. The animation runs once per word, grapheme or wrapped line, each unit offset from the previous."
                )
            })
          )
          .min(1)
      }),
      async ({ target, mode, animations }) =>
        run({
          op: "animate_clip",
          target: target as string,
          mode: mode as AnimateClipOp["mode"],
          animations: animations as AnimateClipOp["animations"]
        })
    ),

    tool(
      "ui_timeline_clear_animations",
      "Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all.",
      z.object({
        target: targetParam,
        role: animationRole.optional()
      }),
      async ({ target, role }) =>
        run({
          op: "clear_animations",
          target: target as string,
          role: role as ClipAnimation["role"] | undefined
        })
    ),

    tool(
      "ui_timeline_list_animation_presets",
      "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Also returns the `custom` preset's contract and every animatable property with its fold, identity and range, for keyframed motion no preset covers. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
      z.object({}),
      async () => run({ op: "list_animation_presets" })
    ),

    tool(
      "ui_timeline_select_clip",
      "Select a clip in the specified timeline sequence (driving the inspector). Pass null/empty to clear the selection.",
      z.object({ target: targetParam.nullable().optional() }),
      async ({ target }) =>
        run({ op: "select_clip", target: target as string | null | undefined })
    ),

    tool(
      "ui_timeline_seek",
      "Move the playhead to an absolute time (ms) in the specified timeline sequence. Useful before splitting at the playhead.",
      z.object({ timeMs: z.number() }),
      async ({ timeMs }) => run({ op: "seek", timeMs: timeMs as number })
    ),

    tool(
      "ui_timeline_add_marker",
      "Drop a marker at an absolute time on the timeline, to flag a moment — a beat, a scene boundary, a note for the user. Markers do not render; they are annotations on the ruler.",
      z.object({
        timeMs: z
          .number()
          .describe("Absolute position on the timeline in ms. Must be >= 0."),
        label: z.string().optional().describe("Short label shown on the ruler."),
        color: z.string().optional().describe("CSS colour for the marker dot."),
        note: z.string().optional().describe("Longer note attached to the marker.")
      }),
      async (args) => run({ op: "add_marker", ...(args as Omit<AddMarkerOp, "op">) })
    ),

    tool(
      "ui_timeline_delete_marker",
      "Remove a marker by id or by its label (case-insensitive). Call ui_timeline_get_state to see the markers a sequence carries.",
      z.object({
        target: z.string().describe("Marker id or label (case-insensitive).")
      }),
      async ({ target }) =>
        run({ op: "delete_marker", target: target as string })
    ),

    tool(
      "ui_timeline_set_markers_from_beats",
      "Lay a marker on every beat of a grid, so the cut has something to work against. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with `count` and an optional `offset_ms` for where beat one sits. Markers already on the sequence are kept, and a beat that already carries one is skipped, so re-running the same grid changes nothing.",
      z.object({
        onsets_ms: z
          .array(z.number())
          .optional()
          .describe("Absolute beat times in ms. Exactly one of this and `bpm`."),
        bpm: z.number().optional().describe("Tempo. Needs `count`."),
        offset_ms: z
          .number()
          .optional()
          .describe("Where beat one sits, in ms. Default 0."),
        count: z.number().optional().describe("Beats to lay down, with `bpm`."),
        label: z
          .string()
          .optional()
          .describe(
            'Label stem; each marker is numbered from 1 ("Beat 1", "Beat 2", …). Default "Beat".'
          )
      }),
      async (args) =>
        run({
          op: "set_markers_from_beats",
          ...(args as Omit<SetMarkersFromBeatsOp, "op">)
        })
    ),

    tool(
      "ui_timeline_snap_to_beats",
      "Put clip boundaries on a beat grid. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with an optional `offset_ms`. `mode` picks the boundary, `action` picks how it gets there: `move` slides the whole clip and keeps its length, `trim` holds the opposite boundary and changes the length. A boundary further than `tolerance_ms` from every beat is left where it is and reported with the reason, so read the per-clip result rather than assuming everything moved.",
      z.object({
        targets: z
          .union([z.array(z.string()), z.literal("all")])
          .optional()
          .describe(
            'Clip ids or names, or "all". Default: every clip on the sequence.'
          ),
        onsets_ms: z
          .array(z.number())
          .optional()
          .describe("Absolute beat times in ms. Exactly one of this and `bpm`."),
        bpm: z
          .number()
          .optional()
          .describe(
            "Tempo. The grid is generated far enough to reach every target."
          ),
        offset_ms: z
          .number()
          .optional()
          .describe("Where beat one sits, in ms. Default 0."),
        tolerance_ms: z
          .number()
          .optional()
          .describe(
            `How far a boundary may travel to reach a beat. Default ${DEFAULT_BEAT_TOLERANCE_MS}ms.`
          ),
        mode: z
          .enum(["start", "end", "both"])
          .optional()
          .describe('Which boundary lands on a beat. Default "start".'),
        action: z
          .enum(["move", "trim"])
          .optional()
          .describe(
            '"move" slides the clip, "trim" changes its length. Default "move".'
          )
      }),
      async (args) =>
        run({ op: "snap_to_beats", ...(args as Omit<SnapToBeatsOp, "op">) })
    ),

    tool(
      "ui_timeline_insert_composition",
      "Insert a stored composition — a group of clips with named parameters (a lower third, a title card, a callout) — at a timecode. Its children keep the layering the template declares: each template track becomes an overlay track of its own, front-most on top, reused across insertions. `params` overrides the template's defaults by name; anything omitted keeps its default. Call list_compositions for the ids and their parameters.",
      z.object({
        composition_id: z
          .string()
          .describe("Composition id, from list_compositions."),
        startMs: z
          .number()
          .describe("Where the group starts on the timeline, in ms."),
        trackId: z
          .string()
          .optional()
          .describe(
            "Track for the group clip itself. Its children still get their own overlay tracks. Defaults to an overlay track."
          ),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe(
            'Parameter overrides by name, e.g. {name: "Ada Lovelace"}. A name the template does not declare, or a value of the wrong type, is refused.'
          )
      }),
      async (args) =>
        run({
          op: "insert_composition",
          ...(args as Omit<InsertCompositionOp, "op">)
        })
    )
  ];

  // Opt-in, and outside the `ui_timeline_` prefix on purpose: `edit_timeline`
  // builds this same bridge and matches its ops by that prefix, so a preview
  // tool it can never call has no business in its op catalogue. A case that
  // grades "did it look at the frame" asks for it.
  if (initial.preview) {
    tools.push(
      tool(
        "preview_timeline_frame",
        "Look at the sequence at one or more timecodes: what is on screen, layered top of the stack first, with each layer's opacity and track index. This surface has no rasterizer, so it reports the layer stack rather than pixels — enough to see a layer that is covered, missing, or drawing nothing. Call it after an edit, before you say you are done.",
        z.object({
          times_ms: z
            .array(z.number().nonnegative())
            .min(1)
            .max(8)
            .describe("Absolute timeline positions to look at, in ms.")
        }),
        async ({ times_ms }) => {
          const frames = (times_ms as number[]).map((timeMs) => ({
            time_ms: timeMs,
            layers: computeActiveLayers(state.tracks, state.clips, timeMs)
              .map((layer) => ({
                clip_id: layer.clipId,
                clip_name:
                  state.clips.find((c) => c.id === layer.clipId)?.name ??
                  layer.clipId,
                kind: layer.kind,
                track_index: layer.trackIndex,
                z_index: 1000 - layer.trackIndex,
                opacity: layer.opacity,
                text: layer.textStyle?.text
              }))
              // Top of the stack first, the order the skill's report describes.
              .sort((a, b) => b.z_index - a.z_index)
          }));
          return { ok: true, width: state.width, height: state.height, frames };
        }
      )
    );
  }

  // Recorded rather than counted: a predicate asks where the last edit sits
  // relative to a preview, and which timecodes that preview asked for —
  // neither of which a tally can answer. The push happens before the call, so
  // a tool that throws is still in the transcript.
  const recorded: HeadlessTool[] = tools.map((entry) => ({
    ...entry,
    execute: (args: Record<string, unknown>) => {
      toolLog.push(entry.name);
      if (entry.name === "preview_timeline_frame") {
        const times = args?.["times_ms"];
        if (Array.isArray(times)) {
          for (const time of times) {
            if (typeof time === "number" && Number.isFinite(time)) {
              previewTimesMs.push(time);
            }
          }
        }
      }
      return entry.execute(args);
    }
  }));

  return {
    tools: recorded,
    finalState: (): TimelineBridgeFinalState => ({
      fps: state.fps,
      width: state.width,
      height: state.height,
      durationMs: state.clips.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0
      ),
      playheadMs: state.playheadMs,
      tracks: state.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index
      })),
      clips: state.clips.map((c) => ({
        id: c.id,
        name: c.name,
        trackId: c.trackId,
        mediaType: c.mediaType,
        startMs: c.startMs,
        durationMs: c.durationMs,
        prompt: c.prompt,
        animations: (c.animations ?? []).map((a) => ({
          role: a.role,
          preset: a.preset
        }))
      })),
      documentTracks: state.tracks.map((t) => structuredClone(t)),
      documentClips: state.clips.map((c) => structuredClone(c)),
      markers: state.markers.map((m) => structuredClone(m)),
      toolLog: [...toolLog],
      previewTimesMs: [...previewTimesMs]
    })
  };
}


const TIMELINE_SYSTEM_PROMPT = `You are an assistant driving a timeline / video editor through UI tools.

Use the ui_timeline_* tools to inspect and modify the sequence:
- Call ui_timeline_get_state first to see what's already there and get track/clip ids and names.
- Add content with ui_timeline_add_text_clip, ui_timeline_add_shape_clip, or ui_timeline_generate_clip; add tracks with ui_timeline_add_track when needed.
- Address existing clips by id, name, or "selected" with ui_timeline_split_clip, ui_timeline_trim_clip, ui_timeline_move_clip, ui_timeline_delete_clip, ui_timeline_duplicate_clip, ui_timeline_set_clip_params, ui_timeline_set_clip_binding, ui_timeline_set_transition, ui_timeline_set_time_remap, ui_timeline_animate_clip, ui_timeline_clear_animations, ui_timeline_select_clip.
- Before animating a clip, call ui_timeline_list_animation_presets to discover the exact preset ids, allowed roles, and params.
- For motion no preset covers, animate with preset "custom" and pass curves — [{property, keyframes: [{t, value}]}], where t runs 0..1 over the animation window. list_animation_presets reports which properties a curve may drive.
- ui_timeline_seek moves the playhead (useful before a playhead-relative split).
- Flag moments with ui_timeline_add_marker / ui_timeline_delete_marker. To cut to music, lay the grid down with ui_timeline_set_markers_from_beats and put clip boundaries on it with ui_timeline_snap_to_beats, then read its per-clip report — a clip further than the tolerance from every beat is left alone and says so.

- Look at what you made with preview_timeline_frame before you stop.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.
${motionGraphicsSection()}`;

/**
 * The shipped `motion-graphics` skill, verbatim, plus the two lines that
 * reconcile it with this surface. The eval measures motion the skill teaches,
 * so the model gets the same document a product agent gets rather than a
 * paraphrase that drifts from it. Empty when the build ships no skills —
 * a skill file missing is not a reason to fail every timeline case.
 */
function motionGraphicsSection(): string {
  const skill = findSystemSkill("motion-graphics")?.content;
  if (!skill) return "";
  return `
---

The motion-graphics craft, as shipped. It names the capability tools: read \`get_timeline\` as ui_timeline_get_state and every \`edit_timeline\` op as the matching ui_timeline_* tool. \`preview_timeline_frame\` is here and reports the layer stack rather than pixels.

${skill}`;
}

export const TIMELINE_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<TimelineBridgeFinalState>[] =
  [
    {
      id: "titles-with-motion",
      description: "Add a text clip and give it a fade-in entrance animation",
      objective:
        "Add a text clip that says 'Hello' and give it a fade-in entrance animation.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_add_text_clip", "ui_timeline_animate_clip"],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasAnimatedTextClip",
            detail: "no text clip with an 'in' animation",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "text" &&
                  c.animations.some((a) => a.role === "in")
              )
          }
        ]
      }
    },
    {
      id: "generate-and-arrange",
      description: "Generate a video clip and move it to a specific start time",
      objective:
        "Add a video track, generate a text-to-video clip on it, then move the clip to start at 2000ms on the timeline.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_generate_clip", "ui_timeline_move_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasGeneratedVideoClipAt2000",
            detail: "no generated video clip at startMs=2000 with a prompt",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "video" && c.startMs === 2000 && !!c.prompt
              )
          }
        ]
      }
    },
    {
      id: "cut-and-trim",
      description: "Split a clip and delete the second half",
      objective:
        "The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      createBridge: () =>
        createTimelineToolBridge({
          tracks: [{ type: "video" }],
          clips: [
            {
              name: "shot",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 6000
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      expect: {
        requiredTools: ["ui_timeline_split_clip", "ui_timeline_delete_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "oneClipLeftAt3000ms",
            detail: "expected exactly 1 clip with durationMs 3000",
            test: (s) => s.clips.length === 1 && s.clips[0].durationMs === 3000
          }
        ]
      }
    },
    {
      id: "keyframed-slide",
      description:
        "Keyframe an entrance with a custom animation instead of a preset",
      objective:
        "Add a text clip that says 'Launch' and give it a keyframed entrance: over the first 800ms it rises 120 pixels into place, from offsetY 120 down to 0. Use a custom animation with explicit keyframes, not a preset.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_animate_clip"
        ],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasCustomOffsetYCurve",
            detail:
              "no text clip carrying a custom 'in' animation whose offsetY curve ends at 0",
            test: (s) =>
              s.documentClips.some((clip) => {
                if (clip.mediaType !== "text") return false;
                const animation = (clip.animations ?? []).find(
                  (a) => a.role === "in" && a.preset === "custom"
                );
                const curve = animation?.custom?.curves.find(
                  (c) => c.property === "offsetY"
                );
                if (!curve) return false;
                const keyframes = curve.keyframes;
                const first = keyframes[0];
                const last = keyframes[keyframes.length - 1];
                // A rise into place: starts below, lands on the layout
                // position, and the window is the 800ms that was asked for.
                return (
                  first.t === 0 &&
                  last.t === 1 &&
                  first.value >= 100 &&
                  last.value === 0 &&
                  animation?.durationMs === 800
                );
              })
          }
        ]
      }
    },
    {
      id: "kinetic-title-staggered",
      description:
        "Stagger a title's words so the entrance still finishes inside the clip",
      objective:
        "Put the title 'MAKE IT MOVE' on screen for 2500ms and have the words arrive one after another instead of all at once. The whole entrance has to be over while the card is still up.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_animate_clip"
        ],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 14,
        finalState: [
          {
            name: "staggerSpanFitsTheCard",
            detail:
              "no text clip whose entrance staggers over at least two units and finishes inside the clip",
            test: (s) =>
              s.documentClips.some((clip) => {
                if (clip.mediaType !== "text") return false;
                const entrance = (clip.animations ?? []).find(
                  (a) => a.role === "in" && a.stagger
                );
                const stagger = entrance?.stagger;
                if (!entrance || !stagger) return false;
                const canvas = { width: s.width, height: s.height };
                return (
                  staggerUnitsOf(clip, stagger.unit, canvas) >= 2 &&
                  staggerSpanFitsClip(clip, entrance, canvas)
                );
              })
          }
        ]
      }
    },
    {
      id: "lower-third-layered",
      description:
        "Put a scrim behind a name plate and keep both inside the shot",
      objective:
        "The shot named 'Host' runs from 0ms to 6000ms. While it is on screen, put the name 'Maya Chen' on the picture with a dark bar behind the words so they stay readable against the shot. Both have to sit inside that shot's window.",
      createBridge: () =>
        createTimelineToolBridge({
          preview: true,
          tracks: [{ type: "video", name: "Picture" }],
          clips: [
            {
              name: "Host",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 6000
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_timeline_add_text_clip",
          "ui_timeline_add_shape_clip"
        ],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 14,
        finalState: [
          {
            name: "scrimBehindTextInsideTheShot",
            detail:
              "no shape clip drawn over the picture and under the text, sharing frames with it inside 0-6000ms",
            test: (s) => {
              const indexOf = (trackId: string): number =>
                s.tracks.find((t) => t.id === trackId)?.index ?? -1;
              const inShot = (c: { startMs: number; durationMs: number }) =>
                c.startMs >= 0 && c.startMs + c.durationMs <= 6000;
              const overlaps = (
                a: { startMs: number; durationMs: number },
                b: { startMs: number; durationMs: number }
              ) =>
                a.startMs < b.startMs + b.durationMs &&
                b.startMs < a.startMs + a.durationMs;
              const texts = s.clips.filter(
                (c) => c.mediaType === "text" && inShot(c)
              );
              const shapes = s.clips.filter(
                (c) => c.mediaType === "shape" && inShot(c)
              );
              const picture = s.clips.filter((c) => c.mediaType === "video");
              // Lowest index draws on top, so the scrim sits between the two:
              // over the shot it darkens, under the words it backs. A scrim
              // that never shares a frame with the text backs nothing.
              return texts.some((text) =>
                shapes.some(
                  (shape) =>
                    indexOf(shape.trackId) > indexOf(text.trackId) &&
                    overlaps(shape, text) &&
                    picture.some(
                      (shot) => indexOf(shot.trackId) > indexOf(shape.trackId)
                    )
                )
              );
            }
          }
        ]
      }
    },
    {
      id: "entrance-decelerates",
      description: "Every entrance eases out or springs, never accelerates in",
      objective:
        "Add two title cards, 'Chapter One' and 'Chapter Two', and bring each one on so it arrives and settles rather than speeding up as it lands.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_animate_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 16,
        finalState: [
          {
            name: "everyEntranceDecelerates",
            detail:
              "an 'in' animation runs on an easing that is neither an ease-out family nor a spring",
            test: (s) => {
              const entrances = s.documentClips.flatMap((clip) =>
                (clip.animations ?? []).filter((a) => a.role === "in")
              );
              return (
                entrances.length >= 2 &&
                entrances.every((a) => easingDecelerates(effectiveEasing(a)))
              );
            }
          }
        ]
      }
    },
    {
      id: "beat-cut",
      description: "Move every picture boundary onto a named musical onset",
      objective:
        "The music hits at 0ms, 2000ms, 4000ms and 6000ms. My three shots — A, B and C — are roughly laid out and none of the cuts land on those hits. Put every cut on a hit, keeping the shots back to back with no gap.",
      createBridge: () =>
        createTimelineToolBridge({
          preview: true,
          tracks: [{ type: "video", name: "Picture" }],
          clips: [
            {
              name: "A",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 2180
            },
            {
              name: "B",
              trackIndex: 0,
              mediaType: "video",
              startMs: 2180,
              durationMs: 2080
            },
            {
              name: "C",
              trackIndex: 0,
              mediaType: "video",
              startMs: 4260,
              durationMs: 1740
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 16,
        finalState: [
          {
            name: "everyBoundaryOnAnOnset",
            detail:
              "a picture clip's start or end is further than 60ms from 0/2000/4000/6000ms",
            test: (s) => {
              const onsets = [0, 2000, 4000, 6000];
              const onBeat = (ms: number) =>
                onsets.some((onset) => Math.abs(ms - onset) <= 60);
              const picture = s.clips.filter((c) => c.mediaType === "video");
              return (
                picture.length === 3 &&
                picture.every(
                  (c) => onBeat(c.startMs) && onBeat(c.startMs + c.durationMs)
                )
              );
            }
          }
        ]
      }
    },
    {
      id: "looked-before-done",
      description: "Check the frame after the last edit, before reporting done",
      objective:
        "Add an end card that says 'END' starting at 4000ms, then look at what is actually on screen there before you tell me it is finished.",
      createBridge: () => createTimelineToolBridge({ preview: true }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_add_text_clip", "preview_timeline_frame"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "previewedAfterTheLastEdit",
            detail:
              "the run's last edit is not followed by a preview_timeline_frame call landing inside a motion",
            // Rendering the card is not graded here: the eval bridge has no
            // render tool, so a run cannot reach one.
            test: (s) =>
              s.clips.some((c) => c.mediaType === "text") &&
              previewedAfterLastEdit(s.toolLog) &&
              previewedMidMotion(s.previewTimesMs, s.documentClips, {
                width: s.width,
                height: s.height
              })
          }
        ]
      }
    }
  ];
