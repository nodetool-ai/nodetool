/**
 * `applyTimelineOp` — one implementation of every timeline edit op (I11).
 *
 * Pure: it clones the state it is handed, applies one op to the clone, and
 * returns the new document plus the op's result. A failure comes back as
 * `error` with the state that went in, so a host can report it without a
 * try/catch of its own and without a half-applied document.
 *
 * Everything a pure function cannot know — minting an id, reading an asset,
 * baking a JS animation body, loading a composition, parsing SVG path data —
 * arrives on {@link TimelineOpContext}. This module imports nothing from
 * `src/render` or `@nodetool-ai/gpu`, so mobile compiles it from source (AS2).
 */

import {
  buildEffect,
  buildMask,
  buildTimeRemap,
  buildTransition,
  resolveDeleteTrackArgs,
  resolveMoveTrackArgs,
  resolveShapeArg
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  CUSTOM_ANIMATION_PRESET_ID,
  normalizeCustomCurves,
  resolveCustomMask
} from "../animation/index.js";
import {
  beatCountToCover,
  buildBeatGrid,
  snapClipsToGrid,
  type SnapAction,
  type SnapBoundaryMode
} from "../beats.js";
import { instantiateComposition } from "../composition.js";
import {
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  makeClip,
  makeTrack,
  mediaTypeForContentType,
  trackTypeForMediaType
} from "../defaults.js";
import {
  shapeStyleWithDefaults,
  textStyleWithDefaults
} from "../authoredStyles.js";
import { isGroupClip, moveGroup, trimGroup, ungroup } from "../group.js";
import { splitClip } from "../splitClip.js";
import { moveTrackOrder, type TrackDestination } from "../trackOrder.js";
import { trimClip } from "../trimClip.js";
import type {
  TimelineClip,
  TimelineMarker,
  TimelineTrack
} from "../types.js";
import type { PropertyCurve } from "../animation/compile.js";
import type {
  AnimationRole,
  ClipAnimation,
  CustomClipAnimation
} from "../animation/types.js";
import { serializeClip, serializeTrack } from "./serialize.js";
import type { TimelineOp } from "./op.js";
import type {
  TimelineAnimationInput,
  TimelineOpContext,
  TimelineOpOutcome,
  TimelineOpResult,
  TimelineOpState
} from "./types.js";

/** Units a failed lookup names before it stops and points at get_state. */
const MAX_LISTED_UNITS = 12;

/**
 * The clip one `target` names: an id, a case-insensitive name, or the literal
 * `"selected"`. Exported because a host's own I/O needs the same resolution —
 * the browser's `get_clip_frames` samples the clip a caller named, and reading
 * it any other way would give the agent two different answers to "which clip is
 * that?".
 */
export function resolveClipTarget(
  state: TimelineOpState,
  target: string
): TimelineClip {
  if (target.toLowerCase() === "selected") {
    const selected = state.selectedClipIds;
    if (selected.length !== 1) {
      throw new Error(
        `"selected" requires exactly one selected clip (currently ${selected.length}).`
      );
    }
    const clip = state.clips.find((c) => c.id === selected[0]);
    if (!clip) throw new Error("Selected clip no longer exists.");
    return clip;
  }
  const byId = state.clips.find((c) => c.id === target);
  if (byId) return byId;
  const lower = target.toLowerCase();
  const byName = state.clips.find((c) => c.name.toLowerCase() === lower);
  if (byName) return byName;
  throw new Error(
    `No clip found matching "${target}". ${listUnits(state.clips, "clip")}`
  );
}

/**
 * Name the units a caller could have meant, capped: a 200-clip sequence
 * listing all of them is one an agent stops reading.
 */
