/**
 * Region loop (CE3, D47).
 *
 * A midi or audio clip with `loopLengthMs` below its `durationMs` plays the
 * window `[inPointMs, inPointMs + loopLengthMs)` over and over until the clip
 * ends. These helpers are the one place that rule lives: playback, export and
 * the clip drawing all read the loop through them. `loopLengthMs` is timeline
 * time. A midi clip reads it as content time (midi has no rate), and an audio
 * clip at speed `r` repeats `loopLengthMs * r` ms of source.
 */

import type {
  MidiControllerLane,
  MidiInstrument,
  MidiNote,
  MusicKey,
  StepKey,
  TimelineChord,
  TimelineClip
} from "./types.js";
import { curveValueAt, expressionUpTo } from "./midi/curveCut.js";
import { msToTicks, ticksToMs } from "./midi/ticks.js";
import { applyMidiRegionParams, bakeRegionQuantize } from "./midi/regionParams.js";
import { expandPattern, computeRowSegmentStates } from "./midi/stepPatternExpand.js";
import { sliceParamCurves } from "./paramCurves.js";
import { sourceRate } from "./sourceRate.js";
import { animationsForWindow } from "./splitClip.js";
import { activeLoopMs, loopRepeatCount, loopRepeatOffsets } from "./loopWindow.js";

export { activeLoopMs, loopRepeatCount, loopRepeatOffsets };

type MidiLoopClip = Pick<
  TimelineClip,
  | "notes"
  | "controllers"
  | "inPointMs"
  | "durationMs"
  | "loopLengthMs"
  | "transpose"
  | "velocityOffset"
  | "quantize"
> &
  Pick<
    Partial<TimelineClip>,
    "startMs" | "pattern" | "patternPhaseTicks" | "patternRowCycles"
  >;

/** Lanes whose value must not outlive a repeat: a held pedal and a bent pitch. */
const releasesAtRepeatEnd = (lane: MidiControllerLane): boolean =>
  lane.kind === "pitchBend" || (lane.kind === "cc" && lane.cc === 64);

/**
 * The notes and controller points one window of a clip shows, at their stored
 * ticks. The window starts at content tick `startTick` and lasts `lenTicks`.
 * A note that starts outside it is left out and one that crosses its end is cut
 * at the end, expression included. A lane that held a value from before the
 * window gets that value as a point at the window start.
 */
export function windowContent(
  clip: MidiLoopClip,
  bpm: number,
  startTick: number,
  lenTicks: number
): { notes: MidiNote[]; lanes: MidiControllerLane[] } {
  const inPointMs = clip.inPointMs ?? 0;
  const endTick = startTick + lenTicks;
  const inside = (tick: number): boolean =>
    ticksToMs(tick, bpm) >= inPointMs && tick < endTick;

  const notes: MidiNote[] = [];
  for (const n of clip.notes ?? []) {
    if (!inside(n.startTick)) continue;
    const durationTick = Math.min(n.durationTick, endTick - n.startTick);
    if (durationTick < 1) continue;
    const copy: MidiNote = { ...n, durationTick };
    if (n.expression) {
      const expression =
        durationTick < n.durationTick
          ? expressionUpTo(n.expression, durationTick)
          : structuredClone(n.expression);
      if (expression) copy.expression = expression;
      else delete copy.expression;
    }
    notes.push(copy);
  }

  const lanes = (clip.controllers ?? []).map((lane) => {
    const used = new Set(lane.points.map((p) => p.id));
    const fresh = (base: string): string => {
      let id = base;
      for (let n = 2; used.has(id); n += 1) id = `${base}${n}`;
      used.add(id);
      return id;
    };
    const points = lane.points.filter((p) => inside(p.tick));
    if (points.length === 0 || points[0]!.tick > startTick) {
      const held = curveValueAt(
        lane.points,
        startTick,
        lane.interpolation === "step"
      );
      if (held !== undefined) {
        points.unshift({
          id: fresh(`${lane.id}~c`),
          tick: startTick,
          value: Math.round(held)
        });
      }
    }
    // A ramp whose next point lies past the window end would otherwise stop at
    // its last inside point. End the window on the value the ramp reaches there.
    if (
      lane.interpolation !== "step" &&
      points.length > 0 &&
      points[points.length - 1]!.tick < endTick - 1 &&
      lane.points.some((p) => p.tick >= endTick)
    ) {
      const edge = curveValueAt(lane.points, endTick - 1, false);
      if (edge !== undefined) {
        points.push({ id: fresh(`${lane.id}~b`), tick: endTick - 1, value: Math.round(edge) });
      }
    }
    return { ...lane, points };
  });
  return { notes, lanes };
}

