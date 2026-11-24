/**
 * Agent parity for the editor's MIDI and mixer edits: the piano-roll note
 * functions, controller lanes, track automation, the master bus and the track
 * insert chain. Each handler calls the same engine function the editor calls,
 * so a tool call and a click write the same document.
 */

import type { serializeClip, serializeTrack } from "./serialize.js";
import { isShortResourceId } from "@nodetool-ai/protocol";
import { MAX_AUTOMATION_LANES_PER_TRACK } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  INSTRUMENT_DEVICE_ID,
  automationTargetKey,
  createAutomationLane,
  trackAcceptsAutomationTarget
} from "../automation.js";
import {
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  controllerValueRange,
  validateControllerLanes
} from "../midi/controllers.js";
import { setLanePoints, type MidiControllerTarget } from "../midi/controllerEdit.js";
import {
  deleteDuplicates,
  forceLegato,
  glueNotes,
  removeOverlaps,
  scaleQuantizeNotes
} from "../midi/noteFunctions.js";
import type { MidiNoteParams } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { removeNotes, setVelocity } from "../midi/notesEdit.js";
import { sortNotes, validateNotes } from "../midi/notes.js";
import { resolveTempo } from "../midi/tempo.js";
import { tonicPitchClass } from "../harmony/progressionLibrary.js";
import { SCALES } from "../harmony/scales.js";
import type {
  AutomationLane,
  AutomationPoint,
  MidiControllerLane,
  MidiNote,
  TimelineClip,
  TimelineTrack
} from "../types.js";
import type { TimelineOp } from "./op.js";
import type {
  TimelineOpIdKind,
  TimelineOpResult,
  TimelineOpState
} from "./types.js";

const AUDIO_TRACK_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "gain",
  "eq3",
  "filter",
  "compressor",
  "fable",
  "vst"
]);

const VIDEO_TRACK_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "colorCorrection",
  "videoBlur",
  "sharpen",
  "vignette",
  "chromaKey"
]);

function resolveByIdOrShortId<T extends { id: string }>(
  units: readonly T[],
  target: string,
  kind: string
): T | undefined {
  const exact = units.find((unit) => unit.id === target);
  if (exact) return exact;
  if (!isShortResourceId(target)) return undefined;
  const matches = units.filter((unit) => unit.id.startsWith(target));
  if (matches.length > 1) {
    throw new Error(`Prefix "${target}" matches more than one ${kind}; use a full id.`);
  }
  return matches[0];
}

function resolveEffectsList<T extends { id: string }>(
  existing: readonly T[] | undefined,
  incoming: readonly T[]
): T[] {
  const current = existing ?? [];
  return incoming.map((effect) => {
    const resolved = resolveByIdOrShortId(current, effect.id, "effect");
    const cloned = structuredClone(effect);
    if (resolved) {
      cloned.id = resolved.id;
    }
    return cloned;
  });
}

function validateEffectsList(
  targetLabel: string,
  domain: "audio" | "video" | "none",
  effects: ReadonlyArray<{ id: string; type: string }>
): void {
  if (domain === "none" && effects.length > 0) {
    throw new Error(`${targetLabel} cannot carry insert effects.`);
  }
  const seen = new Set<string>();
  for (const effect of effects) {
    if (!effect.id.trim()) {
      throw new Error(`Each effect on ${targetLabel} needs a non-empty id.`);
    }
    if (seen.has(effect.id)) {
      throw new Error(`Duplicate effect id "${effect.id}" on ${targetLabel}.`);
    }
    seen.add(effect.id);
    if (domain === "audio" && !AUDIO_TRACK_EFFECT_TYPES.has(effect.type)) {
      throw new Error(
        `${targetLabel} accepts audio effects only (${[...AUDIO_TRACK_EFFECT_TYPES].join(", ")}), not "${effect.type}".`
      );
    }
    if (domain === "video" && !VIDEO_TRACK_EFFECT_TYPES.has(effect.type)) {
      throw new Error(
        `${targetLabel} accepts picture effects only (${[...VIDEO_TRACK_EFFECT_TYPES].join(", ")}), not "${effect.type}".`
      );
    }
  }
}

