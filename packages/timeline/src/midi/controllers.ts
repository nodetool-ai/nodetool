/**
 * Controller lanes and per-note expression: limits, checks, curve lookup and
 * the events a lane plays.
 *
 * The rules here are the shared contract between every surface that plays a
 * midi clip, so keep them in one place. A lane's points are clip content
 * ticks, exactly like a note's `startTick`. A trimmed window hides points and
 * does not delete them.
 */

import type {
  MidiControllerKind,
  MidiControllerLane,
  MidiControllerPoint,
  MidiInstrument,
  TimelineClip,
  TimelineTempo
} from "../types.js";
import { activeLoopMs, expandMidiLoop, type ExpandMidiPatternDoc } from "../clipLoop.js";
import type { MidiRegionKeys } from "./regionParams.js";
import { msToTicks, ticksToMs } from "./ticks.js";
import {
  MIDI_PITCH_BEND_MAX,
  MIDI_PITCH_BEND_MIN,
  controllerValueRange
} from "./controllerRange.js";
import {
  MIDI_EXPRESSION_KINDS,
  MIDI_EXPRESSION_SPEC,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  expressionProblems,
  expressionValueAt,
  type MidiExpressionKind
} from "./expression.js";

export { MIDI_PITCH_BEND_MAX, MIDI_PITCH_BEND_MIN, controllerValueRange };
export {
  MIDI_EXPRESSION_KINDS,
  MIDI_EXPRESSION_SPEC,
  MIDI_MAX_EXPRESSION_POINTS_PER_NOTE,
  expressionProblems,
  expressionValueAt,
  type MidiExpressionKind
};

/** Most controller lanes one midi clip may carry. */
export const MIDI_MAX_CONTROLLER_LANES_PER_CLIP = 32;
/** Most points one controller lane may carry. */
export const MIDI_MAX_POINTS_PER_LANE = 4096;
/** The pitch-bend range of the built-in synth, in semitones. */
export const MIDI_PITCH_BEND_RANGE_SEMITONES = 2;
/** Spacing of the samples a linear lane emits between two points. */
export const MIDI_CONTROLLER_SAMPLE_MS = 10;


/** The identity two lanes of one clip must not share. */
export function controllerLaneKey(
  lane: Pick<MidiControllerLane, "kind" | "cc" | "pitch" | "channel">
): string {
  return `${lane.kind}|${lane.cc ?? ""}|${lane.pitch ?? ""}|${lane.channel ?? 0}`;
}

export interface MidiControllerProblem {
  code:
    | "too_many_lanes"
    | "too_many_points"
    | "duplicate_lane"
    | "duplicate_lane_id"
    | "bad_lane_fields"
    | "value_out_of_range"
    | "bad_tick"
    | "unsorted_points"
    | "duplicate_point_id";
  message: string;
  laneId?: string;
}

/** Every problem in a lane list. An empty array means the list is storable. */
export function validateControllerLanes(
  lanes: ReadonlyArray<MidiControllerLane>
): MidiControllerProblem[] {
  const problems: MidiControllerProblem[] = [];
  if (lanes.length > MIDI_MAX_CONTROLLER_LANES_PER_CLIP) {
    problems.push({
      code: "too_many_lanes",
      message: `A clip carries at most ${MIDI_MAX_CONTROLLER_LANES_PER_CLIP} controller lanes; this list has ${lanes.length}.`
    });
  }
  const keys = new Set<string>();
  const laneIds = new Set<string>();
  const isInt = (n: unknown, lo: number, hi: number): boolean =>
    typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
  for (const lane of lanes) {
    const laneId = lane.id;
    if (laneIds.has(lane.id)) {
      problems.push({
        code: "duplicate_lane_id",
        message: `Two lanes share the id "${lane.id}".`,
        laneId
      });
    }
    laneIds.add(lane.id);
    const key = controllerLaneKey(lane);
    if (keys.has(key)) {
      problems.push({
        code: "duplicate_lane",
        message: `Two lanes share the identity (${key}).`,
        laneId
      });
    }
    keys.add(key);
    if (lane.kind === "cc" ? !isInt(lane.cc, 0, 127) : lane.cc !== undefined) {
      problems.push({
        code: "bad_lane_fields",
        message: "cc is required (0..127) on a cc lane and forbidden otherwise.",
        laneId
      });
    }
    if (
      lane.kind === "polyPressure"
        ? !isInt(lane.pitch, 0, 127)
        : lane.pitch !== undefined
    ) {
      problems.push({
        code: "bad_lane_fields",
        message:
          "pitch is required (0..127) on a polyPressure lane and forbidden otherwise.",
        laneId
      });
    }
    if (lane.channel !== undefined && !isInt(lane.channel, 0, 15)) {
      problems.push({
        code: "bad_lane_fields",
        message: `channel must be an integer 0..15, got ${lane.channel}.`,
        laneId
      });
    }
    if (lane.points.length > MIDI_MAX_POINTS_PER_LANE) {
      problems.push({
        code: "too_many_points",
        message: `A lane carries at most ${MIDI_MAX_POINTS_PER_LANE} points; this lane has ${lane.points.length}.`,
        laneId
      });
    }
    const { min, max } = controllerValueRange(lane.kind);
    const pointIds = new Set<string>();
    lane.points.forEach((point, i) => {
      if (!isInt(point.value, min, max)) {
        problems.push({
          code: "value_out_of_range",
          message: `value must be an integer ${min}..${max}, got ${point.value}.`,
          laneId
        });
      }
      if (!Number.isInteger(point.tick) || point.tick < 0) {
        problems.push({
          code: "bad_tick",
          message: `tick must be an integer >= 0, got ${point.tick}.`,
          laneId
        });
      }
      if (i > 0 && point.tick < lane.points[i - 1].tick) {
        problems.push({
          code: "unsorted_points",
          message: "points must be sorted by non-decreasing tick.",
          laneId
        });
      }
      if (pointIds.has(point.id)) {
        problems.push({
          code: "duplicate_point_id",
          message: `Two points of one lane share the id "${point.id}".`,
          laneId
        });
      }
      pointIds.add(point.id);
    });
  }
  return problems;
}