function listUnits(
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


/** Timing and geometry are their own ops; name the op that does the job. */
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

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * One op's working copy of the document, with the lookups every handler
 * shares. Constructed per call, thrown away when the op returns.
 */
class OpScope {
  readonly changed = new Set<string>();

  constructor(
    readonly state: TimelineOpState,
    readonly ctx: TimelineOpContext
  ) {}

  touch(...ids: string[]): void {
    for (const id of ids) this.changed.add(id);
  }

  get tracks(): TimelineTrack[] {
    return this.state.tracks;
  }

  get clips(): TimelineClip[] {
    return this.state.clips;
  }

  set clips(next: TimelineClip[]) {
    this.state.clips = next;
  }

  /**
   * The ids and names a caller could have used, for the message a failed
   * lookup throws. Capped: a long cut has hundreds of clips and an error
   * listing all of them is one an agent stops reading.
   */
  validUnits(units: readonly { id: string; name: string }[], kind: string): string {
    return listUnits(units, kind);
  }

  addTrack(type: TimelineTrack["type"], name?: string): TimelineTrack {
    const index = this.tracks.length;
    const track = makeTrack({
      id: this.ctx.newId("track"),
      type,
      name: name ?? `${capitalize(type)} ${index + 1}`,
      index
    });
    this.tracks.push(track);
    return track;
  }

  findOrCreateTrack(type: TimelineTrack["type"]): TimelineTrack {
    return this.tracks.find((t) => t.type === type) ?? this.addTrack(type);
  }

  resolveTrack(idOrName: string): TimelineTrack {
    const byId = this.tracks.find((t) => t.id === idOrName);
    if (byId) return byId;
    const lower = idOrName.toLowerCase();
    const byName = this.tracks.find((t) => t.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(
      `No track found matching "${idOrName}". ${this.validUnits(this.tracks, "track")}`
    );
  }

  trackEndMs(trackId: string): number {
    return this.clips
      .filter((c) => c.trackId === trackId)
      .reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  }

  resolveClip(target: string): TimelineClip {
    return resolveClipTarget(this.state, target);
  }

  /** Swap an engine-returned clip into `clips`, keeping the array's order. */
  replaceClip(clip: TimelineClip, next: TimelineClip): TimelineClip {
    const index = this.clips.findIndex((c) => c.id === clip.id);
    if (index >= 0) this.clips[index] = next;
    return next;
  }

  /**
   * The body of `trim_clip`, shared with `set_clip_params`: a caller that
   * sends `durationMs` alongside a style change means the same edit either
   * way, and two copies of the group-trim rule would drift.
   */
  applyTrim(
    clip: TimelineClip,
    patch: { durationMs?: number; inPointMs?: number; outPointMs?: number }
  ): TimelineClip {
    // A group carries what it holds (D4): shortening one pulls its children
    // inside the window that leaves, rather than leaving them hanging past an
    // edge nothing draws.
    if (isGroupClip(clip) && patch.durationMs !== undefined) {
      this.clips = trimGroup(
        this.clips,
        clip.id,
        "end",
        patch.durationMs - clip.durationMs
      );
      const next = this.clips.find((c) => c.id === clip.id)!;
      this.touch(...this.clips.filter((c) => c.parentId === clip.id).map((c) => c.id));
      this.touch(next.id);
      return next;
    }
    // Through the engine, not a raw duration write: `trimClip` refuses a
    // time-remapped clip (D13) and carries the source out-point with the edge.
    let next = clip;
    if (patch.durationMs !== undefined) {
      if (patch.durationMs <= 0) {
        throw new Error(
          `durationMs must be greater than 0 (got ${patch.durationMs}); delete the clip instead of trimming it to nothing`
        );
      }
      next = this.replaceClip(
        clip,
        trimClip(clip, "end", patch.durationMs - clip.durationMs)
      );
    }
    if (patch.inPointMs !== undefined) next.inPointMs = patch.inPointMs;
    if (patch.outPointMs !== undefined) next.outPointMs = patch.outPointMs;
    if (
      patch.durationMs !== undefined ||
      patch.inPointMs !== undefined ||
      patch.outPointMs !== undefined
    ) {
      this.touch(next.id);
    }
    return next;
  }

  /**
   * Trim the start edge: hold the clip's end and move its start to `startMs`.
   * A group pulls its children with it (D4); anything else goes through the
   * engine so the source in-point follows the edge.
   */
  applyTrimStart(clip: TimelineClip, startMs: number): TimelineClip {
    const deltaMs = clip.startMs - Math.max(0, startMs);
    if (deltaMs === 0) return clip;
    this.touch(clip.id);
    if (isGroupClip(clip)) {
      this.clips = trimGroup(this.clips, clip.id, "start", deltaMs);
      return this.clips.find((c) => c.id === clip.id)!;
    }
    return this.replaceClip(clip, trimClip(clip, "start", deltaMs));
  }

  /** The body of `move_clip`, shared with `set_clip_params`. */
  applyMove(
    clip: TimelineClip,
    patch: { startMs?: number; trackId?: string }
  ): TimelineClip {
    // Moving a group moves what it holds by the same delta (D4). Children keep
    // their own tracks, so their z-order is untouched (I9) — only the group
    // itself takes a new `trackId`.
    let moved = clip;
    if (isGroupClip(clip) && patch.startMs !== undefined) {
      const nextStartMs = Math.max(0, patch.startMs);
      this.clips = moveGroup(this.clips, clip.id, nextStartMs - clip.startMs);
      moved = this.clips.find((c) => c.id === clip.id)!;
      this.touch(
        ...this.clips.filter((c) => c.parentId === clip.id).map((c) => c.id)
      );
    } else if (patch.startMs !== undefined) {
      clip.startMs = Math.max(0, patch.startMs);
    }
    if (patch.trackId !== undefined) {
      moved.trackId = this.resolveTrack(patch.trackId).id;
    }
    if (patch.startMs !== undefined || patch.trackId !== undefined) {
      this.touch(moved.id);
    }
    return moved;
  }

  /** Resolve a marker by id, or by case-insensitive label. */
  resolveMarker(target: string): TimelineMarker {
    const byId = this.state.markers.find((m) => m.id === target);
    if (byId) return byId;
    const lower = target.toLowerCase();
    const byLabel = this.state.markers.find(
      (m) => m.label.toLowerCase() === lower
    );
    if (byLabel) return byLabel;
    const known = this.state.markers
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
   * A target that matches nothing comes back as a miss rather than throwing —
   * a batch op that dies on one bad name hides what the other targets did.
   */
  resolveSnapTargets(targets: string[] | undefined): {
    clips: TimelineClip[];
    missing: string[];
  } {
    if (!targets || targets.length === 0) {
      return { clips: [...this.clips], missing: [] };
    }
    const resolved: TimelineClip[] = [];
    const missing: string[] = [];
    for (const target of targets) {
      try {
        const clip = this.resolveClip(target);
        if (!resolved.includes(clip)) resolved.push(clip);
      } catch {
        // Recorded as a skip in the op's own report, with the reason.
        missing.push(target);
      }
    }
    return { clips: resolved, missing };
  }

  clipOut(clip: TimelineClip) {
    return serializeClip(this.state, clip);
  }

  trackOut(track: TimelineTrack) {
    return serializeTrack(this.state, track);
  }
}

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
 * `preset: "custom"`, and it used to be stripped and then rejected as an
 * animation with neither curves nor code.
 */
function liftCustom(input: TimelineAnimationInput): TimelineAnimationInput {
  if (!input.custom) return input;
  const { custom, ...rest } = input;
  return {
    ...rest,
    curves: input.curves ?? custom.curves,
    code: input.code ?? custom.code,
    mask: input.mask ?? custom.mask
  };
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
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Build one `preset: "custom"` animation. `curves` are checked and stored;
 * `code` is baked into curves first, by the host that supplied a baker. Both
 * paths end at `normalizeCustomCurves`, the single gate the compiler and the
 * validator also run, so what is stored is what will render.
 */
async function buildCustomAnimation(
  scope: OpScope,
  clip: TimelineClip,
  input: TimelineAnimationInput
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
        " — `t` runs 0..1 over the window. `code` is a JS body baked into curves instead. Either may also be nested under `custom`."
    );
  }

  // Curves are normalized to 0..1 over the window, so a custom animation with
  // no duration of its own spans the clip and nothing is cropped.
  const durationMs = input.durationMs ?? clip.durationMs;

  let curves: PropertyCurve[];
  let maskInput: unknown;
  if (hasCurves) {
    const normalized = normalizeCustomCurves(input.curves);
    if (!normalized.ok) throw new Error(normalized.error);
    curves = normalized.curves;
    maskInput = input.mask;
  } else {
    const bake = scope.ctx.bakeAnimation;
    if (!bake) {
      throw new Error(
        "This surface cannot run `code`: no animation baker is wired to it. Pass `curves` instead, or bake the body through POST /api/timelines/animations/bake."
      );
    }
    const baked = await bake({
      code,
      role: input.role as AnimationRole,
      durationMs,
      clipDurationMs: clip.durationMs,
      canvas: { width: scope.state.width, height: scope.state.height },
      params: input.params,
      staggerCount: staggerUnitCount(clip, input.stagger)
    });
    if (!baked.ok || !baked.curves) {
      throw new Error(baked.error ?? "The animation body returned no curves.");
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
    bakedAt: (scope.ctx.now ?? (() => new Date().toISOString()))()
  };
  if (hasCode) custom.code = code;
  if (mask.mask) custom.mask = mask.mask;

  return {
    id: scope.ctx.newId("anim"),
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

/** Dispatch one op against `scope`. Throws on refusal; the caller maps it. */
async function runOp(scope: OpScope, op: TimelineOp): Promise<TimelineOpResult> {
  const state = scope.state;
  switch (op.op) {
    case "get_state": {
      const durationMs = scope.clips.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0
      );
      return {
        ok: true,
        fps: state.fps,
        width: state.width,
        height: state.height,
        durationMs,
        playheadMs: state.playheadMs,
        selectedClipIds: [...state.selectedClipIds],
        tracks: scope.tracks.map((t) => scope.trackOut(t)),
        clips: scope.clips.map((c) => scope.clipOut(c)),
        markers: state.markers.map((m) => ({ ...m }))
      };
    }

    case "add_track": {
      const track = scope.addTrack(op.type, op.name);
      return { ok: true, track: scope.trackOut(track) };
    }

    case "move_track": {
      const { target, toIndex, before, after } = resolveMoveTrackArgs(op);
      const track = scope.resolveTrack(target);
      const destination: TrackDestination = {};
      if (toIndex !== undefined) destination.toIndex = toIndex;
      if (before !== undefined) destination.beforeId = scope.resolveTrack(before).id;
      if (after !== undefined) destination.afterId = scope.resolveTrack(after).id;
      const orderedIds = moveTrackOrder(scope.tracks, track.id, destination);
      const byId = new Map(scope.tracks.map((t) => [t.id, t]));
      // The array order is what `get_state` prints, so keep it and the indices
      // saying the same thing.
      scope.tracks.length = 0;
      orderedIds.forEach((id, i) => {
        const moved = byId.get(id)!;
        moved.index = i;
        scope.tracks.push(moved);
      });
      return {
        ok: true,
        track: scope.trackOut(track),
        tracks: scope.tracks.map((t) => scope.trackOut(t))
      };
    }

    case "delete_track": {
      const { target, deleteClips } = resolveDeleteTrackArgs(op);
      const track = scope.resolveTrack(target);
      const onIt = scope.clips.filter((c) => c.trackId === track.id);
      if (onIt.length > 0 && !deleteClips) {
        throw new Error(
          `Track "${track.name}" still holds ${onIt.length} clip(s): ` +
            `${onIt.map((c) => c.id).join(", ")}. Move them first, or pass ` +
            "deleteClips: true to delete them with the track."
        );
      }
      const removedClipIds = onIt.map((c) => c.id);
      const kept = scope.clips.filter((c) => c.trackId !== track.id);
      scope.clips.length = 0;
      scope.clips.push(...kept);
      // A parent that went with the track would leave its children pointing at
      // a clip that no longer exists, which the validator reads as a broken
      // document rather than a deletion.
      for (const clip of scope.clips) {
        if (clip.parentId && removedClipIds.includes(clip.parentId)) {
          delete clip.parentId;
          scope.touch(clip.id);
        }
      }
      scope.touch(...removedClipIds);
      state.selectedClipIds = state.selectedClipIds.filter(
        (id) => !removedClipIds.includes(id)
      );
      const remaining = scope.tracks.filter((t) => t.id !== track.id);
      scope.tracks.length = 0;
      // Index is z-order, so the stack has to close over the gap.
      remaining.forEach((t, i) => {
        t.index = i;
        scope.tracks.push(t);
      });
      return {
        ok: true,
        deleted: { id: track.id, name: track.name, type: track.type },
        deletedClipIds: removedClipIds,
        tracks: scope.tracks.map((t) => scope.trackOut(t))
      };
    }

    case "add_text_clip": {
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay");
      // `style` wins over a top-level twin: a caller that sent both meant the
      // bag it named.
      const s = { ...(op.loose ?? {}), ...(op.style ?? {}) };
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.text,
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs: op.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS,
        mediaType: "text",
        sourceType: "imported",
        status: "generated",
        textStyle: textStyleWithDefaults(op.text, s)
      });
      if (op.opacity !== undefined) clip.opacity = op.opacity;
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "add_media_clip": {
      const resolveAsset = scope.ctx.resolveAsset;
      if (!resolveAsset) {
        throw new Error(
          "This timeline surface cannot look up assets, so an existing asset cannot be placed here."
        );
      }
      const found = await resolveAsset(op.asset);
      if (!found) {
        throw new Error(
          `No asset found for "${op.asset}". Pass an asset id or an asset:// URI from list_assets.`
        );
      }
      const mediaType = mediaTypeForContentType(found.contentType);
      if (!mediaType) {
        throw new Error(
          `Asset "${found.name}" is ${found.contentType}, which is not video, image, or audio and cannot go on a timeline.`
        );
      }
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack(trackTypeForMediaType(mediaType));
      const init: Parameters<typeof makeClip>[0] = {
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.name ?? found.name,
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs:
          op.durationMs ?? found.durationMs ?? DEFAULT_MEDIA_CLIP_DURATION_MS,
        mediaType,
        sourceType: "imported",
        status: "generated",
        currentAssetId: found.id
      };
      if (found.thumbnailAssetId) init.thumbnailAssetId = found.thumbnailAssetId;
      const clip = makeClip(init);
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "add_shape_clip": {
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay");
      const shapeArg = resolveShapeArg(op.shape, op.shapeStyle, op.loose ?? {});
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: capitalize(shapeArg.kind),
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs: op.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS,
        mediaType: "shape",
        sourceType: "imported",
        status: "generated",
        shapeStyle: shapeStyleWithDefaults(shapeArg)
      });
      if (op.opacity !== undefined) clip.opacity = op.opacity;
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "add_group": {
      // Resolve every child before anything is written: a half-applied group
      // leaves the caller with an empty group and no idea which of its clips
      // moved.
      const targets = (op.children ?? []).map((ref) => scope.resolveClip(ref));
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay");
      const group = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.name,
        startMs: op.startMs,
        durationMs: op.durationMs,
        mediaType: "group",
        sourceType: "imported",
        status: "generated"
      });
      scope.clips.push(group);
      for (const child of targets) {
        child.parentId = group.id;
        scope.touch(child.id);
      }
      state.selectedClipIds = [group.id];
      scope.touch(group.id);
      return {
        ok: true,
        clip: scope.clipOut(group),
        children: targets.map((c) => c.id)
      };
    }

    case "generate_clip": {
      const mediaType: TimelineClip["mediaType"] =
        op.kind === "text-to-video"
          ? "video"
          : op.kind === "text-to-image"
            ? "image"
            : "audio";

      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : op.kind === "text-to-audio"
          ? scope.findOrCreateTrack("audio")
          : op.kind === "text-to-video"
            ? scope.findOrCreateTrack("video")
            : (scope.tracks.find(
                (t) => t.type === "video" || t.type === "overlay"
              ) ?? scope.findOrCreateTrack("video"));

      const generationStarted = op.autoGenerate !== false;
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.prompt,
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs:
          op.durationMs ?? (op.kind === "text-to-audio" ? 3000 : 5000),
        mediaType,
        sourceType: "generated",
        bindingKind: op.kind as TimelineClip["bindingKind"],
        status: generationStarted ? "generating" : "draft",
        prompt: op.prompt,
        provider: op.provider,
        model: op.model,
        voice: op.voice,
        width: op.width,
        height: op.height,
        aspectRatio: op.aspectRatio,
        resolution: op.resolution
      });
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      const result: {
        ok: true;
        clip: ReturnType<OpScope["clipOut"]>;
        generationStarted: boolean;
        note?: string;
      } = { ok: true, clip: scope.clipOut(clip), generationStarted };
      if (!generationStarted) {
        result.note = "Generation not started (autoGenerate=false).";
      }
      return result;
    }

    case "split_clip": {
      const clip = scope.resolveClip(op.target);
      const at = op.atMs ?? state.playheadMs;
      const [left, right] = splitClip(clip, at);
      left.id = scope.ctx.newId("clip");
      right.id = scope.ctx.newId("clip");
      const idx = scope.clips.findIndex((c) => c.id === clip.id);
      scope.clips.splice(idx, 1, left, right);
      state.selectedClipIds = state.selectedClipIds.filter(
        (id) => id !== clip.id
      );
      scope.touch(clip.id, left.id, right.id);
      return { ok: true, clips: [scope.clipOut(left), scope.clipOut(right)] };
    }

    case "trim_clip": {
      const trimmed = scope.applyTrim(scope.resolveClip(op.target), {
        durationMs: op.durationMs,
        inPointMs: op.inPointMs,
        outPointMs: op.outPointMs
      });
      return { ok: true, clip: scope.clipOut(trimmed) };
    }

    case "move_clip": {
      const moved = scope.applyMove(scope.resolveClip(op.target), {
        startMs: op.startMs,
        trackId: op.trackId
      });
      return { ok: true, clip: scope.clipOut(moved) };
    }

    case "delete_clip": {
      const clip = scope.resolveClip(op.target);
      // Deleting a group deletes the parent, not the picture: its children stay
      // where they are and stop inheriting (D4). Leaving them with a `parentId`
      // nothing answers is what the validator calls a dangling parent.
      const wasChild = scope.clips
        .filter((c) => c.parentId === clip.id)
        .map((c) => c.id);
      const remaining = isGroupClip(clip) ? ungroup(scope.clips, clip.id) : scope.clips;
      const out = scope.clipOut(clip);
      scope.clips = remaining.filter((c) => c.id !== clip.id);
      state.selectedClipIds = state.selectedClipIds.filter((id) => id !== clip.id);
      scope.touch(clip.id, ...wasChild);
      return { ok: true, deleted: out };
    }

    case "duplicate_clip": {
      const src = scope.resolveClip(op.target);
      const copy: TimelineClip = {
        ...src,
        id: scope.ctx.newId("clip"),
        startMs: src.startMs + src.durationMs + (op.gapMs ?? 0),
        versions: [],
        animations: src.animations?.map((a) => ({
          ...a,
          id: scope.ctx.newId("anim")
        }))
      };
      scope.clips.push(copy);
      state.selectedClipIds = [copy.id];
      scope.touch(copy.id);
      return { ok: true, clip: scope.clipOut(copy) };
    }

    case "set_clip_params": {
      let clip = scope.resolveClip(op.target);
      const patch = { ...op.patch };
      rejectUnknownClipParams(patch);
      // Timing belongs to move_clip and trim_clip, but a caller sending it here
      // means one edit either way — so apply it through the same code rather
      // than dropping it or making them call twice.
      clip = scope.applyTrim(clip, {
        durationMs: patch.durationMs,
        inPointMs: patch.inPointMs,
        outPointMs: patch.outPointMs
      });
      clip = scope.applyMove(clip, {
        startMs: patch.startMs,
        trackId: patch.trackId
      });
      if (patch.fontSizePx !== undefined) {
        // Shorthand for the one text field callers reach for by name.
        const style = patch.textStyle ?? clip.textStyle;
        if (!style) {
          throw new Error(
            `Clip "${clip.name}" carries no text to size; fontSizePx applies to a text clip's textStyle.`
          );
        }
        patch.textStyle = { ...style, fontSizePx: patch.fontSizePx };
      }
      if (patch.name !== undefined) clip.name = patch.name;
      if (patch.opacity !== undefined) clip.opacity = patch.opacity;
      if (patch.speedMultiplier !== undefined) {
        clip.speedMultiplier = patch.speedMultiplier;
      }
      if (patch.volumeDb !== undefined) clip.volumeDb = patch.volumeDb;
      if (patch.fadeInMs !== undefined) clip.fadeInMs = patch.fadeInMs;
      if (patch.fadeOutMs !== undefined) clip.fadeOutMs = patch.fadeOutMs;
      if (patch.blendMode !== undefined) {
        clip.blendMode = patch.blendMode as TimelineClip["blendMode"];
      }
      if (patch.borderRadius !== undefined) clip.borderRadius = patch.borderRadius;
      if (patch.hidden !== undefined) clip.hidden = patch.hidden;
      if (patch.muted !== undefined) clip.muted = patch.muted;
      if (patch.locked !== undefined) clip.locked = patch.locked;
      if (patch.textStyle !== undefined) clip.textStyle = patch.textStyle;
      if (patch.shapeStyle !== undefined) clip.shapeStyle = patch.shapeStyle;
      if (patch.captionStyle !== undefined) {
        // The style rides on the clip's caption, so a clip with no words to
        // draw has nowhere to put it. Say so rather than storing a look nothing
        // renders.
        if (!clip.caption) {
          throw new Error(`Clip "${clip.name}" carries no caption to style.`);
        }
        clip.caption = { ...clip.caption, style: patch.captionStyle };
      }
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_parent": {
      const clip = scope.resolveClip(op.target);
      scope.touch(clip.id);
      if (op.parentId === null) {
        delete clip.parentId;
        return { ok: true, clip: scope.clipOut(clip) };
      }
      const parent = scope.resolveClip(op.parentId);
      if (parent.mediaType !== "group") {
        throw new Error(
          `"${parent.name}" is a ${parent.mediaType} clip, not a group — parent to a clip created with add_group. ${scope.validUnits(
            scope.clips.filter((c) => c.mediaType === "group"),
            "group"
          )}`
        );
      }
      // A cycle renders unparented and warns, so refusing it here is the only
      // place it can still be fixed.
      let cursor: TimelineClip | undefined = parent;
      while (cursor) {
        if (cursor.id === clip.id) {
          throw new Error(
            `"${parent.name}" is inside "${clip.name}" — parenting them would make a cycle.`
          );
        }
        const next: string | undefined = cursor.parentId;
        cursor = next ? scope.clips.find((c) => c.id === next) : undefined;
      }
      clip.parentId = parent.id;
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_transition": {
      const clip = scope.resolveClip(op.target);
      if (op.transition === null) {
        delete clip.transitionIn;
      } else {
        clip.transitionIn = buildTransition(op.transition);
      }
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_mask": {
      const clip = scope.resolveClip(op.target);
      if (op.mask === null) {
        delete clip.mask;
      } else {
        clip.mask = buildMask(op.mask, scope.ctx.parseSvgPath);
      }
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_matte": {
      const clip = scope.resolveClip(op.target);
      scope.touch(clip.id);
      if (op.matte === null) {
        delete clip.matte;
        return { ok: true, clip: scope.clipOut(clip) };
      }
      const source = scope.resolveClip(op.matte.source);
      if (source.id === clip.id) {
        throw new Error(
          `"${clip.name}" cannot be its own matte source — name another clip.`
        );
      }
      const matteOut: NonNullable<TimelineClip["matte"]> = {
        sourceClipId: source.id,
        mode: op.matte.mode
      };
      if (op.matte.invert !== undefined) matteOut.invert = op.matte.invert;
      clip.matte = matteOut;
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_time_remap": {
      const clip = scope.resolveClip(op.target);
      if (op.timeRemap === null) {
        delete clip.timeRemap;
      } else {
        clip.timeRemap = buildTimeRemap(op.timeRemap);
      }
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_effects": {
      const clip = scope.resolveClip(op.target);
      const list = op.effects.map(buildEffect);
      if (list.length === 0) {
        delete clip.effects;
      } else {
        clip.effects = list;
      }
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_clip_binding": {
      const clip = scope.resolveClip(op.target);
      if (clip.sourceType !== "generated") {
        throw new Error(
          `"${clip.name}" is not a generated clip — ui_timeline_set_clip_binding only applies to clips created with ui_timeline_generate_clip.`
        );
      }
      if (op.prompt !== undefined) clip.prompt = op.prompt;
      if (op.negativePrompt !== undefined) clip.negativePrompt = op.negativePrompt;
      if (op.provider !== undefined) clip.provider = op.provider;
      if (op.model !== undefined) clip.model = op.model;
      if (op.voice !== undefined) clip.voice = op.voice;
      if (op.width !== undefined) clip.width = op.width;
      if (op.height !== undefined) clip.height = op.height;
      if (op.aspectRatio !== undefined) clip.aspectRatio = op.aspectRatio;
      if (op.resolution !== undefined) clip.resolution = op.resolution;
      if (op.strength !== undefined) clip.strength = op.strength;
      if (op.numInferenceSteps !== undefined) {
        clip.numInferenceSteps = op.numInferenceSteps;
      }
      if (op.regenerate) clip.status = "queued";
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "animate_clip": {
      const clip = scope.resolveClip(op.target);
      const built: ClipAnimation[] = [];
      for (const input of op.animations) {
        if (input.preset === CUSTOM_ANIMATION_PRESET_ID) {
          // `{preset: "custom", custom: {curves}}` reads as naturally as the
          // flat form, so lift it rather than refusing it.
          built.push(await buildCustomAnimation(scope, clip, liftCustom(input)));
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
          id: scope.ctx.newId("anim"),
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
        op.mode === "add" ? [...(clip.animations ?? []), ...built] : built;
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "clear_animations": {
      const clip = scope.resolveClip(op.target);
      clip.animations = op.role
        ? (clip.animations ?? []).filter((a) => a.role !== op.role)
        : [];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "list_animation_presets": {
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

    case "select_clip": {
      if (!op.target) {
        state.selectedClipIds = [];
        return { ok: true, selected: null };
      }
      const clip = scope.resolveClip(op.target);
      state.selectedClipIds = [clip.id];
      return { ok: true, selected: scope.clipOut(clip) };
    }

    case "seek": {
      state.playheadMs = Math.max(0, op.timeMs);
      return { ok: true, playheadMs: state.playheadMs };
    }

    case "add_marker": {
      if (op.timeMs < 0) {
        throw new Error(`A marker cannot sit before zero; got ${op.timeMs}ms.`);
      }
      const marker: TimelineMarker = {
        id: scope.ctx.newId("marker"),
        timeMs: Math.round(op.timeMs),
        label: op.label ?? ""
      };
      if (op.color !== undefined) marker.color = op.color;
      if (op.note !== undefined) marker.note = op.note;
      state.markers.push(marker);
      return { ok: true, marker: { ...marker } };
    }

    case "delete_marker": {
      const marker = scope.resolveMarker(op.target);
      state.markers = state.markers.filter((m) => m.id !== marker.id);
      return { ok: true, deleted: { ...marker } };
    }

    case "set_markers_from_beats": {
      const grid = buildBeatGrid({
        onsetsMs: op.onsets_ms,
        bpm: op.bpm,
        offsetMs: op.offset_ms,
        count: op.count
      });
      const stem = (op.label ?? "Beat").trim() || "Beat";
      const taken = new Set(state.markers.map((m) => m.timeMs));
      const added: TimelineMarker[] = [];
      const skipped: number[] = [];
      for (const [index, timeMs] of grid.entries()) {
        if (taken.has(timeMs)) {
          skipped.push(timeMs);
          continue;
        }
        const marker: TimelineMarker = {
          id: scope.ctx.newId("marker"),
          timeMs,
          label: `${stem} ${index + 1}`
        };
        state.markers.push(marker);
        taken.add(timeMs);
        added.push(marker);
      }
      return {
        ok: true,
        grid: {
          count: grid.length,
          firstMs: grid[0],
          lastMs: grid[grid.length - 1]
        },
        added: added.map((m) => ({ ...m })),
        skipped_times_ms: skipped,
        markers: state.markers.length
      };
    }

    case "snap_to_beats": {
      const named =
        op.targets === undefined || op.targets === "all" ? undefined : op.targets;
      const { clips: targeted, missing } = scope.resolveSnapTargets(named);

      const offsetMs = op.offset_ms ?? 0;
      // A tempo grid has to reach the last boundary being snapped, so its
      // length comes from the targets rather than from the caller.
      const reachMs = targeted.reduce(
        (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
        0
      );
      const grid = buildBeatGrid({
        onsetsMs: op.onsets_ms,
        bpm: op.bpm,
        offsetMs: op.offset_ms,
        count:
          op.bpm === undefined
            ? undefined
            : beatCountToCover(op.bpm, offsetMs, reachMs)
      });

      const options: {
        toleranceMs?: number;
        mode?: SnapBoundaryMode;
        action?: SnapAction;
      } = {};
      if (op.tolerance_ms !== undefined) options.toleranceMs = op.tolerance_ms;
      if (op.mode !== undefined) options.mode = op.mode;
      if (op.action !== undefined) options.action = op.action;

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
          // Through the same ops the caller would use: a group carries its
          // children (D4) and a trim carries the source points, neither of
          // which a raw startMs/durationMs write does.
          try {
            if (entry.after.durationMs === entry.before.durationMs) {
              scope.applyMove(clip, { startMs: entry.after.startMs });
            } else {
              let trimmed = clip;
              if (entry.after.startMs !== entry.before.startMs) {
                trimmed = scope.applyTrimStart(clip, entry.after.startMs);
              }
              scope.applyTrim(trimmed, { durationMs: entry.after.durationMs });
            }
          } catch (error) {
            return {
              ...entry,
              snapped: false,
              after: entry.before,
              delta: { startMs: 0, endMs: 0 },
              reason: error instanceof Error ? error.message : String(error),
              clipName: clip.name
            };
          }
        }
        return { ...entry, clipName: clip?.name ?? null };
      });

      // A name nothing matched is a skip like any other: the caller has to see
      // it in the same list, not infer it from a shorter one.
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

    case "insert_composition": {
      const loader = scope.ctx.loadComposition;
      if (!loader) {
        throw new Error(
          "This surface has no composition library, so insert_composition cannot resolve a template."
        );
      }
      const composition = await loader.get(op.composition_id);
      if (!composition) {
        const available = await loader.listIds();
        throw new Error(
          `No composition with id "${op.composition_id}". ` +
            (available.length > 0
              ? `Available: ${available.join(", ")}.`
              : "This install has none — save one with save_composition.")
        );
      }

      const minted = instantiateComposition(composition, {
        startMs: op.startMs,
        params: op.params,
        newId: () => scope.ctx.newId("clip")
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
        const existing = scope.tracks.find(
          (t) => t.type === "overlay" && t.name === name
        );
        mapped.set(name, (existing ?? scope.addTrack("overlay", name)).id);
      }

      // The group draws nothing, but it still occupies its track's timeline,
      // and a group sharing a track with one of its children reads as an
      // overlap. It gets a track named after the composition instead.
      const groupTrack = op.trackId
        ? scope.resolveTrack(op.trackId)
        : (scope.tracks.find(
            (t) => t.type === "overlay" && t.name === composition.name
          ) ?? scope.addTrack("overlay", composition.name));
      const [group, ...children] = minted as [TimelineClip, ...TimelineClip[]];
      group.trackId = groupTrack.id;
      for (const [index, child] of children.entries()) {
        child.trackId =
          mapped.get(composition.children[index]!.trackId) ?? groupTrack.id;
      }
      scope.clips.push(group, ...children);
      state.selectedClipIds = [group.id];
      scope.touch(group.id, ...children.map((c) => c.id));

      return {
        ok: true,
        compositionId: composition.id,
        clip: scope.clipOut(group),
        children: children.map((child) => scope.clipOut(child)),
        params: group.compositionParams ?? {}
      };
    }

    default: {
      const unknown = op as { op: string };
      throw new Error(`Unknown timeline op "${unknown.op}".`);
    }
  }
}

/** Deep copy of the document, so a failed op leaves the caller's state alone. */
function cloneState(state: TimelineOpState): TimelineOpState {
  return {
    fps: state.fps,
    width: state.width,
    height: state.height,
    tracks: state.tracks.map((t) => structuredClone(t)),
    clips: state.clips.map((c) => structuredClone(c)),
    markers: state.markers.map((m) => structuredClone(m)),
    playheadMs: state.playheadMs,
    selectedClipIds: [...state.selectedClipIds]
  };
}

/**
 * Apply one op to a document and report what it did.
 *
 * The state that comes back is a new object; the one handed in is never
 * written to. An op that refuses returns the input state with `error` set.
 */
export async function applyTimelineOp(
  state: TimelineOpState,
  op: TimelineOp,
  ctx: TimelineOpContext
): Promise<TimelineOpOutcome> {
  const scope = new OpScope(cloneState(state), ctx);
  try {
    const result = await runOp(scope, op);
    return {
      state: scope.state,
      result,
      changedClipIds: [...scope.changed]
    };
  } catch (error) {
    return {
      state,
      result: {},
      changedClipIds: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