export interface MidiMixScope {
  readonly state: TimelineOpState;
  readonly ctx: { newId(kind: TimelineOpIdKind): string };
  resolveMidiClip(target: string): TimelineClip;
  buildNotes(
    input: readonly MidiNoteParams[] | undefined,
    name: string
  ): MidiNote[];
  resolveTrack(target: string): TimelineTrack;
  assertWritable(clips: readonly TimelineClip[], destinationTrackId?: string): void;
  touch(...ids: string[]): void;
  clipOut(clip: TimelineClip): ReturnType<typeof serializeClip>;
  trackOut(track: TimelineTrack): ReturnType<typeof serializeTrack>;
}

/** The notes a selection names: `note_ids`, `pitches` or both, else every note. */
export function selectNotes(
  clip: TimelineClip,
  noteIds: readonly string[] | undefined,
  pitches: readonly number[] | undefined
): string[] {
  const notes = clip.notes ?? [];
  let ids: Set<string> | null = null;
  if (noteIds) {
    ids = new Set<string>();
    const missing: string[] = [];
    for (const ref of noteIds) {
      const found = resolveByIdOrShortId(notes, ref, "note");
      if (found) ids.add(found.id);
      else missing.push(ref);
    }
    if (missing.length > 0) {
      throw new Error(
        `Clip "${clip.name}" has no note ${missing.map((id) => `"${id}"`).join(", ")}. Read the ids with get_state and \`clip\`.`
      );
    }
  }
  const rows = pitches ? new Set(pitches) : null;
  return notes
    .filter((n) => (!ids || ids.has(n.id)) && (!rows || rows.has(n.pitch)))
    .map((n) => n.id);
}

/** Keep the edit of `edited` on the listed notes only. Both lists share order. */
export function onlySelected(
  before: readonly MidiNote[],
  edited: readonly MidiNote[],
  selected: ReadonlySet<string>
): MidiNote[] {
  return before.map((note, i) => (selected.has(note.id) ? edited[i]! : note));
}

type SetNotesOp = Extract<TimelineOp, { op: "set_notes" }>;

function applyNoteFunction(
  scope: MidiMixScope,
  clip: TimelineClip,
  op: SetNotesOp & { function: NonNullable<SetNotesOp["function"]> }
): TimelineOpResult {
  const before = clip.notes ?? [];
  const ids = selectNotes(clip, op.note_ids, op.pitches);
  const selected = new Set(ids);
  let notes: MidiNote[];
  switch (op.function) {
    case "scale_quantize": {
      if (op.scale === undefined) {
        throw new Error("scale_quantize needs a `scale`, for example \"major\" or \"minPent\".");
      }
      const tonic = resolveTempo(scope.state).key?.tonic;
      const defaultRoot = tonic !== undefined ? (tonicPitchClass(tonic) ?? 0) : 0;
      notes = scaleQuantizeNotes(before, op.root ?? defaultRoot, SCALES[op.scale].iv, ids);
      break;
    }
    case "legato":
      notes = forceLegato(before, ids);
      break;
    case "remove_overlaps":
      notes = removeOverlaps(before, ids);
      break;
    case "delete_duplicates":
      notes = deleteDuplicates(before, ids);
      break;
    case "glue": {
      if (op.note_ids === undefined || ids.length < 2) {
        throw new Error("glue needs `note_ids` selecting at least two distinct notes.");
      }
      notes = glueNotes(before, ids, ids[0]!);
      break;
    }
    case "mute":
      notes = before.map((n) => (selected.has(n.id) ? { ...n, muted: true } : n));
      break;
    case "unmute":
      notes = before.map((n) => {
        if (!selected.has(n.id)) return n;
        const { muted: _muted, ...rest } = n;
        return rest;
      });
      break;
    case "delete":
      notes = removeNotes(before, ids);
      break;
    case "set_velocity": {
      if (op.velocity === undefined) {
        throw new Error("set_velocity needs a `velocity` from 1 to 127.");
      }
      notes = setVelocity(before, ids, op.velocity);
      break;
    }
  }
  const sorted = sortNotes(notes);
  const problems = validateNotes(sorted);
  if (problems.length > 0) {
    throw new Error(
      `${op.function} would leave Clip "${clip.name}" with invalid notes: ${problems[0]!.message}`
    );
  }
  clip.notes = sorted;
  return {
    function: op.function,
    selectedNoteCount: ids.length,
    noteCount: sorted.length
  };
}