/**
 * A lane's integer output at content tick `tick`, or undefined before its
 * first point. A step lane holds each point's value, a linear lane blends.
 */
export function controllerValueAt(
  lane: Pick<MidiControllerLane, "points" | "interpolation" | "kind">,
  tick: number
): number | undefined {
  return pointsValueAt(lane.points, tick, lane.interpolation !== "step");
}

function pointsValueAt(
  points: ReadonlyArray<Pick<MidiControllerPoint, "tick" | "value">>,
  tick: number,
  linear: boolean
): number | undefined {
  if (points.length === 0 || tick < points[0].tick) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  // Last point with tick <= `tick`.
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo];
  const b = points[lo + 1];
  if (!linear || !b || b.tick === a.tick) return a.value;
  return Math.round(a.value + ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick));
}

/** One controller event on the timeline clock. */
export interface MidiControllerEvent {
  /** Timeline position in milliseconds. */
  timeMs: number;
  kind: MidiControllerKind;
  channel: number;
  /** Set for a cc event. */
  cc?: number;
  /** Set for a poly-pressure event. */
  pitch?: number;
  value: number;
  laneId: string;
}

/**
 * The controller events `clip` plays, in timeline milliseconds, ordered by
 * time (lane order at equal times).
 *
 * - "step" lanes emit at each point. "linear" lanes emit at each point and
 *   sample the ramp every 10 ms between two points, from the earlier point,
 *   emitting only when the integer value changes.
 * - Nothing is emitted before a lane's first point. After the last point the
 *   value holds.
 * - Only points inside the clip window produce events. Chase is the one
 *   exception: at `max(fromMs, clip start)` the lane's current value is
 *   emitted first, so a start inside the clip hears the right bend, volume or
 *   pedal. Events before `fromMs` are dropped. Pass no `fromMs` for a full
 *   render.
 * - At the window end every pitch-bend lane and every cc 64 lane that emitted
 *   anything gets value 0, so a cut clip leaves no bent pitch or held pedal.
 */
