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
 * `src/render` or `@nodetool-ai/gpu`, so editing needs no renderer (AS2).
 */

import { isShortResourceId } from "@nodetool-ai/protocol";
import type { MidiNoteParams } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  buildEffect,
  buildMask,
  buildTimeRemap,
  buildTransition,
  resolveDeleteTrackArgs,
  resolveMoveTrackArgs,
  resolveShapeArg,
  textStyleParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { staggerClipAnimations } from "../animation/beat.js";
import type { PropertyCurve } from "../animation/compile.js";
import {
  ANIMATION_PRESETS,
  buildBakedAnimation,
  CUSTOM_ANIMATION_CONTRACT,
  CUSTOM_ANIMATION_PRESET_ID,
  normalizeCustomCurves,
  resolveCustomMask,
  typewriterTiming
} from "../animation/index.js";
import type {
  AnimationRole,
  ClipAnimation,
  CustomClipAnimation
} from "../animation/types.js";
import {
  model3dStyleWithPatch,
  shapeStyleWithDefaults,
  textStyleWithDefaults
} from "../authoredStyles.js";
import {
  beatCountToCover,
  buildBeatGrid,
  snapClipsToGrid,
  type SnapAction,
  type SnapBoundaryMode
} from "../beats.js";
import { instantiateComposition } from "../composition.js";
import { isCropUsable } from "../crop.js";
import {
  DEFAULT_MEDIA_CLIP_DURATION_MS,
  DEFAULT_MODEL3D_CLIP_DURATION_MS,
  DEFAULT_MODEL3D_CLIP_NAME,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  clipFitsTrack,
  makeClip,
  makeClipVersion,
  makeTrack,
  mediaTypeForContentType,
  trackTypeForMediaType
} from "../defaults.js";
import { assertAuthorableFontFamily } from "../fonts/catalog.js";
import { selectGeneratedMatteVersion } from "../generatedMatte.js";
import {
  groupDescendantIds,
  isGroupClip,
  moveGroup,
  trimGroup,
  ungroup
} from "../group.js";
import {
  isMediaTrackStale,
  resliceTracksForSplitClip,
  resliceTracksForTrimmedClip
} from "../mediaTrack.js";
import { quantizeNotes, scaleVelocity, transposeNotes } from "../midi/edit.js";
import { DEFAULT_MIDI_INSTRUMENT } from "../midi/instrument.js";
import { createMidiNote, sortNotes, validateNotes } from "../midi/notes.js";
import {
  findInstrumentPreset,
  MIDI_INSTRUMENT_PRESETS
} from "../midi/presets.js";
import {
  DEFAULT_TEMPO,
  rescaleClipsForTempo,
  resolveTempo
} from "../midi/tempo.js";
import { computeModel3DBakeHash } from "../model3dBake.js";
import {
  addReframeKeyframe,
  clearReframe,
  mediaTrackCanDriveReframe
} from "../reframe.js";
import { adaptSequenceFormat } from "../retarget.js";
import { sourceRate } from "../sourceRate.js";
import { splitClip } from "../splitClip.js";
import {
  activeTakeIdOf,
  deleteTake as deleteTakeOnClip,
  renameTake as renameTakeOnClip,
  selectTake
} from "../takes.js";
import { moveTrackOrder, type TrackDestination } from "../trackOrder.js";
import {
  applyTransitionAtCutCandidate,
  planTransitionAtCut
} from "../transitionAtCut.js";
import { trimClip } from "../trimClip.js";
import type {
  ClipTransform,
  MediaTrack,
  MidiInstrument,
  TimelineClip,
  TimelineMarker,
  TimelineSequence,
  TimelineTrack,
  TrackBinding
} from "../types.js";
import type { ClipTransformPatch, TimelineOp } from "./op.js";
import {
  serializeClip,
  serializeMediaTrack,
  serializeTrack
} from "./serialize.js";
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
    if (!clip) {
      throw new Error("Selected clip no longer exists.");
    }
    return clip;
  }
  const byId = state.clips.find((c) => c.id === target);
  if (byId) {
    return byId;
  }
  const prefix = resolveShortId(state.clips, target, "clip");
  if (prefix) {
    return prefix;
  }
  const lower = target.toLowerCase();
  const byName = state.clips.find((c) => c.name.toLowerCase() === lower);
  if (byName) {
    return byName;
  }
  throw new Error(
    `No clip found matching "${target}". ${listUnits(state.clips, "clip")}`
  );
}

function resolveShortId<T extends { id: string }>(
  units: readonly T[],
  target: string,
  kind: string
): T | undefined {
  if (!isShortResourceId(target)) {
    return undefined;
  }
  const matches = units.filter((unit) => unit.id.startsWith(target));
  if (matches.length > 1) {
    throw new Error(
      `Prefix "${target}" matches more than one ${kind}; use a full id.`
    );
  }
  return matches[0];
}

/** A unit by exact id, or by an exact unique 12-character prefix of one. */
function findByIdOrShortId<T extends { id: string }>(
  units: readonly T[],
  target: string,
  kind: string
): T | undefined {
  return (
    units.find((unit) => unit.id === target) ??
    resolveShortId(units, target, kind)
  );
}

/**
 * The beat one `target` names: an exact id, an exact unique 12-character id
 * prefix, or a 1-based position written as digits only. Anything else is
 * refused, so a hex id that happens to start with a digit is never read as a
 * position. Exported because the browser bridge resolves the same names.
 */