/**
 * The clip a player reads when it has no loop of its own: every repeat of the
 * window written out as notes and controller points, with `loopLengthMs`
 * removed. A note that crosses a repeat boundary ends at the boundary. Each
 * repeat starts with the controller values in force at the window start and
 * ends holding its last value, with a sustain pedal or a pitch bend released,
 * so nothing ramps or rings into the next repeat. A clip without a loop is
 * returned unchanged.
 *
 * Repeat `k` of note `id` is `id~k`. Repeat 0 keeps the original id.
 */
export interface ExpandMidiPatternDoc {
  chords?: ReadonlyArray<TimelineChord>;
  key?: StepKey | MusicKey;
}

export function expandMidiLoop<T extends MidiLoopClip>(
  source: T,
  bpm: number,
  gridOffsetMs = 0,
  instrument?: MidiInstrument,
  patternDoc?: ExpandMidiPatternDoc
): T {
  // Step Sequencer (SQ9, SQ17): a pattern region derives its notes and
  // controllers (including loop repeats) through `expandPattern`, then applies
  // CE6 region parameters in the exact same order as a plain MIDI clip.
  if (source.pattern) {
    const loopMs = activeLoopMs(source);
    const clipLengthTicks = Math.max(0, Math.round(msToTicks(source.durationMs, bpm)));
    const loopLengthTicks =
      loopMs !== undefined ? Math.max(1, Math.round(msToTicks(loopMs, bpm))) : undefined;
    const inPointTicks = Math.max(0, Math.round(msToTicks(source.inPointMs ?? 0, bpm)));
    const clipStartDocTick =
      source.startMs !== undefined
        ? Math.round(msToTicks(source.startMs - gridOffsetMs, bpm))
        : 0;
    const expanded = expandPattern(source.pattern, {
      clipLengthTicks,
      loopLengthTicks,
      patternPhaseTicks: (source.patternPhaseTicks ?? 0) + inPointTicks,
      rowCycles: source.patternRowCycles,
      clipStartDocTick,
      chords: patternDoc?.chords,
      key: patternDoc?.key,
      instrument
    });
    const materialized = {
      ...source,
      notes: expanded.notes,
      inPointMs: 0
    } as T;
    if (expanded.controllers.length > 0) {
      materialized.controllers = expanded.controllers;
    } else {
      delete materialized.controllers;
    }
    delete materialized.pattern;
    delete materialized.patternPhaseTicks;
    delete materialized.patternRowCycles;
    delete materialized.loopLengthMs;
    return applyMidiRegionParams(materialized, bpm, gridOffsetMs);
  }
  // CE6: the region parameters apply to the stored notes first, so each
  // repeat plays the parameter-adjusted notes. Quantize reads the tempo grid
  // (`gridOffsetMs` is `tempo.offsetMs`).
  const clip = applyMidiRegionParams(source, bpm, gridOffsetMs);
  const loopMs = activeLoopMs(clip);
  if (loopMs === undefined) return clip;
  const inPointMs = clip.inPointMs ?? 0;
  const startTick = Math.round(msToTicks(inPointMs, bpm));
  const loopTicks = msToTicks(loopMs, bpm);
  const repeats = loopRepeatCount(clip);
  const shiftOf = (k: number): number => Math.round(k * loopTicks);
  const totalTicks = Math.round(msToTicks(clip.durationMs, bpm));

  const notes: MidiNote[] = [];
  const lanes = new Map<string, MidiControllerLane>();
  for (let k = 0; k < repeats; k += 1) {
    const shift = shiftOf(k);
    // The last repeat may be partial: it ends with the clip.
    const lenTicks = Math.min(shiftOf(k + 1), totalTicks) - shift;
    if (lenTicks < 1) continue;
    const content = windowContent(clip, bpm, startTick, lenTicks);
    for (const n of content.notes) {
      const copy: MidiNote = { ...n, startTick: n.startTick + shift };
      if (k > 0) copy.id = `${n.id}~${k}`;
      notes.push(copy);
    }
    const lastTick = startTick + shift + lenTicks - 1;
    for (const lane of content.lanes) {
      const out =
        lanes.get(lane.id) ?? { ...lane, points: [] as MidiControllerLane["points"] };
      lanes.set(lane.id, out);
      const firstPoint = lane.points[0];
      if (
        k > 0 &&
        lane.interpolation !== "step" &&
        firstPoint !== undefined &&
        firstPoint.tick > startTick
      ) {
        // Repeat 0 holds the first value before its first point. A later repeat
        // would glide to it from the release at the end of the one before.
        out.points.push({
          id: `${lane.id}~a${k}`,
          tick: startTick + shift,
          value: firstPoint.value
        });
      }
      for (const p of lane.points) {
        out.points.push({
          ...p,
          tick: p.tick + shift,
          id: k > 0 ? `${p.id}~${k}` : p.id
        });
      }
      if (k === repeats - 1) continue;
      const last = out.points[out.points.length - 1];
      if (!last) continue;
      const release = releasesAtRepeatEnd(lane);
      const step = lane.interpolation === "step";
      if (last.tick >= lastTick) {
        // A pedal or bend still held on the last tick is released there.
        if (release && last.value !== 0) {
          if (!step && last.tick === lastTick && out.points.length > 1) {
            // A linear ramp that reaches its value on the last tick keeps it
            // one tick longer, then releases. Overwriting it would flatten it.
            out.points[out.points.length - 1] = { ...last, tick: lastTick - 1 };
            out.points.push({ id: `${lane.id}~e${k}`, tick: lastTick, value: 0 });
          } else {
            out.points[out.points.length - 1] = { ...last, value: 0 };
          }
        }
        continue;
      }
      const atEnd = curveValueAt(
        clip.controllers!.find((l) => l.id === lane.id)!.points,
        startTick + lenTicks,
        step
      );
      const value = release
        ? 0
        : atEnd === undefined
          ? last.value
          : Math.round(atEnd);
      // A linear lane would glide from its last point to the release. Hold the
      // value up to the tick before it.
      if (release && !step && last.value !== 0 && last.tick < lastTick - 1) {
        out.points.push({ id: `${lane.id}~h${k}`, tick: lastTick - 1, value: last.value });
      }
      if (value !== last.value || !step || release) {
        out.points.push({ id: `${lane.id}~e${k}`, tick: lastTick, value });
      }
    }
  }

  const next = { ...clip, notes } as T;
  if (clip.controllers && clip.controllers.length > 0) {
    next.controllers = clip.controllers.map((l) => lanes.get(l.id) ?? { ...l, points: [] });
  }
  delete next.loopLengthMs;
  return next;
}