export function midiClipControllerEvents(
  source: Pick<
    TimelineClip,
    "controllers" | "inPointMs" | "durationMs" | "startMs" | "loopLengthMs" | MidiRegionKeys
  > &
    Pick<Partial<TimelineClip>, "pattern" | "patternPhaseTicks" | "patternRowCycles">,
  bpm: number,
  fromMs = Number.NEGATIVE_INFINITY,
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. */
  gridOffsetMs = 0,
  instrument?: MidiInstrument,
  patternDoc?: ExpandMidiPatternDoc
): MidiControllerEvent[] {
  const clip = expandMidiLoop(source, bpm, gridOffsetMs, instrument, patternDoc);
  const lanes = clip.controllers;
  if (!lanes || lanes.length === 0) return [];
  const windowStartMs = clip.inPointMs ?? 0;
  const windowEndMs = windowStartMs + clip.durationMs;
  const clipEnd = clip.startMs + clip.durationMs;
  if (clipEnd <= fromMs) return [];
  const toTime = (contentMs: number): number =>
    clip.startMs + contentMs - windowStartMs;
  const chaseTime = Math.max(fromMs, clip.startMs);
  const chaseContentMs = chaseTime - clip.startMs + windowStartMs;

  const events: MidiControllerEvent[] = [];
  for (const lane of lanes) {
    if (lane.points.length === 0) continue;
    const linear = lane.interpolation !== "step";
    const channel = lane.channel ?? 0;
    const times = lane.points.map((p) => ticksToMs(p.tick, bpm));
    const make = (timeMs: number, value: number): MidiControllerEvent => {
      const e: MidiControllerEvent = {
        timeMs,
        kind: lane.kind,
        channel,
        value,
        laneId: lane.id
      };
      if (lane.kind === "cc") e.cc = lane.cc ?? 0;
      if (lane.kind === "polyPressure") e.pitch = lane.pitch ?? 0;
      return e;
    };
    const emitted: MidiControllerEvent[] = [];
    let last: number | undefined;
    const emit = (timeMs: number, value: number): void => {
      emitted.push(make(timeMs, value));
      last = value;
    };
    const inWindow = (contentMs: number): boolean =>
      contentMs >= windowStartMs && contentMs < windowEndMs;

    // Chase, unless a point sits exactly there and plays by itself.
    if (chaseContentMs >= times[0]) {
      const hasPointThere = times.some(
        (t) => t === chaseContentMs && inWindow(t)
      );
      if (!hasPointThere) {
        const v = pointsValueAt(
          lane.points,
          chaseContentMs / ticksToMs(1, bpm),
          linear
        );
        if (v !== undefined && chaseTime < clipEnd) emit(chaseTime, v);
      }
    }

    for (let i = 0; i < lane.points.length; i++) {
      const t = times[i];
      if (inWindow(t) && toTime(t) >= fromMs) emit(toTime(t), lane.points[i].value);
      const next = lane.points[i + 1];
      if (!linear || !next) continue;
      const tNext = times[i + 1];
      if (tNext <= t) continue;
      // Skip samples that fall before the window or before `fromMs`.
      const lowContent = Math.max(windowStartMs, chaseContentMs);
      const k0 = Math.max(
        1,
        Math.ceil((lowContent - t) / MIDI_CONTROLLER_SAMPLE_MS)
      );
      for (let k = k0; ; k++) {
        const s = t + k * MIDI_CONTROLLER_SAMPLE_MS;
        if (s >= tNext || s >= windowEndMs) break;
        if (!inWindow(s) || toTime(s) < fromMs) continue;
        const v = Math.round(
          lane.points[i].value +
            ((next.value - lane.points[i].value) * (s - t)) / (tNext - t)
        );
        if (v !== last) emit(toTime(s), v);
      }
    }

    if (
      emitted.length > 0 &&
      (lane.kind === "pitchBend" || (lane.kind === "cc" && lane.cc === 64))
    ) {
      emitted.push(make(clipEnd, 0));
    }
    events.push(...emitted);
  }
  // Array.prototype.sort is stable, so lane order survives at equal times.
  return events.sort((a, b) => a.timeMs - b.timeMs);
}

/** The raw MIDI bytes of a controller event. */
export function midiControllerEventBytes(event: MidiControllerEvent): number[] {
  const ch = event.channel & 0x0f;
  switch (event.kind) {
    case "cc":
      return [0xb0 | ch, event.cc ?? 0, event.value];
    case "pitchBend": {
      const v = event.value + 8192;
      return [0xe0 | ch, v & 0x7f, (v >> 7) & 0x7f];
    }
    case "channelPressure":
      return [0xd0 | ch, event.value];
    case "polyPressure":
      return [0xa0 | ch, event.pitch ?? 0, event.value];
  }
}

/** The raw MIDI bytes of a note event: status, pitch, velocity. */
export function midiNoteEventBytes(event: {
  on: boolean;
  channel?: number;
  pitch: number;
  velocity: number;
}): [number, number, number] {
  return [
    (event.on ? 0x90 : 0x80) | ((event.channel ?? 0) & 0x0f),
    event.pitch,
    event.velocity
  ];
}

/**
 * Overlay controller events from overlapping MIDI clips on the same track onto
 * each note-bearing MIDI clip's content window.
 *
 * Pre-rendered instrument paths render each clip into its own PCM buffer, so a
 * controller-only clip (e.g. a pitch-bend or CC pattern region) would otherwise
 * never reach an overlapping note clip on the same track. Live-device tracks
 * share one device across all clips and pass `shouldMergeTrack` false.
 */
