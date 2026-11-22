/**
 * `join_clips` (CE5, D52): join clips of one track into one clip.
 *
 * Midi clips join from the first start to the last end. Their windows are
 * written into one note list and one set of controller lanes, re-based to the
 * first clip's start. Audio clips join only as adjacent pieces of one source
 * with continuous source time. A looped clip is written out as plain copies
 * first (D47).
 */

import { windowContent } from "../clipLoop.js";
import { createTimeOrderedUuid } from "../defaults.js";
import { msToTicks } from "../midi/ticks.js";
import {
  applyMidiRegionParams,
  bakeRegionQuantize
} from "../midi/regionParams.js";
import { sortNotes } from "../midi/notes.js";
import { patternsEqual } from "../midi/stepPattern.js";
import {
  deriveTrackAutomationFromPatterns,
  expandPatternClip,
  rowSchedule
} from "../midi/stepPatternExpand.js";
import { resolveTempo } from "../midi/tempo.js";
import { sourceRate } from "../sourceRate.js";
import type {
  MediaTrack,
  MidiControllerLane,
  MidiNote,
  TimelineClip
} from "../types.js";
import { unrollLoopedInScope, type LoopScope } from "./loop.js";
import type { TimelineOp } from "./op.js";
import type { TimelineOpResult } from "./types.js";

export interface JoinScope extends LoopScope {
  mediaTracks: MediaTrack[];
}

/** Source times of adjacent audio pieces may differ by this much (ms). */
const TOLERANCE_MS = 1;

const NEEDS_BOUNCE = "needs bounce";