export function resolveBeatTarget<T extends { id: string }>(
  beats: readonly T[],
  target: string
): T {
  const byId = findByIdOrShortId(beats, target, "beat");
  if (byId) {
    return byId;
  }
  const byPosition = /^\d+$/.test(target)
    ? beats[Number.parseInt(target, 10) - 1]
    : undefined;
  if (byPosition) {
    return byPosition;
  }
  throw new Error(
    `No beat matches "${target}". Use a beat id or its 1-based position. ` +
      (beats.length
        ? `This plan has ${beats.length} beats.`
        : "This sequence has no beat plan yet; run ui_timeline_plan_beats first.")
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
  if (units.length === 0) {
    return `The timeline has no ${kind}s yet.`;
  }
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
  "transform",
  "speedMultiplier",
  "volumeDb",
  "fadeInMs",
  "fadeOutMs",
  "fadeInShape",
  "fadeOutShape",
  "blendMode",
  "borderRadius",
  "crop",
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

function mergeClipTransform(
  current: ClipTransform | undefined,
  patch: ClipTransformPatch
): ClipTransform {
  return {
    position: { x: 0, y: 0, ...current?.position, ...patch.position },
    scale: { x: 1, y: 1, ...current?.scale, ...patch.scale },
    rotation: patch.rotation ?? current?.rotation ?? 0,
    rotationX: patch.rotationX ?? current?.rotationX,
    rotationY: patch.rotationY ?? current?.rotationY,
    perspective: patch.perspective ?? current?.perspective,
    anchor: { x: 0.5, y: 0.5, ...current?.anchor, ...patch.anchor }
  };
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
    for (const id of ids) {
      this.changed.add(id);
    }
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

  get mediaTracks(): MediaTrack[] {
    return this.state.mediaTracks ?? [];
  }

  set mediaTracks(next: MediaTrack[]) {
    this.state.mediaTracks = next;
  }

  /**
   * The ids and names a caller could have used, for the message a failed
   * lookup throws. Capped: a long cut has hundreds of clips and an error
   * listing all of them is one an agent stops reading.
   */
  validUnits(
    units: readonly { id: string; name: string }[],
    kind: string
  ): string {
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
    if (type === "midi") {
      track.instrument = structuredClone(
        this.ctx.defaultMidiInstrument ?? DEFAULT_MIDI_INSTRUMENT
      );
      this.state.tempo ??= structuredClone(DEFAULT_TEMPO);
    }
    this.tracks.push(track);
    return track;
  }

  /** The first unlocked track of `type`, or a new one: a lock refuses writes. */
  findOrCreateTrack(type: TimelineTrack["type"], name?: string): TimelineTrack {
    return (
      this.tracks.find((t) => t.type === type && !t.locked) ??
      this.addTrack(type, name)
    );
  }

  /**
   * Refuse an edit that writes to a locked clip, a clip on a locked track, or
   * a locked destination track. Every op that changes a clip or places one
   * asks here, so the lock means the same thing on every path.
   */
  assertWritable(
    clips: readonly TimelineClip[],
    destinationTrackId?: string
  ): void {
    const tracks = new Map(this.tracks.map((track) => [track.id, track]));
    for (const clip of clips) {
      if (clip.locked || tracks.get(clip.trackId)?.locked) {
        throw new Error(
          `Clip "${clip.name}" or its track is locked. Unlock it before editing.`
        );
      }
    }
    if (destinationTrackId !== undefined) {
      const track = tracks.get(destinationTrackId);
      if (track?.locked) {
        throw new Error(
          `Track "${track.name}" is locked. Unlock it or choose another track.`
        );
      }
    }
  }

  resolveTrack(idOrName: string): TimelineTrack {
    const byId = this.tracks.find((t) => t.id === idOrName);
    if (byId) {
      return byId;
    }
    if (isShortResourceId(idOrName)) {
      const matches = this.tracks.filter((track) =>
        track.id.startsWith(idOrName)
      );
      if (matches.length === 1 && matches[0]) {
        return matches[0];
      }
      if (matches.length > 1) {
        throw new Error(
          `Short track id "${idOrName}" matches more than one track; use the full id or name.`
        );
      }
    }
    const lower = idOrName.toLowerCase();
    const byName = this.tracks.find((t) => t.name.toLowerCase() === lower);
    if (byName) {
      return byName;
    }
    throw new Error(
      `No track found matching "${idOrName}". ${this.validUnits(this.tracks, "track")}`
    );
  }

  trackEndMs(trackId: string): number {
    return this.clips
      .filter((c) => c.trackId === trackId)
      .reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  }

  resolveMidiTrack(target: string): TimelineTrack {
    const track = this.resolveTrack(target);
    if (track.type !== "midi") {
      throw new Error(
        `Track "${track.name}" is a ${track.type} track — notes are played by a midi track's instrument. ${this.validUnits(
          this.tracks.filter((t) => t.type === "midi"),
          "midi track"
        )}`
      );
    }
    return track;
  }

  resolveMidiClip(target: string): TimelineClip {
    const clip = this.resolveClip(target);
    if (clip.mediaType !== "midi") {
      throw new Error(
        `Clip "${clip.name}" is a ${clip.mediaType} clip — only a midi clip carries notes. Place one with add_midi_clip.`
      );
    }
    return clip;
  }

  buildNotes(input: readonly MidiNoteParams[] | undefined, name: string) {
    const reserved = new Set(
      (input ?? []).flatMap((note) => (note.id ? [note.id] : []))
    );
    const mintNote = (): string => {
      let id = this.ctx.newId("note");
      while (reserved.has(id)) {
        id = this.ctx.newId("note");
      }
      reserved.add(id);
      return id;
    };
    const notes = (input ?? []).map((n) =>
      createMidiNote({
        id: n.id ?? mintNote(),
        pitch: n.pitch,
        velocity: n.velocity,
        startTick: n.start_tick,
        durationTick: n.duration_tick
      })
    );
    const problems = validateNotes(notes);
    if (problems.length) {
      throw new Error(
        `Clip "${name}" was not given its notes — ${problems.length} problem(s): ` +
          problems
            .map((p) => (p.noteId ? `${p.noteId}: ${p.message}` : p.message))
            .join(" ")
      );
    }
    return sortNotes(notes);
  }

  resolveClip(target: string): TimelineClip {
    return resolveClipTarget(this.state, target);
  }

  editTargets(clip: TimelineClip): TimelineClip[] {
    const children = isGroupClip(clip)
      ? groupDescendantIds(this.clips, clip.id)
      : new Set<string>();
    const targets = this.clips.filter(
      (candidate) =>
        candidate.id === clip.id ||
        children.has(candidate.id) ||
        (this.ctx.followLinks !== false &&
          clip.linkId &&
          candidate.linkId === clip.linkId)
    );
    this.assertWritable(targets);
    return targets;
  }

  assertPictureTrack(track: TimelineTrack): void {
    if (track.type !== "video" && track.type !== "overlay") {
      throw new Error(
        `Authored clips require a video or overlay track; "${track.name}" is ${track.type}.`
      );
    }
  }

  /** Swap an engine-returned clip into `clips`, keeping the array's order. */
  replaceClip(clip: TimelineClip, next: TimelineClip): TimelineClip {
    const index = this.clips.findIndex((c) => c.id === clip.id);
    if (index >= 0) {
      this.clips[index] = next;
    }
    return next;
  }

  /**
   * How far a clip's source reaches, for capping a trim that grows it: the
   * asset's own duration when the host knows it. An imported audio or video
   * clip whose length nobody knows may not grow past its current out-point,
   * the rule the editor's keyboard trim applies. Undefined means no cap — a
   * picture with no running time, or a generated clip a regeneration can
   * lengthen.
   */
  async sourceLimitMs(clip: TimelineClip): Promise<number | undefined> {
    if (clip.mediaType !== "audio" && clip.mediaType !== "video") {
      return undefined;
    }
    const assetId = clip.currentAssetId;
    if (!assetId) {
      return undefined;
    }
    let known: number | undefined;
    try {
      known = (await this.ctx.resolveAsset?.(assetId))?.durationMs;
    } catch {
      // An unreadable asset is an unknown length, handled below.
      known = undefined;
    }
    if (known !== undefined && known > 0) {
      return known;
    }
    if (clip.sourceType !== "imported") {
      return undefined;
    }
    return (
      clip.outPointMs ??
      (clip.inPointMs ?? 0) + clip.durationMs * sourceRate(clip)
    );
  }

  /**
   * The body of `trim_clip`, shared with `set_clip_params`: a caller that
   * sends `durationMs` alongside a style change means the same edit either
   * way, and two copies of the group-trim rule would drift.
   */
  applyTrim(
    clip: TimelineClip,
    patch: { durationMs?: number; inPointMs?: number; outPointMs?: number },
    maxSourceMs?: number
  ): TimelineClip {
    if (
      patch.durationMs === undefined &&
      patch.inPointMs === undefined &&
      patch.outPointMs === undefined
    ) {
      return clip;
    }
    if (patch.inPointMs !== undefined && patch.inPointMs < 0) {
      throw new Error("inPointMs cannot be negative.");
    }
    const prospective =
      patch.durationMs !== undefined && !isGroupClip(clip)
        ? trimSourceBounded(
            clip,
            patch.durationMs - clip.durationMs,
            maxSourceMs
          )
        : clip;
    const sourceIn = patch.inPointMs ?? prospective.inPointMs ?? 0;
    const sourceOut = patch.outPointMs ?? prospective.outPointMs;
    if (sourceOut !== undefined && sourceOut <= sourceIn) {
      throw new Error("outPointMs must be greater than inPointMs.");
    }
    if (
      maxSourceMs !== undefined &&
      patch.outPointMs !== undefined &&
      patch.outPointMs > maxSourceMs
    ) {
      throw new Error(
        `outPointMs ${patch.outPointMs} is past the end of the source (${maxSourceMs}ms).`
      );
    }
    if (
      isGroupClip(clip) &&
      (patch.inPointMs !== undefined || patch.outPointMs !== undefined)
    ) {
      throw new Error(
        "Groups carry no source media; trim their duration instead."
      );
    }
    const targets = this.editTargets(clip);
    if (
      targets.length > 1 &&
      patch.durationMs !== undefined &&
      !isGroupClip(clip)
    ) {
      const delta = patch.durationMs - clip.durationMs;
      const trimmedTargets = targets.map((target) => {
        if (target.durationMs + delta <= 0) {
          throw new Error(
            "Linked trim would remove a clip. Shorten the trim or unlink it first."
          );
        }
        const trimmed =
          target.id === clip.id
            ? trimSourceBounded(target, delta, maxSourceMs)
            : trimClip(target, "end", delta);
        if (target.id === clip.id) {
          if (patch.inPointMs !== undefined) {
            trimmed.inPointMs = patch.inPointMs;
          }
          if (patch.outPointMs !== undefined) {
            trimmed.outPointMs = patch.outPointMs;
          }
        }
        return { target, trimmed };
      });
      for (const { target, trimmed } of trimmedTargets) {
        this.replaceClip(target, trimmed);
        this.mediaTracks = resliceTracksForTrimmedClip(
          this.mediaTracks,
          trimmed
        );
        this.touch(trimmed.id);
      }
      return this.resolveClip(clip.id);
    }
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
      for (const target of targets) {
        const trimmed = this.resolveClip(target.id);
        this.mediaTracks = resliceTracksForTrimmedClip(
          this.mediaTracks,
          trimmed
        );
        this.touch(trimmed.id);
      }
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
        trimSourceBounded(clip, patch.durationMs - clip.durationMs, maxSourceMs)
      );
    }
    if (patch.inPointMs !== undefined) {
      next.inPointMs = patch.inPointMs;
    }
    if (patch.outPointMs !== undefined) {
      next.outPointMs = patch.outPointMs;
    }
    if (
      patch.durationMs !== undefined ||
      patch.inPointMs !== undefined ||
      patch.outPointMs !== undefined
    ) {
      this.touch(next.id);
    }
    this.mediaTracks = resliceTracksForTrimmedClip(this.mediaTracks, next);
    return next;
  }

  /** The body of `move_clip`, shared with `set_clip_params`. */
  applyMove(
    clip: TimelineClip,
    patch: { startMs?: number; trackId?: string }
  ): TimelineClip {
    if (patch.startMs === undefined && patch.trackId === undefined) {
      return clip;
    }
    const targets = this.editTargets(clip);
    // The destination is checked before anything moves, so a refused track
    // leaves the clip and its partners where they were.
    let destination: TimelineTrack | undefined;
    if (patch.trackId !== undefined) {
      destination = this.resolveTrack(patch.trackId);
      this.assertWritable([], destination.id);
      if (!clipFitsTrack(clip.mediaType, destination.type)) {
        throw new Error(
          `Clip "${clip.name}" is a ${clip.mediaType} clip and cannot go on ${destination.type} track "${destination.name}".`
        );
      }
    }
    if (
      targets.length > 1 &&
      patch.startMs !== undefined &&
      !isGroupClip(clip)
    ) {
      const minimum = Math.min(...targets.map((target) => target.startMs));
      const delta = Math.max(-minimum, patch.startMs - clip.startMs);
      for (const target of targets) {
        target.startMs += delta;
        this.touch(target.id);
      }
      if (destination) {
        clip.trackId = destination.id;
      }
      return clip;
    }
    // Moving a group moves what it holds by the same delta (D4). Children keep
    // their own tracks, so their z-order is untouched (I9) — only the group
    // itself takes a new `trackId`.
    let moved = clip;
    if (isGroupClip(clip) && patch.startMs !== undefined) {
      const nextStartMs = Math.max(0, patch.startMs);
      this.clips = moveGroup(this.clips, clip.id, nextStartMs - clip.startMs);
      moved = this.clips.find((c) => c.id === clip.id)!;
      this.touch(...targets.map((target) => target.id));
    } else if (patch.startMs !== undefined) {
      clip.startMs = Math.max(0, patch.startMs);
    }
    if (destination) {
      moved.trackId = destination.id;
    }
    if (patch.startMs !== undefined || patch.trackId !== undefined) {
      this.touch(moved.id);
    }
    return moved;
  }

  /** Resolve a marker by id, or by case-insensitive label. */
  resolveMarker(target: string): TimelineMarker {
    const byId = this.state.markers.find((m) => m.id === target);
    if (byId) {
      return byId;
    }
    const prefix = resolveShortId(this.state.markers, target, "marker");
    if (prefix) {
      return prefix;
    }
    const lower = target.toLowerCase();
    const byLabel = this.state.markers.find(
      (m) => m.label.toLowerCase() === lower
    );
    if (byLabel) {
      return byLabel;
    }
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
        if (!resolved.includes(clip)) {
          resolved.push(clip);
        }
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

/**
 * `trimClip` on the end edge, capped at the source length when one is known.
 * The refusal names the limit, which the engine's own message does not.
 */
function trimSourceBounded(
  clip: TimelineClip,
  deltaMs: number,
  maxSourceMs: number | undefined
): TimelineClip {
  try {
    return trimClip(clip, "end", deltaMs, maxSourceMs);
  } catch (error) {
    if (
      maxSourceMs !== undefined &&
      error instanceof Error &&
      error.message.includes("beyond source out-point")
    ) {
      throw new Error(
        `Clip "${clip.name}" cannot be longer than its source: the source ends at ${maxSourceMs}ms.`
      );
    }
    throw error;
  }
}

function rejectUnknownClipParams(patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if (CLIP_PARAM_KEYS.includes(key)) {
      continue;
    }
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
  if (!input.custom) {
    return input;
  }
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
  if (!stagger || clip.mediaType !== "text") {
    return 0;
  }
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
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    curves = normalized.curves;
    maskInput = input.mask;
  } else {
    const bake = scope.ctx.bakeAnimation;
    if (!bake) {
      throw new Error(
        "This surface cannot run `code`: no animation baker is wired to it. Pass `curves` instead, or use edit_timeline to bake the body."
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
    if (!normalized.ok) {
      throw new Error(normalized.error);
    }
    curves = normalized.curves;
    maskInput = baked.mask ?? input.mask;
  }

  const mask = resolveCustomMask(curves, maskInput);
  if (!mask.ok) {
    throw new Error(mask.error);
  }

  const custom: CustomClipAnimation = {
    curves,
    bakedAt: (scope.ctx.now ?? (() => new Date().toISOString()))()
  };
  if (hasCode) {
    custom.code = code;
  }
  if (mask.mask) {
    custom.mask = mask.mask;
  }

  return {
    id: scope.ctx.newId("anim"),
    role: input.role,
    enabled: input.enabled,
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
async function runOp(
  scope: OpScope,
  op: TimelineOp
): Promise<TimelineOpResult> {
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
        tempo: state.tempo,
        tracks: scope.tracks.map((t) => scope.trackOut(t)),
        clips: scope.clips.map((c) => scope.clipOut(c)),
        mediaTracks: scope.mediaTracks.map(serializeMediaTrack),
        markers: state.markers.map((m) => ({ ...m }))
      };
    }

    case "add_track":
    case "move_track":
    case "delete_track":
      return runTrackOp(scope, op);

    case "add_text_clip": {
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay", "Text");
      // `style` wins over a top-level twin: a caller that sent both meant the
      // bag it named.
      scope.assertPictureTrack(track);
      scope.assertWritable([], track.id);
      const s = { ...(op.loose ?? {}), ...(op.style ?? {}) };
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.name ?? op.text,
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs: op.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS,
        mediaType: "text",
        sourceType: "imported",
        status: "generated",
        textStyle: textStyleWithDefaults(op.text, s)
      });
      if (op.opacity !== undefined) {
        clip.opacity = op.opacity;
      }
      if (op.transform) {
        clip.transform = mergeClipTransform(clip.transform, op.transform);
      }
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
      const mediaType =
        found.contentType.toLowerCase().startsWith("model/") ||
        /\.(glb|gltf)$/i.test(found.name)
          ? "model3d"
          : mediaTypeForContentType(found.contentType);
      if (!mediaType) {
        throw new Error(
          `Asset "${found.name}" is ${found.contentType}, which is not video, image, or audio and cannot go on a timeline.`
        );
      }
      if (
        mediaType !== "image" &&
        mediaType !== "model3d" &&
        op.durationMs === undefined &&
        !found.durationMs &&
        !scope.ctx.allowUnknownMediaDuration
      ) {
        throw new Error(
          `Asset "${found.name}" has no known duration. Supply durationMs or import media that can be probed.`
        );
      }
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack(
            mediaType === "model3d" ? "video" : trackTypeForMediaType(mediaType)
          );
      if (!clipFitsTrack(mediaType, track.type)) {
        throw new Error(
          `Asset "${found.name}" is not compatible with ${track.type} track "${track.name}".`
        );
      }
      scope.assertWritable([], track.id);
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
      if (mediaType === "model3d") {
        init.model3dStyle = model3dStyleWithPatch(undefined, undefined);
      }
      if (found.thumbnailAssetId) {
        init.thumbnailAssetId = found.thumbnailAssetId;
      }
      const clip = makeClip(init);
      if (op.transform) {
        clip.transform = mergeClipTransform(clip.transform, op.transform);
      }
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "add_shape_clip": {
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay", "Shapes");
      scope.assertPictureTrack(track);
      scope.assertWritable([], track.id);
      const shapeArg = resolveShapeArg(op.shape, op.shapeStyle, op.loose ?? {});
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: op.name ?? capitalize(shapeArg.kind),
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs: op.durationMs ?? DEFAULT_TEXT_CLIP_DURATION_MS,
        mediaType: "shape",
        sourceType: "imported",
        status: "generated",
        shapeStyle: shapeStyleWithDefaults(shapeArg)
      });
      if (op.opacity !== undefined) {
        clip.opacity = op.opacity;
      }
      if (op.transform) {
        clip.transform = mergeClipTransform(clip.transform, op.transform);
      }
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "add_model3d_clip": {
      const assetId = op.assetId.trim();
      if (!assetId) {
        throw new Error(
          "add_model3d_clip needs the glTF's asset id — a 3D clip draws its " +
            "asset the way an image clip draws its image. list_assets prints " +
            "the ids."
        );
      }
      // 3D is picture (D1), so it lands where a title lands: the first overlay
      // track, or one made for it.
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay", "3D");
      scope.assertPictureTrack(track);
      scope.assertWritable([], track.id);
      // The id is stored on the clip and read back by every renderer, so a
      // short or `asset://` form resolves to the asset's full id here. A
      // 12-character prefix nothing resolves would store a dangling id.
      const found = await scope.ctx.resolveAsset?.(assetId);
      if (!found && isShortResourceId(assetId)) {
        throw new Error(
          `No asset found for "${assetId}". Pass the glTF's asset id from list_assets.`
        );
      }
      const currentAssetId = found?.id ?? assetId;
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name: DEFAULT_MODEL3D_CLIP_NAME,
        startMs: op.startMs ?? scope.trackEndMs(track.id),
        durationMs: op.durationMs ?? DEFAULT_MODEL3D_CLIP_DURATION_MS,
        mediaType: "model3d",
        sourceType: "imported",
        status: "generated",
        currentAssetId,
        model3dStyle: model3dStyleWithPatch(undefined, op.style)
      });
      if (op.transform) {
        clip.transform = mergeClipTransform(clip.transform, op.transform);
      }
      scope.clips.push(clip);
      state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_model3d_style": {
      const clip = scope.resolveClip(op.target);
      if (clip.mediaType !== "model3d") {
        throw new Error(
          `Clip "${clip.name}" is a ${clip.mediaType} clip, not a 3D clip — ` +
            "model3dStyle names a camera, an animation and lighting for a " +
            "glTF, and nothing else reads it."
        );
      }
      clip.model3dStyle = model3dStyleWithPatch(clip.model3dStyle, op.patch);
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "bake_model3d_clip": {
      const clip = scope.resolveClip(op.target);
      if (clip.mediaType !== "model3d") {
        throw new Error(
          `Clip "${clip.name}" is a ${clip.mediaType} clip, not a 3D clip — ` +
            "only a 3D clip has a camera, lighting and a glTF to render."
        );
      }
      const style = clip.model3dStyle;
      if (!style) {
        throw new Error(
          `Clip "${clip.name}" has no model3dStyle, so nothing names the ` +
            "camera, lighting or animation a bake would render."
        );
      }
      if (!clip.currentAssetId) {
        throw new Error(
          `Clip "${clip.name}" has no glTF asset to bake — a 3D clip draws ` +
            "its asset the way an image clip draws its image."
        );
      }
      const sequence = {
        fps: state.fps,
        width: state.width,
        height: state.height
      };
      const dependencyHash = computeModel3DBakeHash(clip, sequence);
      if (!scope.ctx.bakeModel3DClip) {
        return {
          ok: true,
          clip: scope.clipOut(clip),
          bakeStarted: false,
          note: "This surface has no Blender renderer, so nothing was baked."
        };
      }
      const baked = await scope.ctx.bakeModel3DClip({
        clip,
        sequence,
        dependencyHash
      });
      const now = (scope.ctx.now ?? (() => new Date().toISOString()))();
      clip.model3dStyle = {
        ...style,
        bake: { assetId: baked.assetId, dependencyHash }
      };
      // The bake joins the clip's own version history, so an earlier one can
      // be restored the way an earlier generation can.
      clip.versions = [
        ...(clip.versions ?? []),
        makeClipVersion({
          id: scope.ctx.newId("version"),
          createdAt: now,
          workflowUpdatedAt: now,
          jobId: baked.jobId ?? "",
          assetId: baked.assetId,
          dependencyHash
        })
      ];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip), bakeStarted: true };
    }

    case "add_group": {
      // Resolve every child before anything is written: a half-applied group
      // leaves the caller with an empty group and no idea which of its clips
      // moved.
      const targets = (op.children ?? []).map((ref) => scope.resolveClip(ref));
      const track = op.trackId
        ? scope.resolveTrack(op.trackId)
        : scope.findOrCreateTrack("overlay", "Groups");
      scope.assertWritable(targets, track.id);
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
      if (op.transform) {
        group.transform = mergeClipTransform(group.transform, op.transform);
      }
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
          : scope.findOrCreateTrack("video");
      if (!clipFitsTrack(mediaType, track.type)) {
        throw new Error(
          `A ${op.kind} clip is ${mediaType} and cannot go on ${track.type} track "${track.name}".`
        );
      }
      scope.assertWritable([], track.id);

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
      if (at <= clip.startMs || at >= clip.startMs + clip.durationMs) {
        throw new Error(`Split time ${at}ms is outside clip "${clip.name}".`);
      }
      const targets = scope
        .editTargets(clip)
        .filter(
          (target) =>
            at > target.startMs && at < target.startMs + target.durationMs
        );
      const leftLink = targets.length > 1 ? scope.ctx.newId("link") : undefined;
      const rightLink =
        targets.length > 1 ? scope.ctx.newId("link") : undefined;
      const halves: TimelineClip[] = [];
      for (const target of targets) {
        const [left, right] = splitClip(target, at);
        left.id = scope.ctx.newId("clip");
        right.id = scope.ctx.newId("clip");
        if (targets.length > 1) {
          left.linkId = leftLink;
          right.linkId = rightLink;
        }
        const idx = scope.clips.findIndex((c) => c.id === target.id);
        scope.clips.splice(idx, 1, left, right);
        state.selectedClipIds = state.selectedClipIds.filter(
          (id) => id !== target.id
        );
        scope.touch(target.id, left.id, right.id);
        scope.mediaTracks = resliceTracksForSplitClip(
          scope.mediaTracks,
          target.id,
          left,
          right,
          () => scope.ctx.newId("track")
        );
        halves.push(left, right);
      }
      return { ok: true, clips: halves.map((half) => scope.clipOut(half)) };
    }

    case "trim_clip": {
      const clip = scope.resolveClip(op.target);
      const trimmed = scope.applyTrim(
        clip,
        {
          durationMs: op.durationMs,
          inPointMs: op.inPointMs,
          outPointMs: op.outPointMs
        },
        await scope.sourceLimitMs(clip)
      );
      scope.mediaTracks = resliceTracksForTrimmedClip(
        scope.mediaTracks,
        trimmed
      );
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
      scope.editTargets(clip);
      // Deleting a group deletes the parent, not the picture: its children stay
      // where they are and stop inheriting (D4). Leaving them with a `parentId`
      // nothing answers is what the validator calls a dangling parent.
      const wasChild = scope.clips
        .filter((c) => c.parentId === clip.id)
        .map((c) => c.id);
      const remaining = isGroupClip(clip)
        ? ungroup(scope.clips, clip.id)
        : scope.clips;
      const out = scope.clipOut(clip);
      scope.clips = remaining.filter((c) => c.id !== clip.id);
      if (clip.linkId) {
        const remainingLinked = scope.clips.filter(
          (candidate) => candidate.linkId === clip.linkId
        );
        if (remainingLinked.length === 1) {
          delete remainingLinked[0].linkId;
          scope.touch(remainingLinked[0].id);
        }
      }
      state.selectedClipIds = state.selectedClipIds.filter(
        (id) => id !== clip.id
      );
      scope.touch(clip.id, ...wasChild);
      return { ok: true, deleted: out };
    }

    case "duplicate_clip": {
      const src = scope.resolveClip(op.target);
      const offsetMs = src.durationMs + (op.gapMs ?? 0);
      if (!Number.isFinite(offsetMs) || src.startMs + offsetMs < 0) {
        throw new Error(
          `gapMs ${op.gapMs} would place the copy of "${src.name}" before zero.`
        );
      }
      // A group's copy carries copies of what it holds, at the same offset, so
      // the duplicate draws what the original draws.
      const descendants = isGroupClip(src)
        ? groupDescendantIds(scope.clips, src.id)
        : new Set<string>();
      const sources = [
        src,
        ...scope.clips.filter((clip) => descendants.has(clip.id))
      ];
      for (const clip of sources) {
        scope.assertWritable([], clip.trackId);
      }
      const freshIds = new Map(
        sources.map((clip) => [clip.id, scope.ctx.newId("clip")])
      );
      // A link whose members are all copied stays a link among the copies,
      // under a fresh id; a lone half is copied unlinked.
      const linkCounts = new Map<string, number>();
      for (const clip of sources) {
        if (clip.linkId !== undefined && clip.id !== src.id) {
          linkCounts.set(clip.linkId, (linkCounts.get(clip.linkId) ?? 0) + 1);
        }
      }
      const freshLinks = new Map<string, string>();
      const copies = sources.map((clip) => {
        const copy = structuredClone(clip);
        copy.id = freshIds.get(clip.id)!;
        copy.startMs += offsetMs;
        copy.locked = false;
        if (copy.parentId !== undefined && clip.id !== src.id) {
          copy.parentId = freshIds.get(copy.parentId) ?? copy.parentId;
        }
        const linkId = clip.linkId;
        if (
          linkId !== undefined &&
          clip.id !== src.id &&
          (linkCounts.get(linkId) ?? 0) >= 2
        ) {
          let fresh = freshLinks.get(linkId);
          if (fresh === undefined) {
            fresh = scope.ctx.newId("link");
            freshLinks.set(linkId, fresh);
          }
          copy.linkId = fresh;
        } else {
          delete copy.linkId;
        }
        // A generated clip's copy is a variation to regenerate, so it starts
        // as a draft. Imported media keeps its asset and draws the same frames.
        if (clip.sourceType === "generated") {
          copy.status = "draft";
          copy.versions = [];
          delete copy.currentAssetId;
          delete copy.lastGeneratedHash;
          delete copy.activeTakeId;
        }
        copy.animations = copy.animations?.map((animation) => ({
          ...animation,
          id: scope.ctx.newId("anim")
        }));
        return copy;
      });
      scope.clips.push(...copies);
      scope.touch(...copies.map((copy) => copy.id));
      const result: TimelineOpResult = {
        ok: true,
        clip: scope.clipOut(copies[0]!)
      };
      if (copies.length > 1) {
        result.children = copies.slice(1).map((copy) => copy.id);
      }
      return result;
    }

    case "set_clip_params": {
      let clip = scope.resolveClip(op.target);
      const patch = { ...op.patch };
      rejectUnknownClipParams(patch);
      // Timing belongs to move_clip and trim_clip, but a caller sending it here
      // means one edit either way — so apply it through the same code rather
      // than dropping it or making them call twice.
      clip = scope.applyTrim(
        clip,
        {
          durationMs: patch.durationMs,
          inPointMs: patch.inPointMs,
          outPointMs: patch.outPointMs
        },
        patch.durationMs === undefined && patch.outPointMs === undefined
          ? undefined
          : await scope.sourceLimitMs(clip)
      );
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
      if (patch.name !== undefined) {
        clip.name = patch.name;
      }
      if (patch.opacity !== undefined) {
        clip.opacity = patch.opacity;
      }
      if (patch.transform !== undefined) {
        clip.transform = mergeClipTransform(clip.transform, patch.transform);
      }
      if (patch.speedMultiplier !== undefined) {
        clip.speedMultiplier = patch.speedMultiplier;
      }
      if (patch.volumeDb !== undefined) {
        clip.volumeDb = patch.volumeDb;
      }
      if (patch.fadeInMs !== undefined) {
        clip.fadeInMs = patch.fadeInMs;
      }
      if (patch.fadeOutMs !== undefined) {
        clip.fadeOutMs = patch.fadeOutMs;
      }
      if (patch.fadeInShape !== undefined) {
        clip.fadeInShape = patch.fadeInShape;
      }
      if (patch.fadeOutShape !== undefined) {
        clip.fadeOutShape = patch.fadeOutShape;
      }
      if (patch.blendMode !== undefined) {
        clip.blendMode = patch.blendMode as TimelineClip["blendMode"];
      }
      if (patch.borderRadius !== undefined) {
        clip.borderRadius = patch.borderRadius;
      }
      if (patch.crop !== undefined) {
        // Null is how a caller puts the whole source back; leaving the field
        // with all-zero insets would store a crop that means nothing.
        if (patch.crop === null) {
          delete clip.crop;
        } else {
          if (!isCropUsable(patch.crop)) {
            throw new Error(
              `Crop on clip "${clip.name}" keeps no picture: left + right and ` +
                "top + bottom must each stay below 1."
            );
          }
          clip.crop = patch.crop;
        }
      }
      if (patch.hidden !== undefined) {
        clip.hidden = patch.hidden;
      }
      if (patch.muted !== undefined) {
        clip.muted = patch.muted;
      }
      if (patch.locked !== undefined) {
        clip.locked = patch.locked;
      }
      if (patch.textStyle !== undefined) {
        const parsed = textStyleParams.safeParse({
          color: DEFAULT_TEXT_CLIP_COLOR,
          ...clip.textStyle,
          ...patch.textStyle
        });
        if (!parsed.success) {
          throw new Error(
            `Clip "${clip.name}" has no text style yet, so this patch still needs ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}.`
          );
        }
        assertAuthorableFontFamily(parsed.data.fontFamily);
        clip.textStyle = parsed.data;
      }
      if (patch.shapeStyle !== undefined) {
        clip.shapeStyle = shapeStyleWithDefaults(patch.shapeStyle);
      }
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
      scope.assertWritable([clip]);
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

    case "apply_transition_at_cut": {
      const planned = planTransitionAtCut(scope.clips, op);
      if (!planned.ok) {
        throw new Error(planned.error);
      }
      const applied = applyTransitionAtCutCandidate(
        scope.clips,
        planned.candidate
      );
      if (!applied.ok) {
        throw new Error(applied.error);
      }
      scope.clips = applied.clips;
      scope.touch(
        planned.candidate.outgoingClipId,
        planned.candidate.incomingClipId
      );
      return {
        ok: true,
        candidate: planned.candidate,
        operation: planned.candidate.operation,
        description: applied.description
      };
    }

    case "set_mask": {
      const clip = scope.resolveClip(op.target);
      if (op.mask === null) {
        delete clip.mask;
      } else {
        if (op.mask.kind === "path" && !op.mask.d?.trim()) {
          throw new Error("A path mask needs `d` with SVG path data.");
        }
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
      if (op.matte.invert !== undefined) {
        matteOut.invert = op.matte.invert;
      }
      clip.matte = matteOut;
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_generated_matte": {
      const clip = scope.resolveClip(op.target);
      scope.touch(clip.id);
      if (op.clear === true) {
        delete clip.generatedMatte;
        return { ok: true, clip: scope.clipOut(clip), generatedMatte: null };
      }
      if (!clip.generatedMatte) {
        throw new Error(
          `"${clip.name}" carries no generated matte. Run isolate_subject on ` +
            "it first; this op only adjusts one that exists."
        );
      }
      if (op.selectVersionAssetId !== undefined) {
        clip.generatedMatte = selectGeneratedMatteVersion(
          clip,
          op.selectVersionAssetId
        ).generatedMatte;
      }
      // The knobs are the user's, so an absent field leaves the stored value
      // alone rather than resetting it to a default the caller did not name.
      const matte = clip.generatedMatte!;
      if (op.invert !== undefined) {
        matte.invert = op.invert;
      }
      if (op.strength !== undefined) {
        matte.strength = Math.min(1, Math.max(0, op.strength));
      }
      if (op.featherPx !== undefined) {
        matte.featherPx = Math.max(0, op.featherPx);
      }
      return { ok: true, clip: scope.clipOut(clip), generatedMatte: matte };
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
      if (op.prompt !== undefined) {
        clip.prompt = op.prompt;
      }
      if (op.negativePrompt !== undefined) {
        clip.negativePrompt = op.negativePrompt;
      }
      if (op.provider !== undefined) {
        clip.provider = op.provider;
      }
      if (op.model !== undefined) {
        clip.model = op.model;
      }
      if (op.voice !== undefined) {
        clip.voice = op.voice;
      }
      if (op.width !== undefined) {
        clip.width = op.width;
      }
      if (op.height !== undefined) {
        clip.height = op.height;
      }
      if (op.aspectRatio !== undefined) {
        clip.aspectRatio = op.aspectRatio;
      }
      if (op.resolution !== undefined) {
        clip.resolution = op.resolution;
      }
      if (op.strength !== undefined) {
        clip.strength = op.strength;
      }
      if (op.numInferenceSteps !== undefined) {
        clip.numInferenceSteps = op.numInferenceSteps;
      }
      if (op.seed !== undefined) {
        clip.seed = op.seed;
      }
      const bindingChanged = Object.keys(op).some(
        (key) =>
          key !== "op" &&
          key !== "target" &&
          key !== "regenerate" &&
          op[key as keyof typeof op] !== undefined
      );
      if (bindingChanged && (clip.lastGeneratedHash || clip.currentAssetId)) {
        clip.status = "stale";
      }
      scope.touch(clip.id);
      // No op starts a generation job: the browser runs one itself after this
      // edit lands. Marking the clip queued here would promise a job that no
      // runner on this surface will ever start.
      if (op.regenerate) {
        return {
          ok: true,
          clip: scope.clipOut(clip),
          regenerationStarted: false,
          note: "The binding was saved, but this surface cannot run generation jobs. Regenerate the clip from the timeline editor."
        };
      }
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "animate_clip": {
      const clip = scope.resolveClip(op.target);
      if (
        clip.mediaType !== "text" &&
        op.animations.some((input) => input.stagger !== undefined)
      ) {
        throw new Error(
          `Stagger applies only to text clips; "${clip.name}" is ${clip.mediaType}.`
        );
      }
      const built: ClipAnimation[] = [];
      for (const input of op.animations) {
        if (input.preset === CUSTOM_ANIMATION_PRESET_ID) {
          // `{preset: "custom", custom: {curves}}` reads as naturally as the
          // flat form, so lift it rather than refusing it.
          built.push(
            await buildCustomAnimation(scope, clip, liftCustom(input))
          );
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
        if (input.preset === "typewriter" && clip.mediaType !== "text") {
          throw new Error('Preset "typewriter" requires a text clip.');
        }
        const timing =
          input.preset === "typewriter"
            ? typewriterTiming(
                clip.textStyle?.text ?? "",
                clip.durationMs - (input.delayMs ?? 0),
                input.durationMs,
                input.stagger
              )
            : null;
        built.push({
          id: scope.ctx.newId("anim"),
          role: input.role,
          enabled: input.enabled,
          preset: input.preset,
          durationMs:
            timing?.durationMs ?? input.durationMs ?? preset.defaultDurationMs,
          delayMs: input.delayMs,
          easing: input.easing,
          params: input.params,
          stagger: timing?.stagger ?? input.stagger,
          caret: input.preset === "typewriter" ? input.caret : undefined
        });
      }
      clip.animations =
        op.mode === "add" ? [...(clip.animations ?? []), ...built] : built;
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }

    case "set_baked_animation": {
      const clip = scope.resolveClip(op.target);
      const outcome = buildBakedAnimation(clip, op.animation, () =>
        scope.ctx.newId("anim")
      );
      clip.animations = outcome.animations;
      scope.touch(clip.id);
      return {
        ok: true,
        clip: scope.clipOut(clip),
        animationId: outcome.animationId,
        keyframeCount:
          outcome.animation.custom?.curves[0]?.keyframes.length ?? 0,
        replaced: outcome.replaced
      };
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
      if (op.color !== undefined) {
        marker.color = op.color;
      }
      if (op.note !== undefined) {
        marker.note = op.note;
      }
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
        op.targets === undefined || op.targets === "all"
          ? undefined
          : op.targets;
      const resolved = scope.resolveSnapTargets(named);
      const missing = resolved.missing;
      // Each clip is snapped through move/trim, which carry a group's children
      // and a link's partners. Snapping those as well would move them again,
      // so one root per group and per link is snapped and the rest follow it.
      const targetedIds = new Set(resolved.clips.map((clip) => clip.id));
      const parentOf = new Map(
        scope.clips.map((clip) => [clip.id, clip.parentId])
      );
      const followLinks = scope.ctx.followLinks !== false;
      const seenLinks = new Set<string>();
      const targeted = resolved.clips.filter((clip) => {
        const visited = new Set<string>();
        let parentId = clip.parentId;
        while (parentId !== undefined && !visited.has(parentId)) {
          if (targetedIds.has(parentId)) {
            return false;
          }
          visited.add(parentId);
          parentId = parentOf.get(parentId);
        }
        if (followLinks && clip.linkId !== undefined) {
          if (seenLinks.has(clip.linkId)) {
            return false;
          }
          seenLinks.add(clip.linkId);
        }
        return true;
      });

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
      if (op.tolerance_ms !== undefined) {
        options.toleranceMs = op.tolerance_ms;
      }
      if (op.mode !== undefined) {
        options.mode = op.mode;
      }
      if (op.action !== undefined) {
        options.action = op.action;
      }

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
              const trimmed = scope.applyTrim(clip, {
                durationMs: entry.after.durationMs
              });
              scope.applyMove(trimmed, { startMs: entry.after.startMs });
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
        snapped: reported.filter((entry) => entry.snapped).length,
        skipped: reported.filter((entry) => !entry.snapped).length,
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
          (t) => t.type === "overlay" && t.name === name && !t.locked
        );
        mapped.set(name, (existing ?? scope.addTrack("overlay", name)).id);
      }

      // The group draws nothing, but it still occupies its track's timeline,
      // and a group sharing a track with one of its children reads as an
      // overlap. It gets a track named after the composition instead.
      const groupTrack = op.trackId
        ? scope.resolveTrack(op.trackId)
        : (scope.tracks.find(
            (t) =>
              t.type === "overlay" && t.name === composition.name && !t.locked
          ) ?? scope.addTrack("overlay", composition.name));
      scope.assertWritable([], groupTrack.id);
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

    case "list_takes": {
      const clip = scope.resolveClip(op.target);
      const versions = clip.versions ?? [];
      const activeId = activeTakeIdOf(clip);
      return {
        ok: true,
        takes: versions.map((v) => ({
          id: v.id,
          label: v.label,
          source: v.source,
          provider: v.provider,
          model: v.model,
          createdAt: v.createdAt,
          costCredits: v.costCredits,
          durationMs: v.durationMs,
          status: v.status,
          favorite: v.favorite,
          active: v.id === activeId
        })),
        activeTakeId: activeId ?? null
      };
    }

    case "select_take": {
      const clip = scope.resolveClip(op.target);
      scope.assertWritable([clip]);
      if (clip.mediaType === "model3d") {
        throw new Error(
          `Clip "${clip.name}" is a 3D clip — its version history includes ` +
            "bake renders that must not replace the glTF source. Take " +
            "selection is not available for model3d clips yet."
        );
      }
      const version = findByIdOrShortId(clip.versions ?? [], op.takeId, "take");
      if (!version) {
        throw new Error(
          `No take "${op.takeId}" on "${clip.name}". ${scope.validUnits(
            (clip.versions ?? []).map((v) => ({
              id: v.id,
              name: v.label ?? v.id
            })),
            "take"
          )}`
        );
      }
      if (version.status !== "success") {
        throw new Error(
          `Take "${op.takeId}" on "${clip.name}" did not finish successfully ` +
            `(status: ${version.status}) — only a successful take can be selected.`
        );
      }
      const next = selectTake(clip, version.id);
      scope.clips = scope.clips.map((c) => (c.id === clip.id ? next : c));
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }

    case "rename_take": {
      const clip = scope.resolveClip(op.target);
      scope.assertWritable([clip]);
      const take = findByIdOrShortId(clip.versions ?? [], op.takeId, "take");
      if (!take) {
        throw new Error(
          `No take "${op.takeId}" on "${clip.name}". ${scope.validUnits(
            (clip.versions ?? []).map((v) => ({
              id: v.id,
              name: v.label ?? v.id
            })),
            "take"
          )}`
        );
      }
      const next = renameTakeOnClip(clip, take.id, op.label);
      scope.clips = scope.clips.map((c) => (c.id === clip.id ? next : c));
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }

    case "delete_take": {
      const clip = scope.resolveClip(op.target);
      scope.assertWritable([clip]);
      const take = findByIdOrShortId(clip.versions ?? [], op.takeId, "take");
      const { clip: next, error } = deleteTakeOnClip(
        clip,
        take?.id ?? op.takeId
      );
      if (error) {
        throw new Error(error);
      }
      scope.clips = scope.clips.map((c) => (c.id === clip.id ? next : c));
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }

    // Subject/object tracks (P0 AI Video, Phase 2). The async provider call
    // that fills a track's samples is the `track_object` capability, not an
    // op — these four are the structural/synchronous surface over it.
    case "list_tracks": {
      const clipId = op.target ? scope.resolveClip(op.target).id : undefined;
      const tracks = scope.mediaTracks.filter(
        (t) => clipId === undefined || t.clipId === clipId
      );
      return {
        ok: true,
        tracks: tracks.map((t) => ({
          id: t.id,
          clipId: t.clipId,
          name: t.name,
          kind: t.kind,
          status: t.status,
          sourceStartMs: t.sourceStartMs,
          sourceEndMs: t.sourceEndMs,
          sampleCount: t.samples.length,
          confidence: t.confidence
        }))
      };
    }

    case "delete_track_object": {
      const track = findByIdOrShortId(scope.mediaTracks, op.trackId, "track");
      if (!track) {
        throw new Error(
          `No track "${op.trackId}". ${scope.validUnits(
            scope.mediaTracks.map((t) => ({ id: t.id, name: t.name })),
            "track"
          )}`
        );
      }
      scope.mediaTracks = scope.mediaTracks.filter((t) => t.id !== track.id);
      const unboundClipIds: string[] = [];
      scope.clips = scope.clips.map((c) => {
        if (c.trackBinding?.trackId !== track.id) {
          return c;
        }
        unboundClipIds.push(c.id);
        const { trackBinding: _dropped, ...rest } = c;
        return rest;
      });
      scope.touch(...unboundClipIds);
      return { ok: true, deleted: { id: track.id, name: track.name } };
    }

    case "bind_to_track": {
      const clip = scope.resolveClip(op.target);
      const track = findByIdOrShortId(scope.mediaTracks, op.trackId, "track");
      if (!track) {
        throw new Error(
          `No track "${op.trackId}". ${scope.validUnits(
            scope.mediaTracks.map((t) => ({ id: t.id, name: t.name })),
            "track"
          )}`
        );
      }
      if (op.mode !== "position" && op.mode !== "position_scale") {
        throw new Error(
          `bind_to_track mode "${op.mode}" is not implemented yet — only ` +
            `"position" and "position_scale" affect rendering in this build. ` +
            "The field accepts the other modes so a document can name the " +
            "intent without a schema migration later, but binding to one " +
            "today would be a no-op, so the call is refused instead."
        );
      }
      const binding: TrackBinding = { trackId: track.id, mode: op.mode };
      if (op.offset !== undefined) {
        binding.offset = op.offset;
      }
      if (op.scale !== undefined) {
        binding.scale = op.scale;
      }
      if (op.rotationOffset !== undefined) {
        binding.rotationOffset = op.rotationOffset;
      }
      if (op.smoothing !== undefined) {
        binding.smoothing = op.smoothing;
      }
      const next: TimelineClip = { ...clip, trackBinding: binding };
      scope.clips = scope.clips.map((c) => (c.id === clip.id ? next : c));
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }

    case "unbind_track": {
      const clip = scope.resolveClip(op.target);
      if (!clip.trackBinding) {
        return { ok: true, clip: scope.clipOut(clip) };
      }
      const { trackBinding: _dropped, ...next } = clip;
      scope.clips = scope.clips.map((c) => (c.id === clip.id ? next : c));
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }

    case "add_midi_clip": {
      const track = op.track
        ? scope.resolveMidiTrack(op.track)
        : scope.findOrCreateTrack("midi");
      scope.assertWritable([], track.id);
      const name = op.name ?? "Phrase";
      const clip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId: track.id,
        name,
        startMs: op.start_ms ?? scope.trackEndMs(track.id),
        durationMs: op.duration_ms,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        notes: scope.buildNotes(op.notes, name)
      });
      scope.clips.push(clip);
      scope.state.selectedClipIds = [clip.id];
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }
    case "set_notes": {
      const clip = scope.resolveMidiClip(op.clip);
      clip.notes = scope.buildNotes(op.notes, clip.name);
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }
    case "set_tempo": {
      const previous = resolveTempo(scope.state);
      const tempo = {
        bpm: op.bpm,
        offsetMs: op.offset_ms ?? previous.offsetMs,
        timeSignature: {
          beatsPerBar: op.beats_per_bar ?? previous.timeSignature.beatsPerBar,
          beatUnit: op.beat_unit ?? previous.timeSignature.beatUnit
        }
      };
      scope.clips = rescaleClipsForTempo(
        scope.clips,
        scope.tracks,
        previous,
        tempo
      );
      scope.state.tempo = tempo;
      const rescaledClipIds = scope.clips
        .filter((c) => c.mediaType === "midi")
        .map((c) => c.id);
      scope.touch(...rescaledClipIds);
      return { ok: true, tempo, previousTempo: previous, rescaledClipIds };
    }
    case "set_track_instrument": {
      const track = scope.resolveMidiTrack(op.track);
      let instrument: MidiInstrument;
      if ("preset" in op.instrument) {
        const preset = findInstrumentPreset(op.instrument.preset);
        if (!preset) {
          throw new Error(
            `No instrument preset named "${op.instrument.preset}". Valid presets: ${MIDI_INSTRUMENT_PRESETS.map((p) => `${p.id} ("${p.name}")`).join(", ")}.`
          );
        }
        instrument = structuredClone(preset.instrument);
      } else {
        instrument = structuredClone(op.instrument);
      }
      if (instrument.type === "sampler" && instrument.zones.length) {
        const resolveAsset = scope.ctx.resolveAsset;
        if (!resolveAsset) {
          throw new Error("Sample assets cannot be resolved on this host");
        }
        instrument.zones = await Promise.all(
          instrument.zones.map(async (zone) => {
            const asset = await resolveAsset(zone.assetId);
            if (!asset || !asset.contentType.startsWith("audio/")) {
              throw new Error(`Audio sample unavailable: ${zone.name}`);
            }
            return { ...zone, assetId: asset.id };
          })
        );
      }
      track.instrument = instrument;
      return { ok: true, track: scope.trackOut(track) };
    }
    case "transpose_clip":
    case "quantize_notes":
    case "scale_velocity": {
      const clip = scope.resolveMidiClip(op.clip);
      const before = clip.notes ?? [];
      const notes =
        op.op === "transpose_clip"
          ? transposeNotes(before, op.semitones)
          : op.op === "scale_velocity"
            ? scaleVelocity(before, op.factor)
            : quantizeNotes(before, {
                division: op.division,
                strength: op.strength,
                target: op.target
              });
      clip.notes = notes;
      scope.touch(clip.id);
      const result: TimelineOpResult = {
        ok: true,
        clip: scope.clipOut(clip),
        noteCount: notes.length
      };
      if (op.op === "quantize_notes") {
        result.movedNoteCount = notes.filter(
          (note, i) =>
            note.startTick !== before[i]?.startTick ||
            note.durationTick !== before[i]?.durationTick
        ).length;
      }
      return result;
    }
    case "set_reframe_subject": {
      const clip = scope.resolveClip(op.clip_id);
      const track = findByIdOrShortId(
        scope.mediaTracks.filter((t) => t.clipId === clip.id),
        op.track_id,
        "track"
      );
      if (!track) {
        throw new Error(
          `No track "${op.track_id}" belongs to clip "${clip.name}". ${scope.validUnits(
            scope.mediaTracks.filter((t) => t.clipId === clip.id),
            "track"
          )}`
        );
      }
      if (track.status !== "ready") {
        throw new Error(
          `Track "${track.name}" is ${track.status}; Smart Reframe can only follow a ready track.`
        );
      }
      if (!mediaTrackCanDriveReframe(track) || isMediaTrackStale(track, clip)) {
        throw new Error(
          `Track "${track.name}" has no current analysis for clip "${clip.name}".`
        );
      }
      const previous = clip.reframe ?? {
        mode: "track"
      };
      clip.reframe = {
        ...previous,
        mode: "track",
        trackId: track.id,
        sourceAssetId: clip.currentAssetId,
        safeMargin: op.safe_margin ?? previous.safeMargin,
        smoothing: op.smoothing ?? previous.smoothing
      };
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip) };
    }
    case "add_reframe_keyframe": {
      const clip = scope.resolveClip(op.clip_id);
      clip.reframe ??= { mode: "auto" };
      const keyframe = {
        sourceMs: op.source_ms,
        x: op.x,
        y: op.y,
        zoom: op.zoom
      };
      clip.reframe = addReframeKeyframe(clip.reframe, keyframe);
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(clip), keyframe };
    }
    case "clear_reframe": {
      const clip = scope.resolveClip(op.clip_id);
      const next = clearReframe(clip);
      scope.replaceClip(clip, next);
      scope.touch(clip.id);
      return { ok: true, clip: scope.clipOut(next) };
    }
    case "retarget_format": {
      // Keys and values may be short ids; the adaptation reads full ones.
      const trackIdByClipId: Record<string, string> = {};
      for (const [clipId, trackId] of Object.entries(op.track_ids ?? {})) {
        const clip = findByIdOrShortId(scope.clips, clipId, "clip");
        if (!clip) {
          throw new Error(
            `track_ids names unknown clip "${clipId}". ${scope.validUnits(scope.clips, "clip")}`
          );
        }
        const track = findByIdOrShortId(
          scope.mediaTracks.filter((t) => t.clipId === clip.id),
          trackId,
          "track"
        );
        if (!track) {
          throw new Error(
            `Track "${trackId}" does not belong to clip "${clip.name}". ${scope.validUnits(
              scope.mediaTracks.filter((t) => t.clipId === clip.id),
              "track"
            )}`
          );
        }
        if (track.status !== "ready") {
          throw new Error(
            `Track "${track.name}" is ${track.status}; a format adaptation can only follow a ready track.`
          );
        }
        trackIdByClipId[clip.id] = track.id;
      }
      const now = scope.ctx.now?.() ?? new Date().toISOString();
      const {
        selectedClipIds: _selected,
        playheadMs: _playhead,
        setup: _setup,
        ...document
      } = scope.state;
      const source: TimelineSequence = {
        ...document,
        id: scope.ctx.sequence?.id ?? "seq_eval",
        projectId: scope.ctx.sequence?.projectId ?? "",
        name: scope.ctx.sequence?.name ?? "Sequence",
        durationMs: scope.clips.reduce(
          (end, c) => Math.max(end, c.startMs + c.durationMs),
          0
        ),
        createdAt: now,
        updatedAt: now,
        camera2d: scope.state.camera2d ?? null
      };
      if (scope.state.setup) {
        source.setup = scope.state.setup;
      }
      const adapted = adaptSequenceFormat(source, op.aspect_ratio, {
        strategy: op.strategy,
        safeMargin: op.safe_margin,
        trackIdByClipId: op.track_ids ? trackIdByClipId : undefined
      });
      const stored = scope.ctx.retargetFormat
        ? await scope.ctx.retargetFormat(adapted.sequence)
        : { sequenceId: adapted.sequence.id, name: adapted.sequence.name };
      return {
        ok: true,
        sourceSequenceId: source.id,
        sequenceId: stored.sequenceId,
        name: stored.name ?? adapted.sequence.name,
        width: adapted.sequence.width,
        height: adapted.sequence.height,
        strategy: op.strategy,
        croppedClipIds: adapted.croppedClipIds
      };
    }
    case "stagger_animations": {
      const clips = op.clip_ids.map((id) => scope.resolveClip(id));
      const ids = clips.map((c) => c.id);
      if (new Set(ids).size !== ids.length) {
        throw new Error("clip_ids must contain distinct clip IDs.");
      }
      for (const clip of clips) {
        if (!clip.animations?.length) {
          throw new Error(`Clip "${clip.name}" has no animations to stagger.`);
        }
      }
      scope.clips = staggerClipAnimations(scope.clips, ids, op.offset_ms);
      scope.touch(...ids);
      return {
        ok: true,
        clips: ids.map((id) => scope.clipOut(scope.resolveClip(id)))
      };
    }
    case "set_setup": {
      const previous = scope.state.setup;
      scope.state.setup = {
        ...previous,
        stage: op.stage ?? previous?.stage ?? "idea",
        brief: op.brief ?? previous?.brief ?? "",
        format: op.format ?? previous?.format,
        voiceover: op.voiceover ?? previous?.voiceover,
        beats: previous?.beats
      };
      return { ok: true, setup: structuredClone(scope.state.setup) };
    }
    case "plan_beats": {
      if (!op.beats?.length) {
        throw new Error(
          "This surface has no Director: pass `beats` with the plan you want. Each beat needs a prompt and a durationMs."
        );
      }
      const beats = op.beats.map((beat) => ({
        id: scope.ctx.newId("beat"),
        prompt: beat.prompt,
        duration_ms: Math.max(1, Math.round(beat.durationMs)),
        transition: beat.transition,
        voiceover: beat.voiceover,
        music: beat.music
      }));
      const previous = scope.state.setup;
      scope.state.setup = {
        ...previous,
        stage: "review",
        brief: previous?.brief ?? "",
        format: previous?.format,
        voiceover: previous?.voiceover,
        beats
      };
      return {
        ok: true,
        beats: structuredClone(beats),
        clipsCreated: 0,
        jobsStarted: 0
      };
    }
    case "update_beat":
    case "remove_beat": {
      const beats = scope.state.setup?.beats ?? [];
      const found = resolveBeatTarget(beats, op.beat);
      const next = { ...found };
      if (op.op === "update_beat") {
        if (op.prompt !== undefined) {
          next.prompt = op.prompt;
        }
        if (op.durationMs !== undefined) {
          next.duration_ms = Math.max(1, Math.round(op.durationMs));
        }
        if (op.transition !== undefined) {
          next.transition = op.transition ?? undefined;
        }
        if (op.voiceover !== undefined) {
          next.voiceover = op.voiceover;
        }
        if (op.music !== undefined) {
          next.music = op.music;
        }
      }
      const previous = scope.state.setup;
      scope.state.setup = {
        ...previous,
        stage: previous?.stage ?? "review",
        brief: previous?.brief ?? "",
        format: previous?.format,
        voiceover: previous?.voiceover,
        beats:
          op.op === "remove_beat"
            ? beats.filter((b) => b.id !== found.id)
            : beats.map((b) => (b.id === found.id ? next : b))
      };
      return op.op === "remove_beat"
        ? { ok: true, removed: { ...found } }
        : { ok: true, beat: { ...next } };
    }
    case "generate_from_beats": {
      if (!scope.ctx.generateFromBeats) {
        throw new Error(
          "This surface cannot generate from beats: no generation host is wired."
        );
      }
      const outcome = await scope.ctx.generateFromBeats(scope.state, op);
      if (outcome.error) {
        throw new Error(outcome.error);
      }
      Object.assign(scope.state, outcome.state);
      scope.touch(...outcome.changedClipIds);
      return outcome.result;
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
    ...state,
    tempo: state.tempo,
    setup: state.setup ? structuredClone(state.setup) : state.setup,
    fps: state.fps,
    width: state.width,
    height: state.height,
    tracks: state.tracks.map((t) => structuredClone(t)),
    clips: state.clips.map((c) => structuredClone(c)),
    markers: state.markers.map((m) => structuredClone(m)),
    storyboardMaterializations: state.storyboardMaterializations?.map((entry) =>
      structuredClone(entry)
    ),
    mediaTracks: (state.mediaTracks ?? []).map((t) => structuredClone(t)),
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

export type TimelineTrackOp = Extract<
  TimelineOp,
  { op: "add_track" | "move_track" | "delete_track" }
>;

function serializeTracks(state: TimelineOpState) {
  const clipCount = new Map<string, number>();
  for (const clip of state.clips) {
    clipCount.set(clip.trackId, (clipCount.get(clip.trackId) ?? 0) + 1);
  }
  return state.tracks.map((track) =>
    serializeTrack(state, track, clipCount.get(track.id) ?? 0)
  );
}

function runTrackOp(scope: OpScope, op: TimelineTrackOp): TimelineOpResult {
  const state = scope.state;
  switch (op.op) {
    case "add_track": {
      const track = scope.addTrack(op.type, op.name);
      return { ok: true, track: scope.trackOut(track) };
    }

    case "move_track": {
      const { target, toIndex, before, after } = resolveMoveTrackArgs(op);
      const track = scope.resolveTrack(target);
      const destination: TrackDestination = {};
      if (toIndex !== undefined) {
        destination.toIndex = toIndex;
      }
      if (before !== undefined) {
        destination.beforeId = scope.resolveTrack(before).id;
      }
      if (after !== undefined) {
        destination.afterId = scope.resolveTrack(after).id;
      }
      const orderedIds = moveTrackOrder(scope.tracks, track.id, destination);
      const byId = new Map(scope.tracks.map((t) => [t.id, t]));
      // The array order is what `get_state` prints, so keep it and the indices
      // saying the same thing.
      scope.tracks.length = 0;
      orderedIds.forEach((id, i) => {
        const moved = byId.get(id);
        if (!moved) {
          throw new Error(`Track "${id}" no longer exists.`);
        }
        moved.index = i;
        scope.tracks.push(moved);
      });
      return {
        ok: true,
        track: scope.trackOut(track),
        tracks: serializeTracks(scope.state)
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
      const removed = new Set(removedClipIds);
      const kept = scope.clips.filter((c) => c.trackId !== track.id);
      scope.clips.length = 0;
      scope.clips.push(...kept);
      // A parent that went with the track would leave its children pointing at
      // a clip that no longer exists, which the validator reads as a broken
      // document rather than a deletion.
      for (const clip of scope.clips) {
        if (clip.parentId && removed.has(clip.parentId)) {
          delete clip.parentId;
          scope.touch(clip.id);
        }
      }
      // A link left with one member is no link, the rule delete_clip applies.
      const removedLinks = new Set(
        onIt.flatMap((clip) => (clip.linkId ? [clip.linkId] : []))
      );
      for (const linkId of removedLinks) {
        const remainingLinked = scope.clips.filter((c) => c.linkId === linkId);
        if (remainingLinked.length === 1) {
          delete remainingLinked[0]!.linkId;
          scope.touch(remainingLinked[0]!.id);
        }
      }
      // Subject tracks belong to a clip; they go with it, and a clip bound to
      // one of them is released the way delete_track_object releases it.
      const droppedMediaTracks = new Set(
        scope.mediaTracks.filter((t) => removed.has(t.clipId)).map((t) => t.id)
      );
      if (droppedMediaTracks.size > 0) {
        scope.mediaTracks = scope.mediaTracks.filter(
          (t) => !droppedMediaTracks.has(t.id)
        );
        for (const clip of scope.clips) {
          if (
            clip.trackBinding &&
            droppedMediaTracks.has(clip.trackBinding.trackId)
          ) {
            delete clip.trackBinding;
            scope.touch(clip.id);
          }
        }
      }
      scope.touch(...removedClipIds);
      state.selectedClipIds = state.selectedClipIds.filter(
        (id) => !removed.has(id)
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
        tracks: serializeTracks(scope.state)
      };
    }
  }
}

/** Synchronous document edits for hosts whose editor actions are synchronous. */
export function applyTimelineTrackOp(
  state: TimelineOpState,
  op: TimelineTrackOp,
  ctx: Pick<TimelineOpContext, "newId" | "defaultMidiInstrument">
): TimelineOpOutcome {
  const scope = new OpScope(cloneState(state), ctx);
  try {
    const result = runTrackOp(scope, op);
    return { state: scope.state, result, changedClipIds: [...scope.changed] };
  } catch (error) {
    return {
      state,
      result: {},
      changedClipIds: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