export function mergeTrackMidiControllers<C extends TimelineClip>(
  clips: ReadonlyArray<C>,
  tempo: Pick<TimelineTempo, "bpm"> & { offsetMs?: number },
  options?: { shouldMergeTrack?: (trackId: string) => boolean }
): C[] {
  const bpm = tempo.bpm;
  const gridOffsetMs = tempo.offsetMs ?? 0;

  const midiByTrack = new Map<string, C[]>();
  for (const clip of clips) {
    if (
      clip.mediaType !== "midi" ||
      clip.muted ||
      clip.hidden ||
      clip.durationMs <= 0
    ) {
      continue;
    }
    if (options?.shouldMergeTrack && !options.shouldMergeTrack(clip.trackId)) {
      continue;
    }
    const list = midiByTrack.get(clip.trackId);
    if (list) list.push(clip);
    else midiByTrack.set(clip.trackId, [clip]);
  }

  let anyMerged = false;
  const result = clips.map((clip) => {
    if (
      clip.mediaType !== "midi" ||
      clip.muted ||
      clip.hidden ||
      clip.durationMs <= 0 ||
      (clip.notes?.length ?? 0) === 0
    ) {
      return clip;
    }
    const siblings = midiByTrack.get(clip.trackId);
    if (!siblings || siblings.length < 2) return clip;
    const clipEndMs = clip.startMs + clip.durationMs;
    const overlapping = siblings
      .filter(
        (other) =>
          other !== clip &&
          (other.controllers?.length ?? 0) > 0 &&
          other.startMs < clipEndMs &&
          other.startMs + other.durationMs > clip.startMs
      )
      .sort((a, b) => a.startMs - b.startMs);
    if (overlapping.length === 0) return clip;

    // Expand clip's own loop before merging timeline-positioned sibling lanes so
    // an external controller clip is not spuriously repeated at loop boundaries.
    const baseClip =
      activeLoopMs(clip) !== undefined
        ? expandMidiLoop(clip, bpm, gridOffsetMs)
        : clip;
    const baseInTick = Math.round(msToTicks(baseClip.inPointMs ?? 0, bpm));
    const baseEndMs = baseClip.startMs + baseClip.durationMs;

    const mergedByKey = new Map<string, MidiControllerLane>();
    for (const lane of baseClip.controllers ?? []) {
      mergedByKey.set(controllerLaneKey(lane), {
        ...lane,
        points: lane.points.map((p) => ({ ...p }))
      });
    }

    const overlaidEventsByKey = new Map<string, MidiControllerEvent[]>();
    for (const other of overlapping) {
      const events = midiClipControllerEvents(
        other,
        bpm,
        baseClip.startMs,
        gridOffsetMs
      );
      for (const ev of events) {
        if (ev.timeMs > baseEndMs) continue;
        const key = controllerLaneKey(ev);
        const list = overlaidEventsByKey.get(key);
        if (list) list.push(ev);
        else overlaidEventsByKey.set(key, [ev]);
      }
    }
    if (overlaidEventsByKey.size === 0) return clip;

    // For any lane key that already exists on `baseClip`, sample its own events
    // onto the same timeline clock before interleaving the overlaid events.
    let baseEventsByKey: Map<string, MidiControllerEvent[]> | null = null;
    for (const [key, overlaid] of overlaidEventsByKey) {
      const existing = mergedByKey.get(key);
      let combined: MidiControllerEvent[];
      if (existing) {
        if (!baseEventsByKey) {
          baseEventsByKey = new Map();
          for (const ev of midiClipControllerEvents(
            baseClip,
            bpm,
            baseClip.startMs,
            gridOffsetMs
          )) {
            if (ev.timeMs > baseEndMs) continue;
            const k = controllerLaneKey(ev);
            const list = baseEventsByKey.get(k);
            if (list) list.push(ev);
            else baseEventsByKey.set(k, [ev]);
          }
        }
        combined = [...(baseEventsByKey.get(key) ?? []), ...overlaid].sort(
          (a, b) => a.timeMs - b.timeMs
        );
      } else {
        combined = overlaid.sort((a, b) => a.timeMs - b.timeMs);
      }

      const first = combined[0]!;
      const points: MidiControllerPoint[] = [];
      let seq = 0;
      for (const ev of combined) {
        const tick = Math.max(
          0,
          baseInTick + Math.round(msToTicks(ev.timeMs - baseClip.startMs, bpm))
        );
        const prev = points[points.length - 1];
        if (prev && prev.tick === tick) {
          prev.value = ev.value;
        } else {
          points.push({
            id: `merged:${key}:${seq++}`,
            tick,
            value: ev.value
          });
        }
      }
      const lane: MidiControllerLane = {
        id: existing?.id ?? `merged:${key}`,
        kind: first.kind,
        channel: first.channel,
        interpolation: "step",
        points
      };
      if (first.kind === "cc") lane.cc = first.cc ?? 0;
      if (first.kind === "polyPressure") lane.pitch = first.pitch ?? 0;
      mergedByKey.set(key, lane);
    }

    anyMerged = true;
    return {
      ...baseClip,
      controllers: [...mergedByKey.values()]
    } as C;
  });

  return anyMerged ? result : (clips as C[]);
}