export function runJoinClips(
  scope: JoinScope,
  op: Extract<TimelineOp, { op: "join_clips" }>
): TimelineOpResult {
  const targets = op.clips ?? scope.state.selectedClipIds;
  const picked: TimelineClip[] = [];
  for (const target of targets) {
    const clip = scope.resolveClip(target);
    if (!picked.includes(clip)) picked.push(clip);
  }
  if (picked.length < 2) {
    throw new Error(
      "join_clips needs at least two clips. Send `clips`, or select two or more."
    );
  }
  const first = picked[0]!;
  if (first.mediaType !== "midi" && first.mediaType !== "audio") {
    throw new Error(
      `Clip "${first.name}" is a ${first.mediaType} clip. Only midi or audio clips join.`
    );
  }
  for (const clip of picked) {
    if (clip.mediaType !== first.mediaType) {
      throw new Error(
        `Cannot join "${first.name}" (${first.mediaType}) with "${clip.name}" (${clip.mediaType}). Join clips of one kind.`
      );
    }
    if (clip.trackId !== first.trackId) {
      throw new Error(
        `Cannot join "${first.name}" and "${clip.name}": they sit on different tracks. Join clips of one track.`
      );
    }
  }
  scope.assertWritable(picked);

  // A looped clip becomes plain copies first, in the same op (D47).
  const plain = picked.flatMap((clip) => unrollLoopedInScope(scope, clip));
  plain.sort((a, b) => a.startMs - b.startMs);
  const head = plain[0]!;
  const tempo = resolveTempo(scope.state);
  const bpm = tempo.bpm;
  const endMs = Math.max(...plain.map((c) => c.startMs + c.durationMs));
  const rest = plain.slice(1);

  let convertedPatternClipIds: string[] = [];
  if (head.mediaType === "midi") {
    const anyPattern = plain.some((c) => c.pattern !== undefined);
    const sameQuantize = (a: TimelineClip, b: TimelineClip): boolean =>
      JSON.stringify(a.quantize ?? null) === JSON.stringify(b.quantize ?? null);
    const sameRegionParams = (a: TimelineClip, b: TimelineClip): boolean =>
      (a.transpose ?? 0) === (b.transpose ?? 0) &&
      (a.velocityOffset ?? 0) === (b.velocityOffset ?? 0) &&
      sameQuantize(a, b);
    const effectivePhase = (c: TimelineClip): number =>
      (c.patternPhaseTicks ?? 0) + Math.max(0, Math.round(msToTicks(c.inPointMs ?? 0, bpm)));
    const isCycleInvariantPattern = (pat: NonNullable<TimelineClip["pattern"]>): boolean =>
      pat.rows.every(
        (r) =>
          r.playback !== "shuffle" &&
          r.playback !== "random" &&
          r.playback !== "wander" &&
          r.steps.every(
            (s) =>
              (s.chance === undefined || s.chance === 100) &&
              (!s.condition || s.condition.type === "always")
          )
      );
    const phaseContinuous = (prev: TimelineClip, next: TimelineClip): boolean => {
      if (
        (prev.patternRowCycles && Object.keys(prev.patternRowCycles).length > 0) ||
        (next.patternRowCycles && Object.keys(next.patternRowCycles).length > 0)
      ) {
        return false;
      }
      const prevPhase = effectivePhase(prev);
      const nextPhase = effectivePhase(next);
      const expected = prevPhase + Math.round(msToTicks(prev.durationMs, bpm));
      if (Math.abs(nextPhase - expected) <= 2) return true;
      if (nextPhase === 0 && head.pattern && isCycleInvariantPattern(head.pattern)) {
        return head.pattern.rows.every((r) => {
          const sched = rowSchedule(r, head.pattern!, 0);
          const cycLen = sched.reduce((sum, e) => sum + e.lengthTicks, 0);
          return cycLen <= 0 || expected % cycLen === 0;
        });
      }
      return false;
    };
    const allTouchingEqualPatterns =
      anyPattern &&
      plain.every((c) => c.pattern !== undefined) &&
      plain.every((c) => patternsEqual(head.pattern!, c.pattern!)) &&
      plain.every((c) => sameRegionParams(head, c)) &&
      plain.every(
        (c, i) =>
          i === 0 ||
          (Math.abs(c.startMs - (plain[i - 1]!.startMs + plain[i - 1]!.durationMs)) <=
            TOLERANCE_MS &&
            phaseContinuous(plain[i - 1]!, c))
      );

    if (allTouchingEqualPatterns) {
      // SQ24: touching phase-continuous equal pattern regions join into one pattern region.
      const headPhase = effectivePhase(head);
      if (headPhase > 0) head.patternPhaseTicks = headPhase;
      else delete head.patternPhaseTicks;
      delete head.notes;
      delete head.controllers;
    } else {
      if (anyPattern) {
        // SQ24: any other join with a pattern region converts each pattern
        // region to MIDI first inside the same op and reports it.
        const patternClipsToConvert = plain.filter((c) => c.pattern !== undefined);
        convertedPatternClipIds = patternClipsToConvert.map((c) => c.id);
        const track = scope.state.tracks.find((t) => t.id === head.trackId);
        if (
          track &&
          patternClipsToConvert.some((c) =>
            c.pattern?.rows.some(
              (r) =>
                r.assignment.type === "automation" &&
                r.assignment.target.kind === "device"
            )
          )
        ) {
          track.automation = deriveTrackAutomationFromPatterns(
            track,
            patternClipsToConvert,
            { tracks: scope.state.tracks, tempo }
          );
        }
        for (const c of plain) {
          if (!c.pattern) continue;
          const expanded = expandPatternClip(c, {
            tracks: scope.state.tracks,
            tempo
          });
          c.notes = expanded?.notes ?? [];
          if (expanded && expanded.controllers.length > 0) {
            c.controllers = expanded.controllers;
          } else {
            delete c.controllers;
          }
          c.inPointMs = 0;
          delete c.pattern;
          delete c.patternPhaseTicks;
          delete c.patternRowCycles;
          delete c.loopLengthMs;
        }
      }
      // CE6: a quantize is written into each clip's notes at its own place on
      // the tempo grid first, so the joined clip plays what the parts played.
      // Shared transpose and velocity stay on the joined clip. Different ones
      // are written into each clip's notes too, so every part sounds the same.
      const baked = plain.map((c) => bakeRegionQuantize(c, bpm, tempo.offsetMs));
      const sameParams = baked.every(
        (c) =>
          (c.transpose ?? 0) === (baked[0]!.transpose ?? 0) &&
          (c.velocityOffset ?? 0) === (baked[0]!.velocityOffset ?? 0)
      );
      const parts = sameParams
        ? baked
        : baked.map((c) => applyMidiRegionParams(c, bpm, tempo.offsetMs));
      joinMidi(head, parts, bpm);
      delete head.quantize;
      if (!sameParams) {
        delete head.transpose;
        delete head.velocityOffset;
      }
    }
  } else {
    joinAudio(head, plain);
  }
  head.durationMs = endMs - head.startMs;
  if (head.mediaType === "midi") {
    head.inPointMs = 0;
    if (head.outPointMs !== undefined) head.outPointMs = head.durationMs;
  }

  const removed = new Set(rest.map((c) => c.id));
  scope.clips.splice(
    0,
    scope.clips.length,
    ...scope.clips.filter((c) => !removed.has(c.id))
  );
  scope.mediaTracks = scope.mediaTracks.filter(
    (t) => t.clipId === undefined || !removed.has(t.clipId)
  );
  const state = scope.state;
  state.selectedClipIds = [
    head.id,
    ...state.selectedClipIds.filter((id) => id !== head.id && !removed.has(id))
  ];
  scope.touch(head.id, ...removed);
  return {
    ok: true,
    clip: scope.clipOut(head),
    joined: plain.length,
    removedClipIds: [...removed],
    ...(convertedPatternClipIds.length > 0
      ? { convertedToMidi: true, convertedPatternClipIds }
      : {})
  };
}

