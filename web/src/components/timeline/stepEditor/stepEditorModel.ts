/**
 * The Step Editor's lane model and the pure edits behind its tools.
 *
 * A lane is one row of the editor: a note lane (one pitch, beams are note
 * velocities) or a controller lane (beams are the points of one controller
 * lane). The gestures in `StepEditor` call these, so each rule is testable
 * without a pointer. The shared drawing rules live in `@nodetool-ai/timeline`
 * (`midi/stepEditor.ts`).
 */

import {
  GM_DRUM_LANES,
  MIDI_MAX_POINTS_PER_LANE,
  automaticLanes,
  controllerLaneKey,
  controllerValueRange,
  createTimeOrderedUuid,
  drawNoteStep,
  drawStep,
  findControllerLane,
  setLanePoints,
  thinOut
} from "@nodetool-ai/timeline";
import type {
  MidiControllerKind,
  MidiControllerLane,
  MidiControllerTarget,
  MidiNote
} from "@nodetool-ai/timeline";

import { pitchName } from "../pianoRoll/pianoRollGeometry";
import type { StepLaneSet } from "../../../stores/timeline/TimelineUIStore";

/** The velocity range of a note beam. */
export const VELOCITY_MIN = 1;
export const VELOCITY_MAX = 127;

/** The document a Step Editor edit reads and returns. */
export interface StepDoc {
  notes: MidiNote[];
  controllers: MidiControllerLane[];
}

export type StepLaneStatus =
  | "note"
  | "control"
  | "pitchBend"
  | "channelPressure"
  | "polyPressure";

export interface StepLaneView {
  /** `note:<pitch>` or `cc:<controller lane key>`. Stable across edits. */
  key: string;
  type: "note" | "controller";
  /** A note lane's pitch. */
  pitch?: number;
  /** A controller lane's target. */
  target?: MidiControllerTarget;
  kind?: MidiControllerKind;
  /** A name that needs no translation: a note name or a GM drum name. */
  label?: string;
  /** Translation key under `stepEditor.laneNames` for a controller lane. */
  nameKey?: string;
  /** The number a name takes: the cc number or the polyphonic pressure note. */
  nameArg?: string;
  min: number;
  max: number;
  status: StepLaneStatus;
  /** MIDI channel, 1..16. */
  channel: number;
  /** The cc number or note pitch, or null when the lane has none. */
  number: number | null;
}

/** One beam of a lane. */
export interface StepEvent {
  id: string;
  tick: number;
  value: number;
  muted?: boolean;
}

const CC_NAME_KEYS: Record<number, string> = {
  1: "modulation",
  7: "volume",
  10: "pan",
  11: "expression",
  64: "sustain"
};

export const noteLaneKey = (pitch: number): string => `note:${pitch}`;
export const controllerLaneViewKey = (target: MidiControllerTarget): string =>
  `cc:${controllerLaneKey(target)}`;

/** The target a controller lane names. */
export function targetOf(lane: MidiControllerLane): MidiControllerTarget {
  const target: MidiControllerTarget = { kind: lane.kind };
  if (lane.kind === "cc") target.cc = lane.cc;
  if (lane.kind === "polyPressure") target.pitch = lane.pitch;
  if (lane.channel) target.channel = lane.channel;
  return target;
}

export function noteLaneView(pitch: number, gmName?: string): StepLaneView {
  return {
    key: noteLaneKey(pitch),
    type: "note",
    pitch,
    label: gmName ?? pitchName(pitch),
    min: VELOCITY_MIN,
    max: VELOCITY_MAX,
    status: "note",
    channel: 1,
    number: pitch
  };
}

export function controllerLaneView(target: MidiControllerTarget): StepLaneView {
  const { min, max } = controllerValueRange(target.kind);
  let nameKey: string;
  let nameArg: string | undefined;
  let status: StepLaneStatus = "control";
  if (target.kind === "cc") {
    nameKey = CC_NAME_KEYS[target.cc ?? -1] ?? "cc";
    nameArg = String(target.cc ?? 0);
  } else if (target.kind === "pitchBend") {
    nameKey = "pitchBend";
    status = "pitchBend";
  } else if (target.kind === "channelPressure") {
    nameKey = "channelPressure";
    status = "channelPressure";
  } else {
    nameKey = "polyPressure";
    nameArg = pitchName(target.pitch ?? 0);
    status = "polyPressure";
  }
  return {
    key: controllerLaneViewKey(target),
    type: "controller",
    target,
    kind: target.kind,
    nameKey,
    nameArg,
    min,
    max,
    status,
    channel: (target.channel ?? 0) + 1,
    number: target.kind === "cc" ? target.cc ?? 0 : null
  };
}

export interface LaneSources {
  laneSet: StepLaneSet;
  notes: ReadonlyArray<MidiNote>;
  controllers: ReadonlyArray<MidiControllerLane>;
  /** Controller lanes created in the editor that have no point yet. */
  pendingTargets: ReadonlyArray<MidiControllerTarget>;
  /** Note lanes created in the editor that have no note yet. */
  extraPitches: ReadonlyArray<number>;
  /** Deleted note lanes: pitch -> the note ids that existed when it was hidden. */
  hidden: ReadonlyMap<number, ReadonlySet<string>>;
}

