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
  splitClip,
  ANIMATION_PRESETS,
  ANIMATED_PROPERTIES,
  CUSTOM_ANIMATION_CONTRACT,
  CUSTOM_ANIMATION_PRESET_ID,
  normalizeCustomCurves,
  resolveCustomMask,
  makeClip,
  makeTrack,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  shapeStyleWithDefaults,
  assertAuthorableFontFamily,
  textStyleWithDefaults,
  moveTrackOrder,
  mediaTypeForContentType,
  trackTypeForMediaType,
  STAGGER_UNITS,
  parseStaggerUnit,
  DEFAULT_BEAT_TOLERANCE_MS,
  buildBeatGrid,
  beatCountToCover,
  snapClipsToGrid,
  isGroupClip,
  moveGroup,
  ungroup,
  trimGroup,
  type TrackDestination,
  type AnimationRole,
  type CustomClipAnimation,
  type PropertyCurve,
  type ClipEffect,
  type ClipMask,
  type SnapBoundaryMode,
  type SnapAction,
  type TimelineClip,
  type TimelineMarker,
  type TimelineTrack,
  type ClipAnimation,
  instantiateComposition,
  type TimelineComposition
} from "@nodetool-ai/timeline";
import {
  computeActiveLayers,
  countTextStaggerUnits,
  parseSvgPath
} from "@nodetool-ai/timeline/scene";
import {
  buildEffect,
  buildMask,
  buildTimeRemap,
  buildTransition,
  effectParams,
  maskParams,
  matteParams,
  partialTextStyleParams,
  resolveDeleteTrackArgs,
  timeRemapParams,
  resolveMoveTrackArgs,
  resolveShapeArg,
  textStyleParams,
  textStylePatchParams,
  transitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  buildTimelineToolContracts,
  liftCustomAnimation,
  rejectUnknownClipParams,
  type TimelineToolName
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";
import { findSystemSkill } from "../../system-skills.js";

/**
 * The `ui_timeline_*` contracts, shared with the browser registry
 * (`web/src/lib/tools/builtin/timeline.ts`). The vocabulary comes from
 * `@nodetool-ai/timeline`, which the protocol package sits below.
 */
const CONTRACTS = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

/** Units a failed lookup names before it stops and points at get_state. */
const MAX_LISTED_UNITS = 12;

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
 * Whether a staggered animation finishes inside its clip: the last unit
 * starts `offsetMs × (units − 1)` in and still runs the full `durationMs`.
 * An animation with no stagger, or one on a clip that splits into fewer than
 * two units, fits by construction — it is one block.
 */
export function staggerSpanFitsClip(
  clip: TimelineClip,
  animation: ClipAnimation
): boolean {
  const stagger = animation.stagger;
  if (!stagger || !(stagger.offsetMs > 0)) return true;
  const units = staggerUnitsOf(clip, stagger.unit);
  if (units < 2) return true;
  const preset = ANIMATION_PRESETS.find((p) => p.id === animation.preset);
  const durationMs = animation.durationMs ?? preset?.defaultDurationMs ?? 0;
  const span =
    (animation.delayMs ?? 0) + durationMs + stagger.offsetMs * (units - 1);
  return span <= clip.durationMs;
}

/**
 * How many units a clip's text splits into for a stagger unit. Line counting
 * wraps against the sequence size; with no text measurer every authored
 * paragraph is one line, which is what a headless surface can know.
 */
export function staggerUnitsOf(clip: TimelineClip, unit: string): number {
  const style = clip.textStyle;
  const parsed = parseStaggerUnit(unit);
  // An unknown unit compiles as a plain block animation, so it splits into
  // nothing — same answer as a clip with no text.
  if (!style || !parsed) return 0;
  return countTextStaggerUnits(
    style,
    { width: 1920, height: 1080 },
    parsed
  );
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

/** Whether an easing decelerates into its landing: an ease-out or a spring. */
export function easingDecelerates(easing: string): boolean {
  return /^easeOut/.test(easing) || /^spring\(/.test(easing.replace(/\s+/g, ""));
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
 * `set_clip_params` takes the style as a patch merged over the clip's own, so
 * every field is optional. The shared contract still declares the whole-bag
 * `textStyleParams`, which refuses `{textStyle: {fontFamily}}` on a finished
 * title. Both hosts override that one field; when protocol carries
 * `textStylePatchParams` the two overrides go together.
 */
const CONTRACT_SHAPE_OVERRIDES: Partial<
  Record<TimelineToolName, z.ZodRawShape>
> = {
  ui_timeline_set_clip_params: { textStyle: textStylePatchParams.optional() }
};

/** A tool whose name, description and argument shape both hosts share. */
function sharedTool<TResult>(
  name: TimelineToolName,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): HeadlessTool {
  const contract = CONTRACTS[name];
  const shape = { ...contract.shape, ...CONTRACT_SHAPE_OVERRIDES[name] };
  // No host fields: this bridge drives one implicit sequence, so there is no
  // `timeline_id` to disambiguate.
  return tool(
    name,
    contract.description,
    uiToolParams({ ...contract, shape }),
    impl
  );
}

/**
 * Keys a caller wraps the whole patch in.
 *
 * `set_clip_params` reads its fields off the op itself — `{op, target,
 * textStyle}` — but a REST-shaped guess sends `{op, target, params: {…}}`, and
 * that used to be refused as an unknown key with the real fields hidden one
 * level down inside it. The wrapper says nothing the op does not already know,
 * so it is unwrapped rather than argued with.
 */
const CLIP_PARAM_WRAPPERS = ["params", "patch", "props", "properties"];

/** Lift a patch a caller nested under a wrapper key onto the op itself. */
export function unwrapClipParams(
  patch: Record<string, unknown>
): Record<string, unknown> {
  const wrapper = CLIP_PARAM_WRAPPERS.find((key) => isRecordValue(patch[key]));
  if (!wrapper) return patch;
  const { [wrapper]: nested, ...rest } = patch;
  // The op's own keys win: a caller that sent both meant the one it spelled
  // out, and silently preferring the wrapper would drop it.
  return { ...(nested as Record<string, unknown>), ...rest };
}

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A text style patch, merged over the clip's own and checked for a family that
 * names no face.
 *
 * A clip that carries no text style yet still needs the three fields that make
 * one drawable, so the merged result goes through the same schema the whole
 * bag does rather than being stored half-built.
 */
function mergeTextStyle(
  clip: TimelineClip,
  patch: unknown
): TimelineClip["textStyle"] {
  const merged = { ...(clip.textStyle ?? {}), ...(patch as object) };
  const parsed = textStyleParams.safeParse(merged);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .filter((issue) => issue.code === "invalid_type")
      .map((issue) => issue.path.join("."));
    throw new Error(
      missing.length > 0
        ? `Clip "${clip.name}" has no text style yet, so this patch cannot ` +
          `stand on its own — it still needs ${missing.join(", ")}.`
        : `textStyle: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  assertAuthorableFontFamily(parsed.data.fontFamily);
  return parsed.data as TimelineClip["textStyle"];
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
  const resolveAsset = initial.resolveAsset;
  const bakeAnimation = initial.bakeAnimation;
  const loadComposition = initial.loadComposition;
  const sequenceId = initial.sequenceId ?? "seq_eval";
  const fps = seed?.fps ?? initial.fps ?? 30;
  const width = seed?.width ?? initial.width ?? 1920;
  const height = seed?.height ?? initial.height ?? 1080;

  let playheadMs = 0;
  let selectedClipIds: string[] = [];
  let trackSeq = 0;
  let clipSeq = 0;
  let animSeq = 0;
  let markerSeq = 0;
  const tracks: TimelineTrack[] = [];
  let clips: TimelineClip[] = [];
  let markers: TimelineMarker[] = [];
  const toolLog: string[] = [];

  // Ids the sequence already uses. A seeded document brings its own, which the
  // `track_1`/`clip_1` counters would otherwise collide with on the first edit.
  const usedIds = new Set<string>();
  const mint = (prefix: string, next: () => number): string => {
    let id = `${prefix}_${next()}`;
    while (usedIds.has(id)) id = `${prefix}_${next()}`;
    usedIds.add(id);
    return id;
  };
  const nextTrackId = () => mint("track", () => ++trackSeq);
  const nextClipId = () => mint("clip", () => ++clipSeq);
  const nextAnimId = () => mint("anim", () => ++animSeq);
  const nextMarkerId = () => mint("marker", () => ++markerSeq);

  function addTrackInternal(
    type: TimelineTrack["type"],
    name?: string
  ): TimelineTrack {
    const index = tracks.length;
    const track = makeTrack({
      id: nextTrackId(),
      type,
      name: name ?? `${capitalize(type)} ${index + 1}`,
      index
    });
    tracks.push(track);
    return track;
  }

  function findOrCreateTrack(type: TimelineTrack["type"]): TimelineTrack {
    const existing = tracks.find((t) => t.type === type);
    if (existing) return existing;
    return addTrackInternal(type);
  }

  /**
   * The ids and names a caller could have used, for the message a failed
   * lookup throws. Capped, because a long cut has hundreds of clips and an
   * error listing all of them is one an agent stops reading.
   */
  function validUnits(
    units: readonly { id: string; name: string }[],
    kind: string
  ): string {
    if (units.length === 0) return `The timeline has no ${kind}s yet.`;
    const shown = units
      .slice(0, MAX_LISTED_UNITS)
      .map((u) => `${u.id} ("${u.name}")`)
      .join(", ");
    const rest = units.length - MAX_LISTED_UNITS;
    return rest > 0
      ? `Valid ${kind}s: ${shown}, and ${rest} more — call get_state for the full list.`
      : `Valid ${kind}s: ${shown}.`;
  }

  function resolveTrack(idOrName: string): TimelineTrack {
    const byId = tracks.find((t) => t.id === idOrName);
    if (byId) return byId;
    const lower = idOrName.toLowerCase();
    const byName = tracks.find((t) => t.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(
      `No track found matching "${idOrName}". ${validUnits(tracks, "track")}`
    );
  }

  function trackEndMs(trackId: string): number {
    return clips
      .filter((c) => c.trackId === trackId)
      .reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  }

  function resolveClip(target: string): TimelineClip {
    if (target.toLowerCase() === "selected") {
      if (selectedClipIds.length !== 1) {
        throw new Error(
          `"selected" requires exactly one selected clip (currently ${selectedClipIds.length}).`
        );
      }
      const clip = clips.find((c) => c.id === selectedClipIds[0]);
      if (!clip) throw new Error("Selected clip no longer exists.");
      return clip;
    }
    const byId = clips.find((c) => c.id === target);
    if (byId) return byId;
    const lower = target.toLowerCase();
    const byName = clips.find((c) => c.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(
      `No clip found matching "${target}". ${validUnits(clips, "clip")}`
    );
  }

  /**
   * The body of `trim_clip`, shared with `set_clip_params`: a caller that sends
   * `durationMs` alongside a style change means the same edit either way, and
   * two copies of the group-trim rule would drift.
   */
  function applyTrim(
    clip: TimelineClip,
    patch: { durationMs?: number; inPointMs?: number; outPointMs?: number }
  ): TimelineClip {
    // A group carries what it holds (D4): shortening one pulls its children
    // inside the window that leaves, rather than leaving them hanging past an
    // edge nothing draws.
    if (isGroupClip(clip) && patch.durationMs !== undefined) {
      clips = trimGroup(clips, clip.id, "end", patch.durationMs - clip.durationMs);
      return clips.find((c) => c.id === clip.id)!;
    }
    if (patch.durationMs !== undefined) clip.durationMs = patch.durationMs;
    if (patch.inPointMs !== undefined) clip.inPointMs = patch.inPointMs;
    if (patch.outPointMs !== undefined) clip.outPointMs = patch.outPointMs;
    return clip;
  }

  /** The body of `move_clip`, shared with `set_clip_params`. */
  function applyMove(
    clip: TimelineClip,
    patch: { startMs?: number; trackId?: string }
  ): TimelineClip {
    // Moving a group moves what it holds by the same delta (D4). Children keep
    // their own tracks, so their z-order is untouched (I9) — only the group
    // itself takes a new `trackId`.
    let moved = clip;
    if (isGroupClip(clip) && patch.startMs !== undefined) {
      const nextStartMs = Math.max(0, patch.startMs);
      clips = moveGroup(clips, clip.id, nextStartMs - clip.startMs);
      moved = clips.find((c) => c.id === clip.id)!;
    } else if (patch.startMs !== undefined) {
      clip.startMs = Math.max(0, patch.startMs);
    }
    if (patch.trackId !== undefined) {
      moved.trackId = resolveTrack(patch.trackId).id;
    }
    return moved;
  }

  /** Resolve a marker by id, or by case-insensitive label. */
  function resolveMarker(target: string): TimelineMarker {
    const byId = markers.find((m) => m.id === target);
    if (byId) return byId;
    const lower = target.toLowerCase();
    const byLabel = markers.find((m) => m.label.toLowerCase() === lower);
    if (byLabel) return byLabel;
    const known = markers
      .map((m) => `${m.id} ("${m.label}") at ${m.timeMs}ms`)
      .join(", ");
    throw new Error(
      `No marker matches "${target}". Use a marker id or its label. ` +
        (known.length > 0
          ? `Markers: ${known}.`
          : "This sequence has no markers yet.")
    );
  }

  /**
   * Resolve the clips one beat op addresses: the named ones, or every clip.
   *
   * A target that matches nothing comes back as a miss rather than throwing —
   * a batch op that dies on one bad name hides what the other targets did.
   */
  function resolveSnapTargets(targets: string[] | undefined): {
    clips: TimelineClip[];
    missing: string[];
  } {
    if (!targets || targets.length === 0) {
      return { clips: [...clips], missing: [] };
    }
    const resolved: TimelineClip[] = [];
    const missing: string[] = [];
    for (const target of targets) {
      try {
        const clip = resolveClip(target);
        if (!resolved.includes(clip)) resolved.push(clip);
      } catch {
        // Recorded as a skip in the op's own report, with the reason.
        missing.push(target);
      }
    }
    return { clips: resolved, missing };
  }

  function serializeTrack(t: TimelineTrack) {
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      index: t.index,
      visible: t.visible,
      locked: t.locked,
      muted: t.muted ?? false,
      solo: t.solo ?? false,
      clipCount: clips.filter((c) => c.trackId === t.id).length
    };
  }

  /**
   * Build one `preset: "custom"` animation. `curves` are checked and stored;
   * `code` is baked into curves first, by the host that supplied a baker. Both
   * paths end at `normalizeCustomCurves`, the single gate the compiler and the
   * validator also run, so what is stored is what will render.
   */
  async function buildCustomAnimation(
    clip: TimelineClip,
    input: {
      role: ClipAnimation["role"];
      durationMs?: number;
      delayMs?: number;
      easing?: ClipAnimation["easing"];
      params?: ClipAnimation["params"];
      curves?: unknown;
      code?: string;
      mask?: unknown;
      stagger?: ClipAnimation["stagger"];
    }
  ): Promise<ClipAnimation> {
    const code = typeof input.code === "string" ? input.code.trim() : "";
    const hasCurves = input.curves !== undefined;
    const hasCode = code !== "";
    if (hasCurves && hasCode) {
      throw new Error(
        'A "custom" animation takes exactly one of `curves` and `code`; both were given. Pass the keyframes, or the body that produces them.'
      );
    }
    if (!hasCurves && !hasCode) {
      throw new Error(
        'A "custom" animation needs `curves` or `code`. Accepted shape: ' +
          '{role: "in", preset: "custom", curves: [{property: "offsetY", keyframes: [{t: 0, value: 160}, {t: 1, value: 0}]}]}' +
          ' — `t` runs 0..1 over the window. `code` is a JS body baked into curves instead. Either may also be nested under `custom`.'
      );
    }

    // Curves are normalized to 0..1 over the window, so a custom animation
    // with no duration of its own spans the clip and nothing is cropped.
    const durationMs = input.durationMs ?? clip.durationMs;

    let curves: PropertyCurve[];
    let maskInput: unknown;
    if (hasCurves) {
      const normalized = normalizeCustomCurves(input.curves);
      if (!normalized.ok) throw new Error(normalized.error);
      curves = normalized.curves;
      maskInput = input.mask;
    } else {
      if (!bakeAnimation) {
        throw new Error(
          'This surface cannot run `code`: no animation baker is wired to it. Pass `curves` instead, or bake the body through POST /api/timelines/animations/bake.'
        );
      }
      const baked = await bakeAnimation({
        code,
        role: input.role as AnimationRole,
        durationMs,
        clipDurationMs: clip.durationMs,
        canvas: { width, height },
        params: input.params,
        staggerCount: staggerUnitCount(clip, input.stagger)
      });
      if (!baked.ok || !baked.curves) {
        throw new Error(
          baked.error ?? "The animation body returned no curves."
        );
      }
      const normalized = normalizeCustomCurves(baked.curves);
      if (!normalized.ok) throw new Error(normalized.error);
      curves = normalized.curves;
      maskInput = baked.mask ?? input.mask;
    }

    const mask = resolveCustomMask(curves, maskInput);
    if (!mask.ok) throw new Error(mask.error);

    const custom: CustomClipAnimation = {
      curves,
      bakedAt: new Date().toISOString()
    };
    if (hasCode) custom.code = code;
    if (mask.mask) custom.mask = mask.mask;

    return {
      id: nextAnimId(),
      role: input.role,
      preset: CUSTOM_ANIMATION_PRESET_ID,
      durationMs,
      delayMs: input.delayMs,
      easing: input.easing,
      params: input.params,
      stagger: input.stagger,
      custom
    };
  }

  function serializeClip(c: TimelineClip) {
    const track = tracks.find((t) => t.id === c.trackId);
    return {
      id: c.id,
      name: c.name,
      trackId: c.trackId,
      trackName: track?.name ?? null,
      mediaType: c.mediaType,
      sourceType: c.sourceType,
      startMs: c.startMs,
      durationMs: c.durationMs,
      endMs: c.startMs + c.durationMs,
      inPointMs: c.inPointMs,
      outPointMs: c.outPointMs,
      status: c.status,
      prompt: c.prompt,
      provider: c.provider,
      model: c.model,
      voice: c.voice,
      animations: (c.animations ?? []).map((a) => ({
        role: a.role,
        preset: a.preset
      })),
      hidden: c.hidden ?? false,
      muted: c.muted ?? false,
      locked: c.locked,
      opacity: c.opacity,
      textStyle: c.textStyle,
      shapeStyle: c.shapeStyle,
      captionStyle: c.caption?.style,
      transitionIn: c.transitionIn,
      mask: c.mask,
      matte: c.matte,
      timeRemap: c.timeRemap,
      effects: c.effects,
      parentId: c.parentId
    };
  }

  // Seed from a real sequence when one was handed over, otherwise from the
  // shorthand. Cloned, so the bridge never writes through to the caller's state.
  if (seed) {
    for (const track of seed.tracks) {
      const copy = structuredClone(track);
      usedIds.add(copy.id);
      tracks.push(copy);
    }
    for (const clip of seed.clips) {
      const copy = structuredClone(clip);
      usedIds.add(copy.id);
      for (const animation of copy.animations ?? []) usedIds.add(animation.id);
      clips.push(copy);
    }
    for (const marker of seed.markers ?? []) {
      const copy = structuredClone(marker);
      usedIds.add(copy.id);
      markers.push(copy);
    }
  }

  // Seed initial tracks and clips.
  for (const t of seed ? [] : (initial.tracks ?? [])) {
    addTrackInternal(t.type, t.name);
  }
  for (const c of seed ? [] : (initial.clips ?? [])) {
    const track = tracks[c.trackIndex];
    if (!track) {
      throw new Error(
        `Initial clip "${c.name}" references trackIndex ${c.trackIndex}, but only ${tracks.length} track(s) exist.`
      );
    }
    clips.push(
      makeClip({
        id: nextClipId(),
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
    sharedTool(
      "ui_timeline_get_state",
      async () => {
        const durationMs = clips.reduce(
          (m, c) => Math.max(m, c.startMs + c.durationMs),
          0
        );
        return {
          ok: true,
          sequenceId,
          fps,
          width,
          height,
          durationMs,
          playheadMs,
          selectedClipIds: [...selectedClipIds],
          tracks: tracks.map(serializeTrack),
          clips: clips.map(serializeClip),
          markers: markers.map((m) => ({ ...m }))
        };
      }
    ),

    sharedTool(
      "ui_timeline_add_track",
      async ({ type, name }) => {
        const track = addTrackInternal(
          type as TimelineTrack["type"],
          name as string | undefined
        );
        return { ok: true, track: serializeTrack(track) };
      }
    ),

    sharedTool(
      "ui_timeline_move_track",
      async (args) => {
        const { target, toIndex, before, after } = resolveMoveTrackArgs(args);
        const track = resolveTrack(target);
        const destination: TrackDestination = {};
        if (toIndex !== undefined) destination.toIndex = toIndex;
        if (before !== undefined) {
          destination.beforeId = resolveTrack(before).id;
        }
        if (after !== undefined) {
          destination.afterId = resolveTrack(after).id;
        }
        const orderedIds = moveTrackOrder(tracks, track.id, destination);
        const byId = new Map(tracks.map((t) => [t.id, t]));
        // The array order is what `get_state` prints, so keep it and the
        // indices saying the same thing.
        tracks.length = 0;
        orderedIds.forEach((id, i) => {
          const moved = byId.get(id)!;
          moved.index = i;
          tracks.push(moved);
        });
        return {
          ok: true,
          track: serializeTrack(track),
          tracks: tracks.map(serializeTrack)
        };
      }
    ),

    sharedTool(
      "ui_timeline_add_text_clip",
      async ({
        text,
        trackId,
        startMs,
        durationMs,
        opacity,
        style,
        ...loose
      }) => {
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack("overlay");
        // `style` wins over a top-level twin: a caller that sent both meant the
        // bag it named.
        const s = {
          ...(loose as z.infer<typeof partialTextStyleParams>),
          ...((style as z.infer<typeof partialTextStyleParams> | undefined) ??
            {})
        };
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: text as string,
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ?? DEFAULT_TEXT_CLIP_DURATION_MS,
          mediaType: "text",
          sourceType: "imported",
          status: "generated",
          textStyle: textStyleWithDefaults(text as string, s)
        });
        if (opacity !== undefined) clip.opacity = opacity as number;
        clips.push(clip);
        selectedClipIds = [clip.id];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_delete_track",
      async (args) => {
        const { target, deleteClips } = resolveDeleteTrackArgs(args);
        const track = resolveTrack(target);
        const onIt = clips.filter((c) => c.trackId === track.id);
        if (onIt.length > 0 && !deleteClips) {
          throw new Error(
            `Track "${track.name}" still holds ${onIt.length} clip(s): ` +
              `${onIt.map((c) => c.id).join(", ")}. Move them first, or pass ` +
              "deleteClips: true to delete them with the track."
          );
        }
        const removedClipIds = onIt.map((c) => c.id);
        const kept = clips.filter((c) => c.trackId !== track.id);
        clips.length = 0;
        clips.push(...kept);
        // A parent that went with the track would leave its children pointing
        // at a clip that no longer exists, which the validator reads as a
        // broken document rather than a deletion.
        for (const clip of clips) {
          if (clip.parentId && removedClipIds.includes(clip.parentId)) {
            delete clip.parentId;
          }
        }
        selectedClipIds = selectedClipIds.filter(
          (id) => !removedClipIds.includes(id)
        );
        const remaining = tracks.filter((t) => t.id !== track.id);
        tracks.length = 0;
        // Index is z-order, so the stack has to close over the gap.
        remaining.forEach((t, i) => {
          t.index = i;
          tracks.push(t);
        });
        return {
          ok: true,
          deleted: { id: track.id, name: track.name, type: track.type },
          deletedClipIds: removedClipIds,
          tracks: tracks.map(serializeTrack)
        };
      }
    ),

    sharedTool(
      "ui_timeline_add_media_clip",
      async ({ asset, trackId, startMs, durationMs, name }) => {
        if (!resolveAsset) {
          throw new Error(
            "This timeline surface cannot look up assets, so an existing asset cannot be placed here."
          );
        }
        const ref = asset as string;
        const found = await resolveAsset(ref);
        if (!found) {
          throw new Error(
            `No asset found for "${ref}". Pass an asset id or an asset:// URI from list_assets.`
          );
        }
        const mediaType = mediaTypeForContentType(found.contentType);
        if (!mediaType) {
          throw new Error(
            `Asset "${found.name}" is ${found.contentType}, which is not video, image, or audio and cannot go on a timeline.`
          );
        }
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack(trackTypeForMediaType(mediaType));
        const init: Parameters<typeof makeClip>[0] = {
          id: nextClipId(),
          trackId: track.id,
          name: (name as string | undefined) ?? found.name,
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ??
            found.durationMs ??
            DEFAULT_MEDIA_CLIP_DURATION_MS,
          mediaType,
          sourceType: "imported",
          status: "generated",
          currentAssetId: found.id
        };
        if (found.thumbnailAssetId) {
          init.thumbnailAssetId = found.thumbnailAssetId;
        }
        const clip = makeClip(init);
        clips.push(clip);
        selectedClipIds = [clip.id];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_add_shape_clip",
      async ({
        shape,
        shapeStyle,
        trackId,
        startMs,
        durationMs,
        opacity,
        ...loose
      }) => {
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack("overlay");
        const shapeArg = resolveShapeArg(shape, shapeStyle, loose);
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: capitalize(shapeArg.kind),
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ?? DEFAULT_TEXT_CLIP_DURATION_MS,
          mediaType: "shape",
          sourceType: "imported",
          status: "generated",
          shapeStyle: shapeStyleWithDefaults(shapeArg)
        });
        if (opacity !== undefined) clip.opacity = opacity as number;
        clips.push(clip);
        selectedClipIds = [clip.id];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_generate_clip",
      async ({
        kind,
        prompt,
        trackId,
        startMs,
        durationMs,
        provider,
        model,
        voice,
        width: clipWidth,
        height: clipHeight,
        aspectRatio,
        resolution,
        autoGenerate
      }) => {
        const mediaType: TimelineClip["mediaType"] =
          kind === "text-to-video"
            ? "video"
            : kind === "text-to-image"
              ? "image"
              : "audio";

        const track = trackId
          ? resolveTrack(trackId as string)
          : kind === "text-to-audio"
            ? findOrCreateTrack("audio")
            : kind === "text-to-video"
              ? findOrCreateTrack("video")
              : (tracks.find((t) => t.type === "video" || t.type === "overlay") ??
                findOrCreateTrack("video"));

        const generationStarted = autoGenerate !== false;
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: prompt as string,
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ??
            (kind === "text-to-audio" ? 3000 : 5000),
          mediaType,
          sourceType: "generated",
          bindingKind: kind as TimelineClip["bindingKind"],
          status: generationStarted ? "generating" : "draft",
          prompt: prompt as string,
          provider: provider as string | undefined,
          model: model as string | undefined,
          voice: voice as string | undefined,
          width: clipWidth as number | undefined,
          height: clipHeight as number | undefined,
          aspectRatio: aspectRatio as string | undefined,
          resolution: resolution as string | undefined
        });
        clips.push(clip);
        selectedClipIds = [clip.id];
        const result: {
          ok: true;
          clip: ReturnType<typeof serializeClip>;
          generationStarted: boolean;
          note?: string;
        } = { ok: true, clip: serializeClip(clip), generationStarted };
        if (!generationStarted) {
          result.note = "Generation not started (autoGenerate=false).";
        }
        return result;
      }
    ),

    sharedTool(
      "ui_timeline_split_clip",
      async ({ target, atMs }) => {
        const clip = resolveClip(target as string);
        const at = (atMs as number | undefined) ?? playheadMs;
        const [left, right] = splitClip(clip, at);
        left.id = nextClipId();
        right.id = nextClipId();
        const idx = clips.findIndex((c) => c.id === clip.id);
        clips.splice(idx, 1, left, right);
        selectedClipIds = selectedClipIds.filter((id) => id !== clip.id);
        return { ok: true, clips: [serializeClip(left), serializeClip(right)] };
      }
    ),

    sharedTool(
      "ui_timeline_trim_clip",
      async ({ target, durationMs, inPointMs, outPointMs }) => {
        const trimmed = applyTrim(resolveClip(target as string), {
          durationMs: durationMs as number | undefined,
          inPointMs: inPointMs as number | undefined,
          outPointMs: outPointMs as number | undefined
        });
        return { ok: true, clip: serializeClip(trimmed) };
      }
    ),

    sharedTool(
      "ui_timeline_move_clip",
      async ({ target, startMs, trackId }) => {
        const moved = applyMove(resolveClip(target as string), {
          startMs: startMs as number | undefined,
          trackId: trackId as string | undefined
        });
        return { ok: true, clip: serializeClip(moved) };
      }
    ),

    sharedTool(
      "ui_timeline_delete_clip",
      async ({ target }) => {
        const clip = resolveClip(target as string);
        // Deleting a group deletes the parent, not the picture: its children
        // stay where they are and stop inheriting (D4). Leaving them with a
        // `parentId` nothing answers is what the validator calls a dangling
        // parent.
        const remaining = isGroupClip(clip) ? ungroup(clips, clip.id) : clips;
        clips = remaining.filter((c) => c.id !== clip.id);
        selectedClipIds = selectedClipIds.filter((id) => id !== clip.id);
        return { ok: true, deleted: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_duplicate_clip",
      async ({ target, gapMs }) => {
        const src = resolveClip(target as string);
        const copy: TimelineClip = {
          ...src,
          id: nextClipId(),
          startMs: src.startMs + src.durationMs + ((gapMs as number | undefined) ?? 0),
          versions: [],
          animations: src.animations?.map((a) => ({ ...a }))
        };
        clips.push(copy);
        selectedClipIds = [copy.id];
        return { ok: true, clip: serializeClip(copy) };
      }
    ),

    sharedTool(
      "ui_timeline_set_clip_params",
      async ({ target, ...wrapped }) => {
        const patch = unwrapClipParams(wrapped);
        let clip = resolveClip(target as string);
        rejectUnknownClipParams(patch);
        // Timing belongs to move_clip and trim_clip, but a caller sending it
        // here means one edit either way — so apply it through the same code
        // rather than dropping it or making them call twice.
        clip = applyTrim(clip, {
          durationMs: patch.durationMs as number | undefined,
          inPointMs: patch.inPointMs as number | undefined,
          outPointMs: patch.outPointMs as number | undefined
        });
        clip = applyMove(clip, {
          startMs: patch.startMs as number | undefined,
          trackId: patch.trackId as string | undefined
        });
        // The style is a patch over what the clip already carries: changing one
        // field used to mean re-sending the whole bag, and re-sending it is how
        // the four fields the caller did not mean to touch get overwritten.
        if (patch.textStyle !== undefined) {
          patch.textStyle = mergeTextStyle(clip, patch.textStyle);
        }
        if (patch.fontSizePx !== undefined) {
          // Shorthand for the one text field callers reach for by name.
          const size = patch.fontSizePx as number;
          const style = (patch.textStyle ?? clip.textStyle) as
            | TimelineClip["textStyle"]
            | undefined;
          if (!style) {
            throw new Error(
              `Clip "${clip.name}" carries no text to size; fontSizePx applies to a text clip's textStyle.`
            );
          }
          patch.textStyle = { ...style, fontSizePx: size };
        }
        if (patch.name !== undefined) clip.name = patch.name as string;
        if (patch.opacity !== undefined) clip.opacity = patch.opacity as number;
        if (patch.speedMultiplier !== undefined)
          clip.speedMultiplier = patch.speedMultiplier as number;
        if (patch.volumeDb !== undefined) clip.volumeDb = patch.volumeDb as number;
        if (patch.fadeInMs !== undefined) clip.fadeInMs = patch.fadeInMs as number;
        if (patch.fadeOutMs !== undefined) clip.fadeOutMs = patch.fadeOutMs as number;
        if (patch.blendMode !== undefined)
          clip.blendMode = patch.blendMode as TimelineClip["blendMode"];
        if (patch.borderRadius !== undefined)
          clip.borderRadius = patch.borderRadius as number;
        if (patch.hidden !== undefined) clip.hidden = patch.hidden as boolean;
        if (patch.muted !== undefined) clip.muted = patch.muted as boolean;
        if (patch.locked !== undefined) clip.locked = patch.locked as boolean;
        if (patch.textStyle !== undefined)
          clip.textStyle = patch.textStyle as TimelineClip["textStyle"];
        if (patch.shapeStyle !== undefined)
          clip.shapeStyle = patch.shapeStyle as TimelineClip["shapeStyle"];
        if (patch.captionStyle !== undefined) {
          // The style rides on the clip's caption, so a clip with no words to
          // draw has nowhere to put it. Say so rather than storing a look
          // nothing renders.
          if (!clip.caption) {
            throw new Error(`Clip "${clip.name}" carries no caption to style.`);
          }
          clip.caption = {
            ...clip.caption,
            style: patch.captionStyle as NonNullable<
              TimelineClip["caption"]
            >["style"]
          };
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_add_group",
      async ({ name, startMs, durationMs, trackId, children }) => {
        // Resolve every child before anything is written: a half-applied group
        // leaves the caller with an empty group and no idea which of its clips
        // moved.
        const targets = ((children as string[] | undefined) ?? []).map((ref) =>
          resolveClip(ref)
        );
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack("overlay");
        const group = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: name as string,
          startMs: startMs as number,
          durationMs: durationMs as number,
          mediaType: "group",
          sourceType: "imported",
          status: "generated"
        });
        clips.push(group);
        for (const child of targets) {
          child.parentId = group.id;
        }
        selectedClipIds = [group.id];
        return {
          ok: true,
          clip: serializeClip(group),
          children: targets.map((c) => c.id)
        };
      }
    ),

    sharedTool(
      "ui_timeline_set_parent",
      async ({ target, parentId }) => {
        const clip = resolveClip(target as string);
        if (parentId === null) {
          delete clip.parentId;
          return { ok: true, clip: serializeClip(clip) };
        }
        const parent = resolveClip(parentId as string);
        if (parent.mediaType !== "group") {
          throw new Error(
            `"${parent.name}" is a ${parent.mediaType} clip, not a group — parent to a clip created with add_group. ${validUnits(
              clips.filter((c) => c.mediaType === "group"),
              "group"
            )}`
          );
        }
        // A cycle renders unparented and warns, so refusing it here is the
        // only place it can still be fixed.
        let cursor: TimelineClip | undefined = parent;
        while (cursor) {
          if (cursor.id === clip.id) {
            throw new Error(
              `"${parent.name}" is inside "${clip.name}" — parenting them would make a cycle.`
            );
          }
          const next: string | undefined = cursor.parentId;
          cursor = next ? clips.find((c) => c.id === next) : undefined;
        }
        clip.parentId = parent.id;
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_transition",
      async ({ target, transition }) => {
        const clip = resolveClip(target as string);
        if (transition === null) {
          delete clip.transitionIn;
        } else {
          clip.transitionIn = buildTransition(
            transition as z.infer<typeof transitionParams>
          );
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_mask",
      async ({ target, mask }) => {
        const clip = resolveClip(target as string);
        if (mask === null) {
          delete clip.mask;
        } else {
          clip.mask = buildMask(mask as z.infer<typeof maskParams>, parseSvgPath);
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_matte",
      async ({ target, matte }) => {
        const clip = resolveClip(target as string);
        if (matte === null) {
          delete clip.matte;
          return { ok: true, clip: serializeClip(clip) };
        }
        const input = matte as z.infer<typeof matteParams>;
        const source = resolveClip(input.source);
        if (source.id === clip.id) {
          throw new Error(
            `"${clip.name}" cannot be its own matte source — name another clip.`
          );
        }
        const matteOut: NonNullable<TimelineClip["matte"]> = {
          sourceClipId: source.id,
          mode: input.mode
        };
        if (input.invert !== undefined) matteOut.invert = input.invert;
        clip.matte = matteOut;
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_time_remap",
      async ({ target, timeRemap }) => {
        const clip = resolveClip(target as string);
        if (timeRemap === null) {
          delete clip.timeRemap;
        } else {
          clip.timeRemap = buildTimeRemap(
            timeRemap as z.infer<typeof timeRemapParams>
          );
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_effects",
      async ({ target, effects }) => {
        const clip = resolveClip(target as string);
        const list = (effects as z.infer<typeof effectParams>[]).map(
          buildEffect
        );
        if (list.length === 0) {
          delete clip.effects;
        } else {
          clip.effects = list;
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_set_clip_binding",
      async ({ target, ...patch }) => {
        const clip = resolveClip(target as string);
        if (clip.sourceType !== "generated") {
          throw new Error(
            `"${clip.name}" is not a generated clip — ui_timeline_set_clip_binding only applies to clips created with ui_timeline_generate_clip.`
          );
        }
        if (patch.prompt !== undefined) clip.prompt = patch.prompt as string;
        if (patch.negativePrompt !== undefined)
          clip.negativePrompt = patch.negativePrompt as string;
        if (patch.provider !== undefined) clip.provider = patch.provider as string;
        if (patch.model !== undefined) clip.model = patch.model as string;
        if (patch.voice !== undefined) clip.voice = patch.voice as string;
        if (patch.width !== undefined) clip.width = patch.width as number;
        if (patch.height !== undefined) clip.height = patch.height as number;
        if (patch.aspectRatio !== undefined)
          clip.aspectRatio = patch.aspectRatio as string;
        if (patch.resolution !== undefined)
          clip.resolution = patch.resolution as string;
        if (patch.strength !== undefined) clip.strength = patch.strength as number;
        if (patch.numInferenceSteps !== undefined)
          clip.numInferenceSteps = patch.numInferenceSteps as number;
        if (patch.regenerate) clip.status = "queued";
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_animate_clip",
      async ({ target, mode, animations }) => {
        const clip = resolveClip(target as string);
        const inputs = animations as Array<{
          role: ClipAnimation["role"];
          preset: string;
          durationMs?: number;
          delayMs?: number;
          easing?: ClipAnimation["easing"];
          params?: ClipAnimation["params"];
          curves?: unknown;
          code?: string;
          mask?: unknown;
          custom?: { curves?: unknown; code?: string; mask?: unknown };
          stagger?: ClipAnimation["stagger"];
        }>;
        const built: ClipAnimation[] = [];
        for (const input of inputs) {
          if (input.preset === CUSTOM_ANIMATION_PRESET_ID) {
            // `{preset: "custom", custom: {curves}}` reads as naturally as the
            // flat form, so lift it rather than refusing it.
            built.push(await buildCustomAnimation(clip, liftCustomAnimation(input)));
            continue;
          }
          const preset = ANIMATION_PRESETS.find((p) => p.id === input.preset);
          if (!preset) {
            const ids = ANIMATION_PRESETS.map((p) => p.id).join(", ");
            throw new Error(
              `Unknown animation preset "${input.preset}". Valid presets: ${ids}, ${CUSTOM_ANIMATION_PRESET_ID}.`
            );
          }
          if (!preset.roles.includes(input.role)) {
            throw new Error(
              `Preset "${input.preset}" does not support role "${input.role}". Valid roles for "${input.preset}": ${preset.roles.join(", ")}.`
            );
          }
          built.push({
            id: nextAnimId(),
            role: input.role,
            preset: input.preset,
            durationMs: input.durationMs ?? preset.defaultDurationMs,
            delayMs: input.delayMs,
            easing: input.easing,
            params: input.params,
            stagger: input.stagger
          });
        }
        clip.animations =
          (mode as string | undefined) === "add"
            ? [...(clip.animations ?? []), ...built]
            : built;
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_clear_animations",
      async ({ target, role }) => {
        const clip = resolveClip(target as string);
        clip.animations = role
          ? (clip.animations ?? []).filter((a) => a.role !== role)
          : [];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_list_animation_presets",
      async () => {
        const presets = ANIMATION_PRESETS.map((p) => ({
          id: p.id,
          roles: p.roles,
          defaultDurationMs: p.defaultDurationMs,
          defaultEasing: p.defaultEasing,
          params: p.params,
          describe: p.describe
        }));
        return {
          ok: true,
          presets,
          custom: CUSTOM_ANIMATION_CONTRACT,
          properties: CUSTOM_ANIMATION_CONTRACT.properties
        };
      }
    ),

    sharedTool(
      "ui_timeline_select_clip",
      async ({ target }) => {
        const t = target as string | null | undefined;
        if (!t) {
          selectedClipIds = [];
          return { ok: true, selected: null };
        }
        const clip = resolveClip(t);
        selectedClipIds = [clip.id];
        return { ok: true, selected: serializeClip(clip) };
      }
    ),

    sharedTool(
      "ui_timeline_seek",
      async ({ timeMs }) => {
        playheadMs = Math.max(0, timeMs as number);
        return { ok: true, playheadMs };
      }
    ),

    sharedTool(
      "ui_timeline_add_marker",
      async ({ timeMs, label, color, note }) => {
        const at = timeMs as number;
        if (at < 0) {
          throw new Error(`A marker cannot sit before zero; got ${at}ms.`);
        }
        const marker: TimelineMarker = {
          id: nextMarkerId(),
          timeMs: Math.round(at),
          label: (label as string | undefined) ?? ""
        };
        if (color !== undefined) marker.color = color as string;
        if (note !== undefined) marker.note = note as string;
        markers.push(marker);
        return { ok: true, marker: { ...marker } };
      }
    ),

    sharedTool(
      "ui_timeline_delete_marker",
      async ({ target }) => {
        const marker = resolveMarker(target as string);
        markers = markers.filter((m) => m.id !== marker.id);
        return { ok: true, deleted: { ...marker } };
      }
    ),

    sharedTool(
      "ui_timeline_set_markers_from_beats",
      async ({ onsets_ms, bpm, offset_ms, count, label }) => {
        const grid = buildBeatGrid({
          onsetsMs: onsets_ms as number[] | undefined,
          bpm: bpm as number | undefined,
          offsetMs: offset_ms as number | undefined,
          count: count as number | undefined
        });
        const stem = ((label as string | undefined) ?? "Beat").trim() || "Beat";
        const taken = new Set(markers.map((m) => m.timeMs));
        const added: TimelineMarker[] = [];
        const skipped: number[] = [];
        for (const [index, timeMs] of grid.entries()) {
          if (taken.has(timeMs)) {
            skipped.push(timeMs);
            continue;
          }
          const marker: TimelineMarker = {
            id: nextMarkerId(),
            timeMs,
            label: `${stem} ${index + 1}`
          };
          markers.push(marker);
          taken.add(timeMs);
          added.push(marker);
        }
        return {
          ok: true,
          grid: { count: grid.length, firstMs: grid[0], lastMs: grid[grid.length - 1] },
          added: added.map((m) => ({ ...m })),
          skipped_times_ms: skipped,
          markers: markers.length
        };
      }
    ),

    sharedTool(
      "ui_timeline_snap_to_beats",
      async ({
        targets,
        onsets_ms,
        bpm,
        offset_ms,
        tolerance_ms,
        mode,
        action
      }) => {
        const named =
          targets === undefined || targets === "all"
            ? undefined
            : (targets as string[]);
        const { clips: targeted, missing } = resolveSnapTargets(named);

        const offsetMs = (offset_ms as number | undefined) ?? 0;
        // A tempo grid has to reach the last boundary being snapped, so its
        // length comes from the targets rather than from the caller.
        const reachMs = targeted.reduce(
          (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
          0
        );
        const grid = buildBeatGrid({
          onsetsMs: onsets_ms as number[] | undefined,
          bpm: bpm as number | undefined,
          offsetMs: offset_ms as number | undefined,
          count:
            bpm === undefined
              ? undefined
              : beatCountToCover(bpm as number, offsetMs, reachMs)
        });

        const options: {
          toleranceMs?: number;
          mode?: SnapBoundaryMode;
          action?: SnapAction;
        } = {};
        if (tolerance_ms !== undefined) {
          options.toleranceMs = tolerance_ms as number;
        }
        if (mode !== undefined) options.mode = mode as SnapBoundaryMode;
        if (action !== undefined) options.action = action as SnapAction;

        const result = snapClipsToGrid(
          targeted.map((clip) => ({
            id: clip.id,
            startMs: clip.startMs,
            durationMs: clip.durationMs
          })),
          grid,
          options
        );

        const byId = new Map(targeted.map((clip) => [clip.id, clip]));
        const reported = result.clips.map((entry) => {
          const clip = byId.get(entry.clipId);
          if (entry.snapped && clip) {
            clip.startMs = entry.after.startMs;
            clip.durationMs = entry.after.durationMs;
          }
          return { ...entry, clipName: clip?.name ?? null };
        });

        // A name nothing matched is a skip like any other: the caller has to
        // see it in the same list, not infer it from a shorter one.
        for (const target of missing) {
          reported.push({
            clipId: target,
            clipName: null,
            snapped: false,
            before: { startMs: 0, endMs: 0, durationMs: 0 },
            after: { startMs: 0, endMs: 0, durationMs: 0 },
            delta: { startMs: 0, endMs: 0 },
            reason: `no clip matches "${target}"`
          });
        }

        return {
          ok: true,
          grid: {
            count: grid.length,
            firstMs: grid[0],
            lastMs: grid[grid.length - 1]
          },
          toleranceMs: result.toleranceMs,
          mode: result.mode,
          action: result.action,
          snapped: result.snapped,
          skipped: result.skipped + missing.length,
          clips: reported
        };
      }
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
            "Parameter overrides by name, e.g. {name: \"Ada Lovelace\"}. A name the template does not declare, or a value of the wrong type, is refused."
          )
      }),
      async ({ composition_id, startMs, trackId, params }) => {
        if (!loadComposition) {
          throw new Error(
            "This surface has no composition library, so insert_composition cannot resolve a template."
          );
        }
        const id = composition_id as string;
        const composition = await loadComposition.get(id);
        if (!composition) {
          const available = await loadComposition.listIds();
          throw new Error(
            `No composition with id "${id}". ` +
              (available.length > 0
                ? `Available: ${available.join(", ")}.`
                : "This install has none — save one with save_composition.")
          );
        }

        const minted = instantiateComposition(composition, {
          startMs: startMs as number,
          params: params as Record<string, string | number | boolean> | undefined,
          newId: nextClipId
        });

        // Template track ids are names, not document ids. Two clips overlapping
        // on one track auto-dissolve into each other, so each template track
        // becomes a track of its own — created front-most first, because the
        // lowest track index draws on top (I9).
        const templateTracks: string[] = [];
        for (const child of composition.children) {
          if (!templateTracks.includes(child.trackId)) {
            templateTracks.push(child.trackId);
          }
        }
        const mapped = new Map<string, string>();
        for (const name of [...templateTracks].reverse()) {
          const existing = tracks.find(
            (t) => t.type === "overlay" && t.name === name
          );
          mapped.set(name, (existing ?? addTrackInternal("overlay", name)).id);
        }

        // The group draws nothing, but it still occupies its track's timeline,
        // and a group sharing a track with one of its children reads as an
        // overlap. It gets a track named after the composition instead.
        const groupTrack = trackId
          ? resolveTrack(trackId as string)
          : (tracks.find(
              (t) => t.type === "overlay" && t.name === composition.name
            ) ?? addTrackInternal("overlay", composition.name));
        const [group, ...children] = minted;
        group.trackId = groupTrack.id;
        for (const [index, child] of children.entries()) {
          child.trackId =
            mapped.get(composition.children[index].trackId) ?? groupTrack.id;
        }
        clips.push(group, ...children);
        selectedClipIds = [group.id];

        return {
          ok: true,
          compositionId: composition.id,
          clip: serializeClip(group),
          children: children.map((child) => serializeClip(child)),
          params: group.compositionParams ?? {}
        };
      }
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
            layers: computeActiveLayers(tracks, clips, timeMs)
              .map((layer) => ({
                clip_id: layer.clipId,
                clip_name:
                  clips.find((c) => c.id === layer.clipId)?.name ?? layer.clipId,
                kind: layer.kind,
                track_index: layer.trackIndex,
                z_index: 1000 - layer.trackIndex,
                opacity: layer.opacity,
                text: layer.textStyle?.text
              }))
              // Top of the stack first, the order the skill's report describes.
              .sort((a, b) => b.z_index - a.z_index)
          }));
          return { ok: true, width, height, frames };
        }
      )
    );
  }

  // Recorded rather than counted: a predicate asks where the last edit sits
  // relative to a preview, which a tally cannot answer. The push happens
  // before the call, so a tool that throws is still in the transcript.
  const recorded: HeadlessTool[] = tools.map((entry) => ({
    ...entry,
    execute: (args: Record<string, unknown>) => {
      toolLog.push(entry.name);
      return entry.execute(args);
    }
  }));

  return {
    tools: recorded,
    finalState: (): TimelineBridgeFinalState => ({
      fps,
      width,
      height,
      durationMs: clips.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0
      ),
      playheadMs,
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index
      })),
      clips: clips.map((c) => ({
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
      documentTracks: tracks.map((t) => structuredClone(t)),
      documentClips: clips.map((c) => structuredClone(c)),
      markers: markers.map((m) => structuredClone(m)),
      toolLog: [...toolLog]
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
                return (
                  staggerUnitsOf(clip, stagger.unit) >= 2 &&
                  staggerSpanFitsClip(clip, entrance)
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
              "no shape clip on a higher-index track than the text, both inside 0-6000ms",
            test: (s) => {
              const indexOf = (trackId: string): number =>
                s.tracks.find((t) => t.id === trackId)?.index ?? -1;
              const inShot = (c: { startMs: number; durationMs: number }) =>
                c.startMs >= 0 && c.startMs + c.durationMs <= 6000;
              const texts = s.clips.filter(
                (c) => c.mediaType === "text" && inShot(c)
              );
              const shapes = s.clips.filter(
                (c) => c.mediaType === "shape" && inShot(c)
              );
              // Lowest index draws on top, so the scrim's track index must be
              // the larger one for the words to sit over it.
              return texts.some((text) =>
                shapes.some(
                  (shape) => indexOf(shape.trackId) > indexOf(text.trackId)
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
              "the run's last edit is not followed by a preview_timeline_frame call",
            test: (s) =>
              s.clips.some((c) => c.mediaType === "text") &&
              previewedAfterLastEdit(s.toolLog)
          }
        ]
      }
    }
  ];