function joinMidi(
  head: TimelineClip,
  clips: readonly TimelineClip[],
  bpm: number
): void {
  const notes: MidiNote[] = [];
  const lanes = new Map<string, MidiControllerLane>();
  const seenNotes = new Set<string>();
  const seenPoints = new Set<string>();
  for (const clip of clips) {
    const startTick = Math.round(msToTicks(clip.inPointMs ?? 0, bpm));
    const lenTicks = Math.round(msToTicks(clip.durationMs, bpm));
    const content = windowContent(clip, bpm, startTick, lenTicks);
    // Window start tick -> the clip's place after the first clip's start.
    const shift = Math.round(msToTicks(clip.startMs - head.startMs, bpm)) - startTick;
    for (const n of content.notes) {
      const id = seenNotes.has(n.id) ? createTimeOrderedUuid() : n.id;
      seenNotes.add(id);
      notes.push({ ...n, id, startTick: n.startTick + shift });
    }
    for (const lane of content.lanes) {
      const key = `${lane.kind}:${lane.cc ?? ""}:${lane.pitch ?? ""}:${lane.channel ?? 0}`;
      let merged = lanes.get(key);
      if (!merged) {
        merged = { ...lane, points: [] };
        lanes.set(key, merged);
      }
      for (const p of lane.points) {
        const id = seenPoints.has(p.id) ? createTimeOrderedUuid() : p.id;
        seenPoints.add(id);
        merged.points.push({ ...p, id, tick: p.tick + shift });
      }
    }
  }
  const hadNotes = clips.some((c) => c.notes !== undefined);
  const hadLanes = clips.some((c) => c.controllers !== undefined);
  if (hadNotes) head.notes = sortNotes(notes);
  if (hadLanes) {
    head.controllers = [...lanes.values()].map((lane) => ({
      ...lane,
      points: lane.points.sort((a, b) => a.tick - b.tick)
    }));
  }
}

function joinAudio(head: TimelineClip, clips: readonly TimelineClip[]): void {
  const refuse = (a: TimelineClip, b: TimelineClip, why: string): never => {
    throw new Error(
      `Cannot join "${a.name}" and "${b.name}": ${why}. This join ${NEEDS_BOUNCE}.`
    );
  };
  for (let i = 1; i < clips.length; i += 1) {
    const prev = clips[i - 1]!;
    const next = clips[i]!;
    if (
      prev.sourceType !== "imported" ||
      next.sourceType !== "imported" ||
      !prev.currentAssetId ||
      prev.currentAssetId !== next.currentAssetId
    ) {
      refuse(prev, next, "they do not play one imported source");
    }
    const rate = sourceRate(prev);
    if (Math.abs(rate - sourceRate(next)) > 1e-9 || prev.volumeDb !== next.volumeDb) {
      refuse(prev, next, "their speed or gain differ");
    }
    if (Math.abs(next.startMs - (prev.startMs + prev.durationMs)) > TOLERANCE_MS) {
      refuse(prev, next, "they are not adjacent on the timeline");
    }
    const expectedIn = (prev.inPointMs ?? 0) + prev.durationMs * rate;
    if (Math.abs((next.inPointMs ?? 0) - expectedIn) > TOLERANCE_MS) {
      refuse(prev, next, "their source time is not continuous");
    }
  }
  const last = clips[clips.length - 1]!;
  if (head.outPointMs !== undefined && last.outPointMs !== undefined) {
    head.outPointMs = last.outPointMs;
  }
  if (last.fadeOutMs !== undefined) head.fadeOutMs = last.fadeOutMs;
  else delete head.fadeOutMs;
  if (last.fadeOutShape !== undefined) head.fadeOutShape = last.fadeOutShape;
  else delete head.fadeOutShape;
}