/** Whether a deleted note lane stays hidden: no note at the pitch is new since. */
export function isPitchHidden(
  pitch: number,
  notes: ReadonlyArray<MidiNote>,
  hidden: ReadonlyMap<number, ReadonlySet<string>>
): boolean {
  const seen = hidden.get(pitch);
  if (!seen) return false;
  return notes.every((n) => n.pitch !== pitch || seen.has(n.id));
}

/** The lanes of the selected lane set, top to bottom. */
export function buildStepLanes(src: LaneSources): StepLaneView[] {
  if (src.laneSet === "gmDrums") {
    return GM_DRUM_LANES.map((lane) => noteLaneView(lane.pitch, lane.name));
  }
  const shown = src.notes.filter((n) => !isPitchHidden(n.pitch, src.notes, src.hidden));
  const extra = src.extraPitches
    .filter((pitch) => !isPitchHidden(pitch, src.notes, src.hidden))
    .map((pitch) => ({ pitch }));
  const known = new Set(src.controllers.map((lane) => controllerLaneKey(lane)));
  const pending = src.pendingTargets.filter(
    (target) => !known.has(controllerLaneKey(target))
  );
  const refs = automaticLanes([...shown, ...extra], src.controllers);
  const views: StepLaneView[] = [];
  for (const ref of refs) {
    if (ref.type === "note") {
      views.push(noteLaneView(ref.pitch));
    } else {
      const lane = src.controllers.find((l) => l.id === ref.laneId);
      if (lane) views.push(controllerLaneView(targetOf(lane)));
    }
  }
  for (const target of pending) views.push(controllerLaneView(target));
  return views;
}

/** The beams of a lane. */
export function laneEvents(
  lane: StepLaneView,
  doc: StepDoc
): StepEvent[] {
  if (lane.type === "note") {
    return doc.notes
      .filter((n) => n.pitch === lane.pitch)
      .map((n) => {
        const event: StepEvent = { id: n.id, tick: n.startTick, value: n.velocity };
        if (n.muted) event.muted = true;
        return event;
      });
  }
  const found = lane.target ? findControllerLane(doc.controllers, lane.target) : undefined;
  return (found?.points ?? []).map((p) => ({ id: p.id, tick: p.tick, value: p.value }));
}

/** A beam's vertical extent inside a row, y counted down from the row top. */
export function beamBox(
  lane: Pick<StepLaneView, "kind" | "min" | "max">,
  value: number,
  rowHeight: number
): { top: number; height: number } {
  const range = Math.max(1, lane.max - lane.min);
  const yOf = (v: number) => (1 - (v - lane.min) / range) * rowHeight;
  if (lane.kind === "pitchBend") {
    const zero = yOf(0);
    const y = yOf(value);
    const top = Math.min(zero, y);
    return { top, height: Math.max(1, Math.abs(zero - y)) };
  }
  const height = Math.max(1, ((value - lane.min) / range) * rowHeight);
  return { top: rowHeight - height, height };
}

/** A tick span that starts at or after tick 0. */
export function clampStep(
  stepStart: number,
  step: number
): { start: number; length: number } | null {
  const start = Math.max(0, stepStart);
  const length = stepStart + step - start;
  return length > 0 ? { start, length } : null;
}

/** Write one lane's point list, creating the lane or removing it when empty. */
function writeLanePoints(
  controllers: MidiControllerLane[],
  target: MidiControllerTarget,
  points: MidiControllerLane["points"]
): MidiControllerLane[] {
  const existing = findControllerLane(controllers, target);
  if (existing && points.length > MIDI_MAX_POINTS_PER_LANE) {
    // Past the cap on purpose: the store validates, refuses and says why.
    return controllers.map((lane) => (lane === existing ? { ...lane, points: [...points] } : lane));
  }
  return setLanePoints(controllers, target, points);
}

export interface DrawOptions {
  /** Length of a note the editor creates, in ticks. */
  length: number;
  newId?: () => string;
}

/** `drawStep` or `drawNoteStep`, by lane type, on a whole document. */
export function drawIntoLane(
  doc: StepDoc,
  lane: StepLaneView,
  stepStart: number,
  step: number,
  value: number,
  opts: DrawOptions
): StepDoc {
  const span = clampStep(stepStart, step);
  if (!span) return doc;
  const newId = opts.newId ?? createTimeOrderedUuid;
  if (lane.type === "note" && lane.pitch !== undefined) {
    return {
      notes: drawNoteStep(doc.notes, lane.pitch, span.start, span.length, value, opts.length, newId),
      controllers: doc.controllers
    };
  }
  if (!lane.target) return doc;
  const existing = findControllerLane(doc.controllers, lane.target);
  const next = drawStep(existing?.points ?? [], span.start, span.length, value, newId);
  return { notes: doc.notes, controllers: writeLanePoints(doc.controllers, lane.target, next) };
}