function writeControllers(
  scope: MidiMixScope,
  clip: TimelineClip,
  entries: NonNullable<SetNotesOp["controllers"]>
): TimelineOpResult {
  let lanes: MidiControllerLane[] = [...(clip.controllers ?? [])];
  for (const entry of entries) {
    if (entry.kind === "cc" && entry.cc === undefined) {
      throw new Error("A cc lane needs `cc`, the controller number 0..127.");
    }
    if (entry.kind !== "cc" && entry.cc !== undefined) {
      throw new Error(`cc applies to a cc lane only, not to ${entry.kind}.`);
    }
    if (entry.kind === "polyPressure" && entry.pitch === undefined) {
      throw new Error("A polyPressure lane needs `pitch`.");
    }
    if (entry.kind !== "polyPressure" && entry.pitch !== undefined) {
      throw new Error(`pitch applies to a polyPressure lane only, not to ${entry.kind}.`);
    }
    const range = controllerValueRange(entry.kind);
    const bad = entry.points.find((p) => p.value < range.min || p.value > range.max);
    if (bad) {
      throw new Error(
        `A ${entry.kind} lane takes values ${range.min}..${range.max}; got ${bad.value} at tick ${bad.tick}.`
      );
    }
    const target: MidiControllerTarget = { kind: entry.kind };
    if (entry.cc !== undefined) target.cc = entry.cc;
    if (entry.pitch !== undefined) target.pitch = entry.pitch;
    if (entry.channel !== undefined) target.channel = entry.channel;
    const next = setLanePoints(
      lanes,
      target,
      entry.points.map((p) => ({ id: scope.ctx.newId("point"), tick: p.tick, value: p.value })),
      entry.interpolation
    );
    // setLanePoints returns the list unchanged for a lane past a cap.
    if (
      next.length === lanes.length &&
      next.every((lane, i) => lane === lanes[i]) &&
      entry.points.length > 0
    ) {
      throw new Error(
        `The clip holds ${MIDI_MAX_CONTROLLER_LANES_PER_CLIP} controller lanes already, or the lane has too many points.`
      );
    }
    // `setLanePoints` mints a random id for a new lane. The op context mints
    // it instead, so every host writes the same id.
    const known = new Set(lanes.map((lane) => lane.id));
    lanes = next.map((lane) =>
      known.has(lane.id) ? lane : { ...lane, id: scope.ctx.newId("lane") }
    );
  }
  const problems = validateControllerLanes(lanes);
  if (problems.length > 0) {
    throw new Error(`Clip "${clip.name}" was not given its lanes: ${problems[0]!.message}`);
  }
  if (lanes.length === 0) {
    delete clip.controllers;
  } else {
    clip.controllers = lanes;
  }
  return { laneCount: lanes.length, controllers: lanes };
}