export interface UnrollOptions {
  /** A fresh clip id for each copy after the first. */
  newId: () => string;
  /** `tempo.offsetMs`, the origin of the grid a region quantize snaps to. Default 0. */
  gridOffsetMs?: number;
}

/**
 * Write a looped clip out as plain clips, back to back. The first copy keeps
 * the original id and the later ones take `newId()`. Each copy plays the same
 * content window and holds only the content of that window. A clip without a
 * loop gives back itself. The caller decides which clip to edit next and puts
 * the copies into the document in one change.
 *
 * Only the first copy keeps the clip's fade-in and transition, and only the
 * last keeps its fade-out. A partial last audio copy ends its source window at
 * its own length. `periodMs` is the timeline length of one repeat,
 * `loopLengthMs`.
 */
export function unrollLoopedClip(
  source: TimelineClip,
  bpm: number,
  periodMs: number,
  options: UnrollOptions
): TimelineClip[] {
  const loopMs = activeLoopMs(source);
  if (loopMs === undefined) return [source];
  // A quantize is written into the notes first, at the clip's own place on the
  // tempo grid, so a copy plays what the looped clip played.
  const clip =
    source.mediaType === "midi" && !source.pattern
      ? bakeRegionQuantize(source, bpm, options.gridOffsetMs ?? 0)
      : source;
  const inPointMs = clip.inPointMs ?? 0;
  const copies: TimelineClip[] = [];
  const offsets = loopRepeatOffsets(clip, periodMs);
  const startTick = Math.round(msToTicks(inPointMs, bpm));
  const patternBasePhase =
    clip.mediaType === "midi" && clip.pattern
      ? (clip.patternPhaseTicks ?? 0) + Math.max(0, Math.round(msToTicks(inPointMs, bpm)))
      : 0;
  const patternSegmentRowCycles =
    clip.mediaType === "midi" && clip.pattern
      ? computeRowSegmentStates(
          clip.pattern,
          Math.max(0, Math.round(msToTicks(clip.durationMs, bpm))),
          Math.max(1, Math.round(msToTicks(periodMs, bpm))),
          patternBasePhase,
          clip.patternRowCycles
        )
      : undefined;
  offsets.forEach((offset, k) => {
    const copy = structuredClone(clip);
    delete copy.loopLengthMs;
    if (k > 0) {
      copy.id = options.newId();
      copy.locked = false;
      delete copy.linkId;
      delete copy.fadeInMs;
      delete copy.fadeInShape;
      delete copy.transitionIn;
    }
    if (k < offsets.length - 1) {
      delete copy.fadeOutMs;
      delete copy.fadeOutShape;
    }
    copy.startMs = clip.startMs + offset;
    copy.durationMs = Math.min(periodMs, clip.durationMs - offset);
    if (clip.animations) {
      // Each copy keeps the stretch of every animation that its own span shows.
      copy.animations = animationsForWindow(
        clip.animations,
        {
          offsetMs: offset,
          durationMs: copy.durationMs,
          totalMs: clip.durationMs,
          sourceFromMs: inPointMs,
          sourceToMs: inPointMs + copy.durationMs * sourceRate(clip)
        },
        k === 0
      );
    }
    if (clip.paramCurves && clip.durationMs > 0) {
      // A curve spans the whole looped clip, so each copy keeps its own part.
      copy.paramCurves = sliceParamCurves(
        clip.paramCurves,
        offset / clip.durationMs,
        (offset + copy.durationMs) / clip.durationMs,
        clip.durationMs
      );
    }
    if (clip.mediaType === "midi" && !clip.pattern) {
      const content = windowContent(
        clip,
        bpm,
        startTick,
        Math.round(msToTicks(copy.durationMs, bpm))
      );
      if (clip.notes) copy.notes = content.notes;
      if (clip.controllers) copy.controllers = content.lanes;
    } else if (clip.mediaType === "midi" && clip.pattern) {
      copy.inPointMs = 0;
      if (k === 0) {
        if (patternBasePhase > 0) copy.patternPhaseTicks = patternBasePhase;
        else delete copy.patternPhaseTicks;
      } else {
        // SQ10/SQ17: each loop repeat restarts rows at step 0, while
        // `patternRowCycles` preserves exact cycle offsets, `last` targets and
        // `wander` state across repeats (even for nonzero phases or non-dividing
        // loop periods).
        delete copy.patternPhaseTicks;
      }
      const rowCycles = patternSegmentRowCycles?.[k];
      if (rowCycles) copy.patternRowCycles = rowCycles;
      else delete copy.patternRowCycles;
      if (copy.outPointMs !== undefined) copy.outPointMs = copy.durationMs;
      delete copy.notes;
      delete copy.controllers;
    } else if (
      clip.mediaType === "audio" &&
      clip.outPointMs !== undefined &&
      copy.durationMs < periodMs
    ) {
      copy.outPointMs = inPointMs + copy.durationMs * sourceRate(clip);
    }
    copies.push(copy);
  });
  return copies;
}

/**
 * Replace each looped clip whose id is in `ids` with its plain copies, in
 * place in the list. The first copy keeps the id. Other clips are returned as
 * they are, and a list with no looped clip in `ids` comes back unchanged.
 */
export function unrollLoopedClips(
  clips: readonly TimelineClip[],
  ids: ReadonlySet<string>,
  bpm: number,
  newId: () => string,
  gridOffsetMs = 0
): TimelineClip[] {
  return clips.flatMap((clip) => {
    const loopMs = activeLoopMs(clip);
    if (!ids.has(clip.id) || loopMs === undefined) return [clip];
    return unrollLoopedClip(clip, bpm, loopMs, { newId, gridOffsetMs });
  });
}