/** Remove events by id from notes and points. */
export function removeEvents(doc: StepDoc, ids: ReadonlySet<string>): StepDoc {
  if (ids.size === 0) return doc;
  let controllers = doc.controllers;
  for (const lane of doc.controllers) {
    if (!lane.points.some((p) => ids.has(p.id))) continue;
    controllers = setLanePoints(
      controllers,
      targetOf(lane),
      lane.points.filter((p) => !ids.has(p.id))
    );
  }
  return { notes: doc.notes.filter((n) => !ids.has(n.id)), controllers };
}

export interface ValueRange {
  min: number;
  max: number;
}

/**
 * Give each listed event a new value. `fn` gets the old value and the range of
 * its lane, and the result is rounded and clamped to that range.
 */
export function mapEventValues(
  doc: StepDoc,
  ids: ReadonlySet<string>,
  fn: (value: number, range: ValueRange) => number
): StepDoc {
  const clamp = (v: number, r: ValueRange) => Math.min(r.max, Math.max(r.min, Math.round(v)));
  const noteRange: ValueRange = { min: VELOCITY_MIN, max: VELOCITY_MAX };
  return {
    notes: doc.notes.map((n) =>
      ids.has(n.id) ? { ...n, velocity: clamp(fn(n.velocity, noteRange), noteRange) } : n
    ),
    controllers: doc.controllers.map((lane) => {
      if (!lane.points.some((p) => ids.has(p.id))) return lane;
      const range = controllerValueRange(lane.kind);
      return {
        ...lane,
        points: lane.points.map((p) =>
          ids.has(p.id) ? { ...p, value: clamp(fn(p.value, range), range) } : p
        )
      };
    })
  };
}

/**
 * Move every listed event by one shared delta. The delta stops where the first
 * event reaches the end of its range, so the events keep their spacing (the
 * piano roll's velocity rule).
 */
export function shiftEventValues(
  baseline: StepDoc,
  ids: ReadonlySet<string>,
  delta: number
): StepDoc {
  let down = Infinity;
  let up = Infinity;
  const see = (value: number, range: ValueRange) => {
    down = Math.min(down, value - range.min);
    up = Math.min(up, range.max - value);
  };
  mapEventValues(baseline, ids, (value, range) => {
    see(value, range);
    return value;
  });
  if (down === Infinity) return baseline;
  const shift = Math.round(Math.min(up, Math.max(-down, delta)));
  return mapEventValues(baseline, ids, (value) => value + shift);
}

/** The listed events grouped by the lane that holds them, each group in tick order. */
export function selectedGroups(doc: StepDoc, ids: ReadonlySet<string>): string[][] {
  const groups: string[][] = [];
  const byPitch = new Map<number, MidiNote[]>();
  for (const n of doc.notes) {
    if (!ids.has(n.id)) continue;
    byPitch.set(n.pitch, [...(byPitch.get(n.pitch) ?? []), n]);
  }
  for (const list of byPitch.values()) {
    groups.push(
      list
        .map((n, i) => ({ n, i }))
        .sort((a, b) => a.n.startTick - b.n.startTick || a.i - b.i)
        .map((x) => x.n.id)
    );
  }
  for (const lane of doc.controllers) {
    const picked = lane.points.filter((p) => ids.has(p.id));
    if (picked.length > 0) groups.push(picked.map((p) => p.id));
  }
  return groups;
}

/** Thin Out: remove every second selected event of each lane. */
export function thinOutEvents(doc: StepDoc, ids: ReadonlySet<string>): StepDoc {
  const doomed = new Set(selectedGroups(doc, ids).flatMap((group) => thinOut(group)));
  return removeEvents(doc, doomed);
}

/** Whether a document edit changed anything. */
export function docChanged(a: StepDoc, b: StepDoc): boolean {
  return a.notes !== b.notes || a.controllers !== b.controllers;
}

/** The ids of a lane's events that sit inside a pixel rectangle of its row. */
export function eventsInRect(
  lane: StepLaneView,
  events: ReadonlyArray<StepEvent>,
  rowHeight: number,
  tickToX: (tick: number) => number,
  penWidth: number,
  rect: { left: number; right: number; top: number; bottom: number }
): string[] {
  return events
    .filter((event) => {
      const x = tickToX(event.tick);
      if (x + penWidth < rect.left || x > rect.right) return false;
      const box = beamBox(lane, event.value, rowHeight);
      return box.top + box.height >= rect.top && box.top <= rect.bottom;
    })
    .map((event) => event.id);
}

/** The topmost beam under a point of a lane row, or null. */
export function hitBeam(
  lane: StepLaneView,
  events: ReadonlyArray<StepEvent>,
  rowHeight: number,
  tickToX: (tick: number) => number,
  penWidth: number,
  x: number,
  y: number
): StepEvent | null {
  const reach = Math.max(penWidth, 3);
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    const left = tickToX(event.tick);
    if (x < left || x >= left + reach) continue;
    const box = beamBox(lane, event.value, rowHeight);
    if (y >= box.top && y <= box.top + Math.max(box.height, 4)) return event;
  }
  return null;
}