export function runSetNotes(scope: MidiMixScope, op: SetNotesOp): TimelineOpResult {
  const clip = scope.resolveMidiClip(op.clip);
  scope.assertWritable([clip]);
  if (op.notes === undefined && op.function === undefined && op.controllers === undefined) {
    throw new Error("Send `notes`, `function` or `controllers`.");
  }
  if (op.notes !== undefined && op.function !== undefined) {
    throw new Error("Send `notes` or `function`, not both. A function edits the notes the clip has.");
  }
  if (op.function === undefined) {
    const stray = (["note_ids", "pitches", "velocity", "root", "scale"] as const).filter(
      (key) => op[key] !== undefined
    );
    if (stray.length > 0) {
      throw new Error(`${stray.join(", ")} only apply with \`function\`.`);
    }
  } else {
    if (op.function !== "scale_quantize") {
      const stray = (["root", "scale"] as const).filter(
        (key) => op[key] !== undefined
      );
      if (stray.length > 0) {
        throw new Error(
          `${stray.join(", ")} only apply with function "scale_quantize", not "${op.function}".`
        );
      }
    }
    if (op.function !== "set_velocity" && op.velocity !== undefined) {
      throw new Error(
        `velocity only applies with function "set_velocity", not "${op.function}".`
      );
    }
  }
  if (op.notes !== undefined) clip.notes = scope.buildNotes(op.notes, clip.name);
  const extra: TimelineOpResult = {};
  if (op.function !== undefined) {
    Object.assign(extra, applyNoteFunction(scope, clip, { ...op, function: op.function }));
  }
  if (op.controllers !== undefined) {
    Object.assign(extra, writeControllers(scope, clip, op.controllers));
  }
  scope.touch(clip.id);
  return { ok: true, clip: scope.clipOut(clip), ...extra };
}


type SetTrackOp = Extract<TimelineOp, { op: "set_track" }>;

/** The mixer and music fields of `set_track` that a plain channel change does not cover. */
export function runSetTrackMix(
  scope: Pick<MidiMixScope, "state" | "ctx">,
  track: TimelineTrack,
  op: SetTrackOp
): void {
  if (op.effects !== undefined) {
    const domain =
      track.type === "audio" || track.type === "midi"
        ? "audio"
        : track.type === "video" || track.type === "overlay"
          ? "video"
          : "none";
    const resolvedEffects = resolveEffectsList(track.effects, op.effects);
    validateEffectsList(`Track "${track.name}" (${track.type})`, domain, resolvedEffects);
    if (resolvedEffects.length === 0) delete track.effects;
    else track.effects = resolvedEffects as TimelineTrack["effects"];
    if (track.automation && track.automation.length > 0) {
      const effectIds = new Set((track.effects ?? []).map((effect) => effect.id));
      const kept = track.automation.filter(
        (lane) =>
          lane.target.kind !== "device" ||
          lane.target.deviceId === INSTRUMENT_DEVICE_ID ||
          effectIds.has(lane.target.deviceId)
      );
      if (kept.length === 0) delete track.automation;
      else if (kept.length !== track.automation.length) track.automation = kept;
    }
  }
  if (op.musicRole !== undefined) {
    if (op.musicRole === null) delete track.musicRole;
    else track.musicRole = op.musicRole;
  }
  if (op.folder !== undefined) {
    if (op.folder === null) {
      delete track.folderId;
    } else {
      const trimmed = op.folder.trim();
      if (trimmed.length === 0) {
        throw new Error("Folder name cannot be blank.");
      }
      const folders = scope.state.trackFolders ?? [];
      const wanted = trimmed.toLowerCase();
      const found =
        resolveByIdOrShortId(folders, trimmed, "track folder") ??
        folders.find((f) => f.name.toLowerCase() === wanted);
      if (found) {
        track.folderId = found.id;
      } else {
        const created = { id: scope.ctx.newId("folder"), name: trimmed };
        scope.state.trackFolders = [...folders, created];
        track.folderId = created.id;
      }
    }
  }
  if (op.automationMode !== undefined) {
    if (track.type === "chord" || track.type === "subtitle") {
      throw new Error(`Track "${track.name}" (${track.type}) does not support automation.`);
    }
    if (op.automationMode === "read") {
      delete track.automationMode;
    } else {
      track.automationMode = op.automationMode;
    }
  }
  if (op.automation !== undefined) {
    let lanes: AutomationLane[] = [...(track.automation ?? [])];
    for (const entry of op.automation) {
      let target = entry.target;
      if (target.kind === "device" && target.deviceId !== INSTRUMENT_DEVICE_ID) {
        const resolvedEffect = resolveByIdOrShortId(
          track.effects ?? [],
          target.deviceId,
          "effect"
        );
        if (resolvedEffect) {
          target = { ...target, deviceId: resolvedEffect.id };
        }
      }
      if (!trackAcceptsAutomationTarget(track, target)) {
        throw new Error(
          `Track "${track.name}" (${track.type}) cannot take a ${describeTarget(target)} lane. A mixer lane needs an audio or midi track, a clip lane a video or overlay track, and a device lane the \`instrument\` of a midi track or the id of one of the track's effects.`
        );
      }
      const key = automationTargetKey(target);
      const points = [...entry.points]
        .sort((a, b) => a.timeMs - b.timeMs)
        .map((p) => {
          const point: AutomationPoint = { timeMs: p.timeMs, value: p.value };
          if (p.easing !== undefined) point.easing = p.easing;
          return point;
        });
      const existing = lanes.find((lane) => automationTargetKey(lane.target) === key);
      if (points.length === 0) {
        lanes = lanes.filter((lane) => lane !== existing);
        continue;
      }
      const base = existing ?? {
        ...createAutomationLane(target),
        id: scope.ctx.newId("lane")
      };
      const lane: AutomationLane = { ...base, points };
      if (entry.enabled === false) {
        lane.enabled = false;
      } else if (entry.enabled === true) {
        delete lane.enabled;
      }
      lanes = existing
        ? lanes.map((l) => (l === existing ? lane : l))
        : [...lanes, lane];
    }
    if (lanes.length > MAX_AUTOMATION_LANES_PER_TRACK) {
      throw new Error(
        `Track "${track.name}" can hold at most ${MAX_AUTOMATION_LANES_PER_TRACK} automation lanes (got ${lanes.length}).`
      );
    }
    if (lanes.length === 0) delete track.automation;
    else track.automation = lanes;
  }
}

/** `set_track` on the master bus: the fader, pan and the insert chain. */
export function runSetMaster(
  scope: Pick<MidiMixScope, "state">,
  op: SetTrackOp
): TimelineOpResult {
  const refused = Object.keys(op).filter(
    (key) =>
      !["op", "track", "volumeDb", "pan", "effects"].includes(key) &&
      (op as Record<string, unknown>)[key] !== undefined
  );
  if (refused.length > 0) {
    throw new Error(
      `The master bus takes volumeDb, pan and effects only, not ${refused.join(", ")}.`
    );
  }
  if (op.volumeDb === undefined && op.pan === undefined && op.effects === undefined) {
    throw new Error("Send `volumeDb`, `pan`, `effects` or any combination for the master bus.");
  }
  const master = { ...(scope.state.master ?? { volumeDb: 0 }) };
  if (op.volumeDb !== undefined) master.volumeDb = op.volumeDb;
  if (op.pan !== undefined) {
    if (!Number.isFinite(op.pan) || op.pan < -1 || op.pan > 1) {
      throw new Error(`Master pan must be between -1 and 1 (got ${op.pan}).`);
    }
    master.pan = op.pan;
  }
  if (op.effects !== undefined) {
    const resolvedEffects = resolveEffectsList(master.effects, op.effects);
    validateEffectsList("The master bus", "audio", resolvedEffects);
    if (resolvedEffects.length === 0) delete master.effects;
    else master.effects = resolvedEffects as typeof master.effects;
  }
  scope.state.master = master;
  return { ok: true, master };
}

function describeTarget(target: AutomationLane["target"]): string {
  if (target.kind === "mixer") return `mixer ${target.param}`;
  if (target.kind === "device") return `device ${target.deviceId}.${target.param}`;
  return `clip ${target.property}`;
}
