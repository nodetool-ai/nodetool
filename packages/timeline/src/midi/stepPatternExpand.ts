/**
 * Step Sequencer pure timing, hashing, scheduling, pitch resolution and
 * expansion (SQ6, SQ9–SQ19, SQ41–SQ42, SQ60).
 *
 * Pure and deterministic: no `Math.random`, no external runtime dependencies.
 * Every function and vector here is mirrored in C++ `PatternExpand` for native
 * parity (D104).
 */

import {
  automationBreakpoints,
  automationModeOf,
  automationModePlays,
  automationValueAt,
  isAutomationLaneActive
} from "../automation.js";
import { chordAtTick, CHORD_QUALITIES } from "../harmony/chords.js";
import { chordTrackFor } from "../harmony/expand.js";
import { chordScale, remapNote, scaleMask, scaleRemap, SCALES } from "../harmony/scales.js";
import { activeLoopMs } from "../clipLoop.js";
import type {
  AutomationLane,
  AutomationPoint,
  HarmonyScaleId,
  MidiControllerKind,
  MidiControllerLane,
  MidiInstrument,
  MidiNote,
  MusicKey,
  PatternRowCycleState,
  Step,
  StepAutomationMode,
  StepCondition,
  StepDegree,
  StepKey,
  StepPattern,
  StepPlaybackMode,
  StepRate,
  StepRow,
  StepSwingDivision,
  TimelineChord,
  TimelineClip,
  TimelineTempo,
  TimelineTrack
} from "../types.js";
import { controllerValueRange } from "./controllers.js";
import { sortNotes } from "./notes.js";
import { resolveTempo } from "./tempo.js";
import { MIDI_PPQ, msToTicks, ticksToMs } from "./ticks.js";
import type { FramePoint } from "./voice.js";

/** All 22 Step Sequencer step rates (SQ6). */
export const STEP_RATES: readonly StepRate[] = [
  "4", "2", "1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64",
  "1T", "2T", "4T", "8T", "16T", "32T",
  "1D", "2D", "4D", "8D", "16D", "32D", "64D"
];

const STEP_RATE_TICKS: Readonly<Record<StepRate, number>> = {
  "4": 15360,
  "2": 7680,
  "1": 3840,
  "1/2": 1920,
  "1/4": 960,
  "1/8": 480,
  "1/16": 240,
  "1/32": 120,
  "1/64": 60,
  "1T": 2560,
  "2T": 1280,
  "4T": 640,
  "8T": 320,
  "16T": 160,
  "32T": 80,
  "1D": 5760,
  "2D": 2880,
  "4D": 1440,
  "8D": 720,
  "16D": 360,
  "32D": 180,
  "64D": 90
};

/** Step rates ordered by ascending tick length (60..15360) for increment/decrement (SQ6). */
export const STEP_RATES_BY_TICKS: readonly StepRate[] = [...STEP_RATES].sort(
  (a, b) => STEP_RATE_TICKS[a] - STEP_RATE_TICKS[b]
);

/** Length of one step at `rate` in integer ticks at MIDI_PPQ = 960 (SQ6, SQ60). */
export function stepRateTicks(rate: StepRate): number {
  const ticks = STEP_RATE_TICKS[rate];
  if (ticks === undefined) {
    throw new Error(
      `Unknown stepRate "${String(rate)}". Valid values: ${STEP_RATES.join(", ")}.`
    );
  }
  return ticks;
}

/** Move `rate` by `delta` steps along tick-ordered `STEP_RATES_BY_TICKS` (clamped). */
export function nudgeStepRate(rate: StepRate, delta: number): StepRate {
  const idx = STEP_RATES_BY_TICKS.indexOf(rate);
  if (idx < 0) return rate;
  const next = Math.max(0, Math.min(STEP_RATES_BY_TICKS.length - 1, idx + Math.trunc(delta)));
  return STEP_RATES_BY_TICKS[next]!;
}

// ── Deterministic hashing (SQ13, SQ60) ──────────────────────────────────────

/** 32-bit FNV-1a over a byte sequence. */
export function fnv1a32Bytes(bytes: ReadonlyArray<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]! & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 32-bit FNV-1a of a UTF-8 row id string (SQ13). */
export function rowKeyHash(rowId: string): number {
  const bytes: number[] = [];
  for (let i = 0; i < rowId.length; i++) {
    const code = rowId.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < rowId.length) {
      const low = rowId.charCodeAt(++i);
      const cp = 0x10000 + (((code & 0x3ff) << 10) | (low & 0x3ff));
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return fnv1a32Bytes(bytes);
}

/** 32-bit FNV-1a over four little-endian uint32 values (SQ60). */
export function fnv1a32Uints(a: number, b: number, c: number, d: number): number {
  const u = [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
  let h = 0x811c9dc5;
  for (let k = 0; k < 4; k++) {
    const v = u[k]!;
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Single mulberry32 step returning a float in [0, 1). */
export function mulberry32(state: number): number {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Deterministic hash in [0, 1) for chance, wander, shuffle and random modes (SQ13, SQ60).
 * Accepts either a pre-hashed uint32 `rowKey` or a row id string.
 */
export function stepHash(
  seed: number,
  rowKey: number | string,
  step: number,
  cycle: number
): number {
  const rk = typeof rowKey === "string" ? rowKeyHash(rowKey) : rowKey >>> 0;
  return mulberry32(fnv1a32Uints(seed >>> 0, rk, step >>> 0, cycle >>> 0));
}

// ── Playback order, scheduling, swing and note repeat (SQ10–SQ15, SQ60) ─────

const PLAY_ORDER_SALT_SHUFFLE = 0x51a7f1e1;
const PLAY_ORDER_SALT_RANDOM = 0x72616e64;
const PLAY_ORDER_SALT_WANDER = 0x77616e64;

function wanderCycle(
  n: number,
  wSeed: number,
  rowKey: number | string,
  cycle: number,
  startPos: number,
  startAtZero: boolean
): number[] {
  const out: number[] = [];
  let pos = startPos;
  if (startAtZero) {
    out.push(pos);
    for (let i = 1; i < n; i++) {
      const dir = stepHash(wSeed, rowKey, i, cycle) < 0.5 ? -1 : 1;
      pos = (pos + dir + n) % n;
      out.push(pos);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const dir = stepHash(wSeed, rowKey, i, cycle) < 0.5 ? -1 : 1;
      pos = (pos + dir + n) % n;
      out.push(pos);
    }
  }
  return out;
}

/** Step indices visited during one cycle of `n` active steps (SQ11, SQ60). */
export function playOrder(
  n: number,
  mode: StepPlaybackMode,
  seed: number,
  cycle: number,
  rowKey: number | string = 0,
  prevPos?: number
): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  switch (mode) {
    case "forward":
      return Array.from({ length: n }, (_, i) => i);
    case "backward":
      return Array.from({ length: n }, (_, i) => n - 1 - i);
    case "pingPong": {
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push(i);
      for (let i = n - 1; i >= 0; i--) out.push(i);
      return out;
    }
    case "pendulum": {
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push(i);
      for (let i = n - 2; i >= 1; i--) out.push(i);
      return out;
    }
    case "shuffle": {
      const sSeed = (seed ^ PLAY_ORDER_SALT_SHUFFLE) >>> 0;
      const arr = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(stepHash(sSeed, rowKey, i, cycle) * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      return arr;
    }
    case "random": {
      const rSeed = (seed ^ PLAY_ORDER_SALT_RANDOM) >>> 0;
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        out.push(Math.floor(stepHash(rSeed, rowKey, i, cycle) * n));
      }
      return out;
    }
    case "wander": {
      const wSeed = (seed ^ PLAY_ORDER_SALT_WANDER) >>> 0;
      if (cycle <= 0) return wanderCycle(n, wSeed, rowKey, 0, 0, true);
      if (prevPos !== undefined) {
        return wanderCycle(n, wSeed, rowKey, cycle, ((prevPos % n) + n) % n, false);
      }
      let pos = 0;
      for (let c = 0; c < cycle; c++) {
        const ord = wanderCycle(n, wSeed, rowKey, c, pos, c === 0);
        pos = ord[ord.length - 1]!;
      }
      return wanderCycle(n, wSeed, rowKey, cycle, pos, false);
    }
  }
}

export interface RowScheduleEntry {
  stepIndex: number;
  startTick: number;
  lengthTicks: number;
}

/**
 * One cycle's played steps for `row`, in cycle-local ticks starting at 0 (SQ10, SQ60).
 * Skipped steps take no time and are omitted.
 */
export function rowSchedule(
  row: Pick<StepRow, "id" | "loopStart" | "loopEnd" | "stepRate" | "playback" | "steps" | "lengthSteps">,
  pattern: Pick<StepPattern, "seed">,
  cycle = 0
): RowScheduleEntry[] {
  const start = Math.max(0, Math.min(row.steps.length, row.loopStart));
  const end = Math.max(start, Math.min(row.steps.length, row.loopEnd));
  const active: number[] = [];
  for (let i = start; i < end; i++) {
    if (!row.steps[i]?.skip) active.push(i);
  }
  if (active.length === 0) return [];
  const order = playOrder(active.length, row.playback, pattern.seed, cycle, rowKeyHash(row.id));
  const out: RowScheduleEntry[] = [];
  let cursor = 0;
  for (const pos of order) {
    const stepIndex = active[pos]!;
    const step = row.steps[stepIndex];
    const lengthTicks = stepRateTicks(step?.stepRate ?? row.stepRate);
    out.push({ stepIndex, startTick: cursor, lengthTicks });
    cursor += lengthTicks;
  }
  return out;
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Musical length of `pattern` in ticks: LCM of non-random row cycle lengths,
 * capped at 64 bars (SQ10).
 */
export function patternMusicalLengthTicks(
  pattern: Pick<StepPattern, "seed" | "lengthSteps" | "stepRate" | "rows">,
  barTicks = 4 * MIDI_PPQ
): number {
  const cap = BigInt(Math.max(1, Math.round(64 * barTicks)));
  let acc = 0n;
  for (const row of pattern.rows) {
    if (row.playback === "random") continue;
    const sched = rowSchedule(row, pattern, 0);
    const cycleLen = sched.reduce((sum, e) => sum + e.lengthTicks, 0);
    if (cycleLen <= 0) continue;
    const len = BigInt(cycleLen);
    if (acc === 0n) {
      acc = len;
    } else {
      const g = gcdBig(acc, len);
      acc = (acc / g) * len;
    }
    if (acc >= cap) return Number(cap);
  }
  if (acc === 0n) {
    return Math.min(Number(cap), Math.max(1, pattern.lengthSteps) * stepRateTicks(pattern.stepRate));
  }
  return Number(acc);
}

/** Swing delay in ticks for a step starting at `tick` from the pattern start (SQ14, SQ60). */
export function swingDelay(
  tick: number,
  division: StepSwingDivision,
  swing: number
): number {
  if (swing <= 0) return 0;
  const divTicks = stepRateTicks(division);
  if (tick < 0 || tick % divTicks !== 0) return 0;
  const slot = Math.floor(tick / divTicks);
  if (slot % 2 !== 1) return 0;
  return Math.round((divTicks * swing) / 200);
}

/** Start offsets (in ticks from step start) of N note repeats inside length T (SQ15, SQ60). */
export function repeatPositions(
  totalTicks: number,
  repeat: number,
  distribution: number
): number[] {
  const n = Math.max(1, Math.round(repeat));
  if (n === 1) return [0];
  const exponent = Math.pow(2, -distribution / 100);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    out.push(Math.round(totalTicks * Math.pow(k / n, exponent)));
  }
  return out;
}

/** Velocities (1..127) of N note repeats with velocityRamp and velocityCurve (SQ15, SQ60). */
export function repeatVelocities(
  velocity: number,
  repeat: number,
  velocityRamp: number,
  velocityCurve: number
): number[] {
  const n = Math.max(1, Math.round(repeat));
  const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));
  if (n === 1) return [clampVel(velocity)];
  const curveExp = Math.pow(2, velocityCurve / 50);
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    const scaled = velocity * (1 + (velocityRamp / 100) * Math.pow(x, curveExp));
    out.push(clampVel(scaled));
  }
  return out;
}

// ── Pitch resolution (SQ4, SQ18, SQ19, SQ42, SQ60) ──────────────────────────

const TONIC_TO_PC: Readonly<Record<string, number>> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
};

/** Convert a document `MusicKey` (string tonic) or `StepKey` to `StepKey`. */
export function resolveStepKey(key: StepKey | MusicKey | undefined): StepKey {
  if (!key) return { tonic: 0, mode: "major" };
  if (typeof key.tonic === "number") {
    return {
      tonic: ((Math.round(key.tonic) % 12) + 12) % 12,
      mode: key.mode
    };
  }
  return { tonic: TONIC_TO_PC[key.tonic] ?? 0, mode: key.mode };
}

/** Signed shortest semitone interval from `fromTonic` to `toTonic` in [-5, +6]. */
export function shortestTonicDelta(fromTonic: number, toTonic: number): number {
  let d = (((toTonic - fromTonic) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

function degreeSemitones(
  degree: StepDegree,
  chord: Pick<TimelineChord, "root" | "quality">,
  keyMask: number
): number {
  const iv = CHORD_QUALITIES[chord.quality].iv as readonly number[];
  const mods = iv.map((x) => ((x % 12) + 12) % 12);
  const scaleId = chordScale(chord, keyMask);
  const scaleIv = SCALES[scaleId].iv as readonly number[];
  const findIn = (candidates: readonly number[]): number | undefined =>
    candidates.find((c) => mods.includes(c));
  switch (degree) {
    case "root":
      return 0;
    case "2nd":
      return findIn([2, 1]) ?? scaleIv[1] ?? 2;
    case "3rd":
      return findIn([4, 3]) ?? scaleIv[2] ?? 4;
    case "4th":
      return findIn([5, 6]) ?? scaleIv[3] ?? 5;
    case "5th":
      return findIn([7, 6, 8]) ?? scaleIv[4] ?? 7;
    case "6th":
      return findIn([9, 8]) ?? scaleIv[5] ?? 9;
    case "7th":
      if (chord.quality === "dim7") return 9;
      return findIn([10, 11]) ?? scaleIv[6] ?? 10;
  }
}

export interface StepPitchContext {
  pattern?: Pick<StepPattern, "pitchSource" | "key" | "scale" | "noTranspose" | "scaleQuantize">;
  chords?: ReadonlyArray<TimelineChord>;
  docTick?: number;
  key?: StepKey | MusicKey;
  instrument?: MidiInstrument;
}

/** MIDI note number of pad `pad` on `instrument` (SQ4, SQ42). */
export function kitPadPitch(pad: number, instrument?: MidiInstrument): number {
  if (instrument?.type === "drum") {
    return Math.max(0, Math.min(127, instrument.baseNote + pad));
  }
  if (instrument?.type === "sampler") {
    const zone = instrument.zones[pad];
    if (zone) return Math.max(0, Math.min(127, zone.rootNote));
  }
  return Math.max(0, Math.min(127, 36 + pad));
}

/**
 * Resolve the MIDI pitch for `step` on `row`, or `null` when the row produces
 * no note (automation row, or a degree row with no sounding chord).
 * Octave convention (D80, SQ60): C of octave `n` is `(n + 2) * 12` (C3 = 60).
 */
export function stepPitch(
  row: Pick<StepRow, "assignment">,
  step: Pick<Step, "note" | "octave">,
  ctx: StepPitchContext = {}
): number | null {
  const assign = row.assignment;
  if (assign.type === "automation") return null;

  if (assign.type === "kit") {
    return kitPadPitch(assign.pad, ctx.instrument);
  }

  const pattern = ctx.pattern;
  const patternKey = resolveStepKey(pattern?.key);
  const projectKey = resolveStepKey(ctx.key ?? pattern?.key);
  const activeKey = pattern?.pitchSource === "key" ? projectKey : patternKey;

  let pitch: number;
  if (assign.type === "degree") {
    if (pattern && pattern.pitchSource !== "chords") return null;
    const chord = ctx.chords ? chordAtTick(ctx.chords, ctx.docTick ?? 0) : undefined;
    if (!chord) return null;
    const keyMask = scaleMask(activeKey.tonic, activeKey.mode);
    const semi = degreeSemitones(assign.degree, chord, keyMask);
    const octave = step.octave ?? assign.octave;
    pitch = (octave + 2) * 12 + chord.root + semi + (step.note ?? 0);
  } else {
    const basePitch = assign.pitch;
    const pc = ((basePitch % 12) + 12) % 12;
    const base = step.octave !== undefined ? (step.octave + 2) * 12 + pc : basePitch;
    pitch = base + (step.note ?? 0);
    if (pattern?.pitchSource === "key" && !pattern.noTranspose) {
      pitch += shortestTonicDelta(patternKey.tonic, projectKey.tonic);
    }
    if (pattern?.scaleQuantize) {
      const scaleId: HarmonyScaleId | "chromatic" =
        pattern.scale !== "chromatic"
          ? pattern.scale
          : pattern.pitchSource === "key"
            ? activeKey.mode
            : "chromatic";
      if (scaleId !== "chromatic") {
        const table = scaleRemap(scaleMask(activeKey.tonic, scaleId), 0);
        pitch = remapNote(table, pitch);
      }
    }
  }

  return Math.max(0, Math.min(127, Math.round(pitch)));
}

/** Pitch bend in semitones for a kit row step (SQ42, D90). */
export function kitStepPitchBend(
  padPitch: number,
  step: Pick<Step, "note" | "octave">
): number {
  const baseOctave = Math.floor(padPitch / 12) - 2;
  const octShift = step.octave !== undefined ? (step.octave - baseOctave) * 12 : 0;
  return Math.max(-48, Math.min(48, Math.round((step.note ?? 0) + octShift)));
}

// ── Pattern expansion (SQ9–SQ19, SQ41–SQ42, SQ60) ───────────────────────────

export interface DerivedDeviceAutomationLane {
  rowId: string;
  target: { kind: "device"; deviceId: string; param: string };
  automationMode: StepAutomationMode;
  /** Content ticks and numeric values inside the clip window. */
  points: Array<{ tick: number; value: number }>;
}

export interface ExpandPatternContext {
  clipLengthTicks: number;
  loopLengthTicks?: number;
  patternPhaseTicks?: number;
  /** Per-row cycle state carried across unrolled loop repeats (SQ13, SQ25). */
  rowCycles?: Readonly<Record<string, PatternRowCycleState>>;
  /** Document tick corresponding to clip content tick 0 (for chords). Default 0. */
  clipStartDocTick?: number;
  chords?: ReadonlyArray<TimelineChord>;
  key?: StepKey | MusicKey;
  instrument?: MidiInstrument;
}

export interface ExpandPatternResult {
  notes: MidiNote[];
  controllers: MidiControllerLane[];
  deviceAutomation: DerivedDeviceAutomationLane[];
}

function conditionPasses(
  condition: StepCondition | undefined,
  cycle: number,
  lastCycle: number
): boolean {
  if (!condition || condition.type === "always") return true;
  switch (condition.type) {
    case "first":
      return cycle === 0;
    case "last":
      return cycle === lastCycle;
    case "recurrence":
      return cycle % condition.cycles === condition.iteration - 1;
  }
}

interface Segment {
  segIdx: number;
  segStart: number;
  segEnd: number;
  segLen: number;
  phase: number;
}

interface ScheduledOccurrence {
  stepIndex: number;
  step: Step;
  rawStartTick: number;
  lengthTicks: number;
  cycle: number;
}

function buildSegments(
  clipLengthTicks: number,
  loopLengthTicks: number | undefined,
  patternPhaseTicks: number
): Segment[] {
  const total = Math.max(0, Math.round(clipLengthTicks));
  if (total <= 0) return [];
  const phase = Math.max(0, Math.round(patternPhaseTicks));
  const hasLoop =
    loopLengthTicks !== undefined &&
    Number.isFinite(loopLengthTicks) &&
    loopLengthTicks > 0 &&
    loopLengthTicks < total;
  if (!hasLoop) {
    return [{ segIdx: 0, segStart: 0, segEnd: total, segLen: total, phase }];
  }
  const loopLen = Math.max(1, Math.round(loopLengthTicks));
  const out: Segment[] = [];
  for (let r = 0; r * loopLen < total; r++) {
    const segStart = r * loopLen;
    const segEnd = Math.min((r + 1) * loopLen, total);
    out.push({
      segIdx: r,
      segStart,
      segEnd,
      segLen: segEnd - segStart,
      phase: r === 0 ? phase : 0
    });
  }
  return out;
}

function rowSegmentOccurrences(
  row: StepRow,
  pattern: StepPattern,
  segments: readonly Segment[],
  rowState?: PatternRowCycleState
): {
  perSegment: ScheduledOccurrence[][];
  lastCycle: number;
  segmentStarts: PatternRowCycleState[];
  segmentLocalLastCycles: number[];
} {
  const start = Math.max(0, Math.min(row.steps.length, row.loopStart));
  const end = Math.max(start, Math.min(row.steps.length, row.loopEnd));
  const active: number[] = [];
  let maxNegPull = 0;
  for (let i = start; i < end; i++) {
    const st = row.steps[i];
    if (st?.skip) continue;
    active.push(i);
    const off = st?.offset ?? 0;
    if (off < 0) {
      const len = stepRateTicks(st?.stepRate ?? row.stepRate);
      const pull = -Math.round((off / 100) * len);
      if (pull > maxNegPull) maxNegPull = pull;
    }
  }
  if (active.length === 0) {
    return {
      perSegment: segments.map(() => []),
      lastCycle: rowState?.lastCycle ?? -1,
      segmentStarts: segments.map(() => ({ cycleOffset: rowState?.cycleOffset ?? 0 })),
      segmentLocalLastCycles: segments.map(() => -1)
    };
  }
  const rk = rowKeyHash(row.id);
  const perSegment: ScheduledOccurrence[][] = [];
  const segmentStarts: PatternRowCycleState[] = [];
  const segmentLocalLastCycles: number[] = [];
  let cycle = rowState?.cycleOffset ?? 0;
  let lastCycle = -1;
  let prevWanderPos: number | undefined = rowState?.wanderPos;
  for (const seg of segments) {
    const segmentStart: PatternRowCycleState = { cycleOffset: cycle };
    if (row.playback === "wander" && prevWanderPos !== undefined) {
      segmentStart.wanderPos = prevWanderPos;
    }
    segmentStarts.push(segmentStart);
    const limit = seg.phase + seg.segLen;
    // For an unlooped clip, look ahead enough for a negative-offset step on the
    // next pass to pull into the end of this window (SQ23 split continuity).
    const passLimit = segments.length === 1 ? limit + maxNegPull : limit;
    const occs: ScheduledOccurrence[] = [];
    let passStart = 0;
    let safety = 0;
    let segLastCycle = -1;
    while (passStart < passLimit && safety < 16384) {
      safety++;
      const order = playOrder(
        active.length,
        row.playback,
        pattern.seed,
        cycle,
        rk,
        prevWanderPos
      );
      if (order.length === 0) break;
      prevWanderPos = order[order.length - 1];
      let cursor = 0;
      if (passStart < limit) {
        lastCycle = cycle;
        segLastCycle = cycle;
      }
      for (const pos of order) {
        const stepIndex = active[pos]!;
        const step = row.steps[stepIndex] ?? {};
        const lengthTicks = stepRateTicks(step.stepRate ?? row.stepRate);
        occs.push({
          stepIndex,
          step,
          rawStartTick: passStart + cursor,
          lengthTicks,
          cycle
        });
        cursor += lengthTicks;
      }
      if (cursor <= 0) break;
      passStart += cursor;
      cycle += 1;
    }
    perSegment.push(occs);
    segmentLocalLastCycles.push(segLastCycle);
  }
  return {
    perSegment,
    lastCycle: rowState?.lastCycle ?? lastCycle,
    segmentStarts,
    segmentLocalLastCycles
  };
}

/**
 * Compute per-segment row cycle states for unrolling a looped pattern clip so
 * every unrolled repeat preserves cycle indices, `last` conditions and `wander`
 * continuity even for nonzero phases or loop periods that do not divide every
 * row cycle (SQ13, SQ25).
 */
export function computeRowSegmentStates(
  pattern: StepPattern,
  clipLengthTicks: number,
  loopLengthTicks: number | undefined,
  patternPhaseTicks: number,
  initialRowCycles?: Readonly<Record<string, PatternRowCycleState>>
): Array<Record<string, PatternRowCycleState> | undefined> {
  const segments = buildSegments(clipLengthTicks, loopLengthTicks, patternPhaseTicks);
  const perSeg: Array<Record<string, PatternRowCycleState>> = segments.map(() => ({}));
  for (const row of pattern.rows) {
    const initial = initialRowCycles?.[row.id];
    const hasLast = row.steps.some((s) => s.condition?.type === "last");
    const cycleDependent =
      initial !== undefined ||
      row.playback === "shuffle" ||
      row.playback === "random" ||
      row.playback === "wander" ||
      row.steps.some(
        (s) =>
          (s.chance !== undefined && s.chance < 100) ||
          (s.condition !== undefined && s.condition.type !== "always")
      );
    if (!cycleDependent) continue;
    const { lastCycle, segmentStarts, segmentLocalLastCycles } = rowSegmentOccurrences(
      row,
      pattern,
      segments,
      initial
    );
    for (let s = 0; s < segments.length; s++) {
      const start = segmentStarts[s]!;
      const localLast = segmentLocalLastCycles[s]!;
      const needsLast = hasLast && lastCycle >= 0 && lastCycle !== localLast;
      const needsWander = row.playback === "wander" && start.wanderPos !== undefined;
      if (start.cycleOffset > 0 || needsLast || needsWander) {
        const state: PatternRowCycleState = { cycleOffset: start.cycleOffset };
        if (needsLast) state.lastCycle = lastCycle;
        if (needsWander) state.wanderPos = start.wanderPos;
        perSeg[s]![row.id] = state;
      }
    }
  }
  return perSeg.map((rec) => (Object.keys(rec).length > 0 ? rec : undefined));
}

function defaultAutomationValue(target: Extract<StepRow["assignment"], { type: "automation" }>["target"]): number {
  if (target.kind === "cc" && target.cc === 10) return 64;
  return 0;
}

/**
 * Expand `pattern` into MIDI notes, controller lanes and derived device
 * automation lanes in clip content ticks `[0, clipLengthTicks)` (SQ9–SQ19, SQ41–SQ42).
 */
export function expandPattern(
  pattern: StepPattern,
  ctx: ExpandPatternContext
): ExpandPatternResult {
  const segments = buildSegments(
    ctx.clipLengthTicks,
    ctx.loopLengthTicks,
    ctx.patternPhaseTicks ?? 0
  );
  if (segments.length === 0 || pattern.rows.length === 0) {
    return { notes: [], controllers: [], deviceAutomation: [] };
  }

  const hasSolo = pattern.rows.some((r) => r.solo);
  const clipStartDocTick = ctx.clipStartDocTick ?? 0;
  const notes: MidiNote[] = [];
  const controllerMap = new Map<string, MidiControllerLane>();
  const deviceAutomation: DerivedDeviceAutomationLane[] = [];

  for (const row of pattern.rows) {
    const muted = row.mute || (hasSolo && !row.solo);
    if (muted) continue;

    const rowKey = rowKeyHash(row.id);
    const { perSegment, lastCycle } = rowSegmentOccurrences(
      row,
      pattern,
      segments,
      ctx.rowCycles?.[row.id]
    );

    if (row.assignment.type === "automation") {
      const target = row.assignment.target;
      const rowChannel = Math.max(0, Math.min(15, (row.midiChannel || pattern.midiChannel || 1) - 1));
      const interpolation = row.automationMode === "slide" ? "linear" : "step";
      const pts: Array<{ tick: number; value: number; id: string }> = [];

      for (let sIdx = 0; sIdx < segments.length; sIdx++) {
        const seg = segments[sIdx]!;
        const occs = perSegment[sIdx]!;
        for (const occ of occs) {
          const step = occ.step;
          if (!step.on) continue;
          if (!conditionPasses(step.condition, occ.cycle, lastCycle)) continue;
          const chance = step.chance ?? 100;
          if (chance <= 0) continue;
          if (chance < 100 && stepHash(pattern.seed, rowKey, occ.stepIndex, occ.cycle) * 100 >= chance) {
            continue;
          }
          const swung = occ.rawStartTick + swingDelay(occ.rawStartTick, pattern.swingDivision, pattern.swing);
          const offsetTicks = Math.round(((step.offset ?? 0) / 100) * occ.lengthTicks);
          let rawTick = swung + offsetTicks;
          if (seg.phase === 0 && rawTick < 0) rawTick = 0;
          if (rawTick < seg.phase || rawTick >= seg.phase + seg.segLen) continue;
          const tick = seg.segStart + (rawTick - seg.phase);
          const val = step.value ?? defaultAutomationValue(target);
          pts.push({
            id: `pa:${row.id}:${seg.segIdx}:${occ.cycle}:${occ.stepIndex}`,
            tick,
            value: val
          });
        }
      }

      if (pts.length === 0) continue;
      pts.sort((a, b) => a.tick - b.tick);
      // Keep last value when two points land on the same tick.
      const deduped: typeof pts = [];
      for (const pt of pts) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.tick === pt.tick) deduped[deduped.length - 1] = pt;
        else deduped.push(pt);
      }

      if (target.kind === "device") {
        deviceAutomation.push({
          rowId: row.id,
          target,
          automationMode: row.automationMode,
          points: deduped.map(({ tick, value }) => ({ tick, value }))
        });
      } else {
        const kind: MidiControllerKind = target.kind;
        const { min, max } = controllerValueRange(kind);
        const key = `${kind}|${target.kind === "cc" ? target.cc : ""}|${rowChannel}`;
        const existing = controllerMap.get(key);
        const clampedPoints = deduped.map((p) => ({
          id: p.id,
          tick: p.tick,
          value: Math.max(min, Math.min(max, Math.round(p.value)))
        }));
        if (existing) {
          existing.points = [...existing.points, ...clampedPoints].sort((a, b) => a.tick - b.tick);
        } else {
          const lane: MidiControllerLane = {
            id: `p:${row.id}`,
            kind,
            channel: rowChannel,
            interpolation,
            points: clampedPoints
          };
          if (target.kind === "cc") lane.cc = target.cc;
          controllerMap.set(key, lane);
        }
      }
      continue;
    }

    // Note, melodic, kit or degree row.
    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx]!;
      const occs = perSegment[sIdx]!;

      for (let i = 0; i < occs.length; i++) {
        const occ = occs[i]!;
        const step = occ.step;
        if (step.tie) continue; // Continues previous step; never starts a note (SQ12).
        if (!step.on) continue;
        if (!conditionPasses(step.condition, occ.cycle, lastCycle)) continue;
        const chance = step.chance ?? 100;
        if (chance <= 0) continue;
        if (chance < 100 && stepHash(pattern.seed, rowKey, occ.stepIndex, occ.cycle) * 100 >= chance) {
          continue;
        }

        // Collect tie chain starting at occ[i] through consecutive played tie steps (SQ12).
        const chain: ScheduledOccurrence[] = [occ];
        let j = i + 1;
        while (j < occs.length) {
          const next = occs[j]!;
          if (next.step.tie !== true) break;
          if (!conditionPasses(next.step.condition, next.cycle, lastCycle)) break;
          const nextChance = next.step.chance ?? 100;
          if (nextChance <= 0) break;
          if (
            nextChance < 100 &&
            stepHash(pattern.seed, rowKey, next.stepIndex, next.cycle) * 100 >= nextChance
          ) {
            break;
          }
          chain.push(next);
          j++;
        }

        const swung = occ.rawStartTick + swingDelay(occ.rawStartTick, pattern.swingDivision, pattern.swing);
        const offsetTicks = Math.round(((step.offset ?? 0) / 100) * occ.lengthTicks);
        let rawTick = swung + offsetTicks;
        if (seg.phase === 0 && rawTick < 0) rawTick = 0;
        if (rawTick < seg.phase || rawTick >= seg.phase + seg.segLen) continue;

        const contentStart = seg.segStart + (rawTick - seg.phase);
        const pitch = stepPitch(row, step, {
          pattern,
          chords: ctx.chords,
          docTick: clipStartDocTick + contentStart,
          key: ctx.key,
          instrument: ctx.instrument
        });
        if (pitch === null) continue;

        const lastOcc = chain[chain.length - 1]!;
        const lastGate = lastOcc.step.gate ?? 100;
        const repeat = Math.max(1, Math.min(16, Math.round(step.repeat ?? 1)));
        const velocity = Math.max(1, Math.min(127, Math.round(step.velocity ?? 100)));
        const ch1 = step.midiChannel ?? row.midiChannel ?? pattern.midiChannel ?? 1;
        const channel = Math.max(0, Math.min(15, Math.round(ch1) - 1));
        const kitBend =
          row.assignment.type === "kit" ? kitStepPitchBend(pitch, step) : 0;

        if (repeat === 1) {
          let prefixTicks = 0;
          for (let c = 0; c < chain.length - 1; c++) {
            prefixTicks += chain[c]!.lengthTicks;
          }
          let durationTick = Math.max(
            1,
            prefixTicks + Math.round((lastOcc.lengthTicks * lastGate) / 100)
          );
          if (pattern.legato && lastGate === 100) durationTick += 1;
          // Stop at segment / clip end (SQ17), except allow legato's +1 tick when
          // inside the clip window.
          const maxDur = seg.segEnd - contentStart;
          if (maxDur <= 0) continue;
          if (durationTick > maxDur) durationTick = maxDur;
          const note: MidiNote = {
            id: `p:${row.id}:${seg.segIdx}:${occ.cycle}:${occ.stepIndex}:0`,
            pitch,
            velocity,
            startTick: contentStart,
            durationTick,
            channel
          };
          if (kitBend !== 0) {
            note.expression = { pitch: [{ tick: 0, value: kitBend }] };
          }
          notes.push(note);
        } else {
          const chainLen = chain.reduce((sum, c) => sum + c.lengthTicks, 0);
          const positions = repeatPositions(chainLen, repeat, step.distribution ?? 0);
          const velocities = repeatVelocities(
            velocity,
            repeat,
            step.velocityRamp ?? 0,
            step.velocityCurve ?? 0
          );
          for (let k = 0; k < repeat; k++) {
            const subStart = contentStart + positions[k]!;
            if (subStart >= seg.segEnd) break;
            const nextPos = k + 1 < repeat ? positions[k + 1]! : chainLen;
            const subSpan = Math.max(1, nextPos - positions[k]!);
            let subDur = Math.max(1, Math.round((subSpan * lastGate) / 100));
            if (pattern.legato && lastGate === 100) subDur += 1;
            const maxDur = seg.segEnd - subStart;
            if (maxDur <= 0) continue;
            if (subDur > maxDur) subDur = maxDur;
            const note: MidiNote = {
              id: `p:${row.id}:${seg.segIdx}:${occ.cycle}:${occ.stepIndex}:${k}`,
              pitch,
              velocity: velocities[k]!,
              startTick: subStart,
              durationTick: subDur,
              channel
            };
            if (kitBend !== 0) {
              note.expression = { pitch: [{ tick: 0, value: kitBend }] };
            }
            notes.push(note);
          }
        }
      }
    }
  }

  return {
    notes: sortNotes(notes),
    controllers: [...controllerMap.values()],
    deviceAutomation
  };
}

export interface PatternExpandDocument {
  tracks?: ReadonlyArray<Pick<TimelineTrack, "id" | "type" | "chords" | "instrument">>;
  tempo?: TimelineTempo;
}

/**
 * Expand a clip's `pattern` against document tempo, chords, key and track
 * instrument. Returns `null` when `clip.pattern` is absent.
 */
export function expandPatternClip(
  clip: Pick<
    TimelineClip,
    | "pattern"
    | "patternPhaseTicks"
    | "patternRowCycles"
    | "durationMs"
    | "loopLengthMs"
    | "inPointMs"
    | "startMs"
    | "trackId"
  >,
  doc: PatternExpandDocument = {}
): ExpandPatternResult | null {
  if (!clip.pattern) return null;
  const tempo = resolveTempo(doc);
  const clipLengthTicks = Math.max(0, Math.round(msToTicks(clip.durationMs, tempo.bpm)));
  const loopMs = activeLoopMs(clip);
  const loopLengthTicks =
    loopMs !== undefined ? Math.max(1, Math.round(msToTicks(loopMs, tempo.bpm))) : undefined;
  const inPointTicks = Math.max(0, Math.round(msToTicks(clip.inPointMs ?? 0, tempo.bpm)));
  const patternPhaseTicks = (clip.patternPhaseTicks ?? 0) + inPointTicks;
  const clipStartDocTick = Math.round(msToTicks(clip.startMs - tempo.offsetMs, tempo.bpm));
  const track = doc.tracks?.find((t) => t.id === clip.trackId);
  const chordTrack = doc.tracks ? chordTrackFor(undefined, doc.tracks) : undefined;

  return expandPattern(clip.pattern, {
    clipLengthTicks,
    loopLengthTicks,
    patternPhaseTicks,
    rowCycles: clip.patternRowCycles,
    clipStartDocTick,
    chords: chordTrack?.chords,
    key: tempo.key,
    instrument: track?.instrument
  });
}

const BOUNDARY_EPS_MS = 1e-3;

/**
 * Overlay derived `kind: "device"` automation from pattern clips on `track`
 * onto `track.automation` (SQ41). Stored automation wins outside each pattern
 * clip's `[startMs, startMs + durationMs)` window.
 */
export function deriveTrackAutomationFromPatterns(
  track: TimelineTrack,
  clips: ReadonlyArray<TimelineClip>,
  doc: PatternExpandDocument = {}
): AutomationLane[] {
  const tempo = resolveTempo(doc);
  const patternClips = clips
    .filter((c) => c.trackId === track.id && c.pattern !== undefined && !c.muted && !c.hidden)
    .sort((a, b) => a.startMs - b.startMs);

  const base = (track.automation ?? []).map((lane) => ({
    ...lane,
    points: lane.points.map((p) => ({ ...p }))
  }));
  if (patternClips.length === 0) return base;

  const byKey = new Map<string, AutomationLane>();
  const originalStored = new Map<string, AutomationPoint[]>();
  for (const lane of base) {
    if (lane.target.kind === "device") {
      const key = `${lane.target.deviceId}:${lane.target.param}`;
      byKey.set(key, lane);
      if (lane.points.length > 0) {
        originalStored.set(key, lane.points.map((p) => ({ ...p })));
      }
    }
  }

  for (const clip of patternClips) {
    const expanded = expandPatternClip(clip, {
      tracks: doc.tracks ?? [track],
      tempo
    });
    if (!expanded || expanded.deviceAutomation.length === 0) continue;
    const clipStart = clip.startMs;
    const clipEnd = clip.startMs + clip.durationMs;

    for (const derived of expanded.deviceAutomation) {
      if (derived.points.length === 0) continue;
      const key = `${derived.target.deviceId}:${derived.target.param}`;
      const easing = derived.automationMode === "latch" ? "hold" : undefined;
      const clipPoints: AutomationPoint[] = derived.points.map((p, idx) => {
        const pt: AutomationPoint = {
          timeMs: clipStart + ticksToMs(p.tick, tempo.bpm),
          value: p.value
        };
        if (idx > 0 && easing) pt.easing = easing;
        return pt;
      });

      const existing = byKey.get(key);
      if (!existing) {
        const created: AutomationLane = {
          id: `pattern-auto:${clip.id}:${derived.rowId}`,
          target: { ...derived.target },
          points: clipPoints,
          enabled: true
        };
        base.push(created);
        byKey.set(key, created);
      } else {
        // Stored lane wins outside [clipStart, clipEnd); pattern points replace inside.
        const origPoints = originalStored.get(key);
        const entryTime = clipPoints[0]!.timeMs;
        const before = existing.points.filter((p) => p.timeMs < entryTime);
        const after = existing.points.filter((p) => p.timeMs > clipEnd);
        const prePoints: AutomationPoint[] = [];
        if (existing.points.length > 0 && entryTime > 0) {
          const preTime = Math.max(0, entryTime - BOUNDARY_EPS_MS);
          const lastBefore = before[before.length - 1];
          if (!lastBefore || lastBefore.timeMs < preTime - 1e-6) {
            prePoints.push({
              timeMs: preTime,
              value: automationValueAt(existing.points, preTime)
            });
          }
          // Hold across the tiny pre-guard -> entry boundary so the stored lane
          // keeps its exact slope up to the clip and jumps cleanly at entryTime.
          clipPoints[0] = { ...clipPoints[0]!, easing: "hold" };
        }
        const postPoints: AutomationPoint[] = [];
        if (origPoints && origPoints.length > 0) {
          const lastClipPt = clipPoints[clipPoints.length - 1]!;
          if (clipEnd > lastClipPt.timeMs) {
            postPoints.push({
              timeMs: clipEnd,
              value: automationValueAt(origPoints, clipEnd),
              easing: "hold"
            });
          }
        }
        existing.points = [
          ...before,
          ...prePoints,
          ...clipPoints,
          ...postPoints,
          ...after
        ].sort((a, b) => a.timeMs - b.timeMs);
      }
    }
  }

  return base;
}

const patternAutoTrackCache = new WeakMap<
  readonly TimelineTrack[],
  WeakMap<
    readonly TimelineClip[],
    {
      bpm: number;
      offsetMs: number;
      key: unknown;
      chords: unknown;
      tracks: TimelineTrack[];
    }
  >
>();

/**
 * Return `tracks` with every pattern clip's `kind: "device"` automation rows
 * overlaid onto its track's `automation` lanes (SQ41). Tracks without pattern
 * device automation keep their original object identity, and results are
 * memoized on `(tracks, clips, tempo, chords)` for per-frame playback.
 */
export function tracksWithPatternAutomation(
  tracks: readonly TimelineTrack[],
  clips: readonly TimelineClip[],
  doc: PatternExpandDocument = {}
): TimelineTrack[] {
  const tempo = resolveTempo(doc);
  const chordTrack = chordTrackFor(undefined, doc.tracks ?? tracks);
  let byClips = patternAutoTrackCache.get(tracks);
  const hit = byClips?.get(clips);
  if (
    hit &&
    hit.bpm === tempo.bpm &&
    hit.offsetMs === tempo.offsetMs &&
    hit.key === tempo.key &&
    hit.chords === chordTrack?.chords
  ) {
    return hit.tracks;
  }

  const patternTracks = new Set<string>();
  for (const c of clips) {
    if (
      c.pattern &&
      !c.muted &&
      !c.hidden &&
      c.pattern.rows.some(
        (r) => r.assignment.type === "automation" && r.assignment.target.kind === "device"
      )
    ) {
      patternTracks.add(c.trackId);
    }
  }

  let changed = false;
  const result =
    patternTracks.size === 0
      ? (tracks as TimelineTrack[])
      : tracks.map((track) => {
          if (!patternTracks.has(track.id)) return track;
          const merged = deriveTrackAutomationFromPatterns(track, clips, {
            tracks: doc.tracks ?? tracks,
            tempo
          });
          changed = true;
          return { ...track, automation: merged };
        });
  const out = changed ? result : (tracks as TimelineTrack[]);

  if (!byClips) {
    byClips = new WeakMap();
    patternAutoTrackCache.set(tracks, byClips);
  }
  byClips.set(clips, {
    bpm: tempo.bpm,
    offsetMs: tempo.offsetMs,
    key: tempo.key,
    chords: chordTrack?.chords,
    tracks: out
  });
  return out;
}

/**
 * Derive clip-local subtractive instrument `cutoffHz` control breakpoints from
 * an effective track's automation lanes (stored lanes + SQ41 pattern overlays).
 * Shared by preview rendering, browser export, and server export.
 */
export function instrumentCutoffControls(
  track: TimelineTrack | undefined,
  clip: Pick<TimelineClip, "startMs" | "durationMs">,
  sampleRate: number
): { cutoffHz: FramePoint[] } | undefined {
  if (!track || !automationModePlays(automationModeOf(track))) return undefined;
  const lane = (track.automation ?? []).find(
    (l) =>
      isAutomationLaneActive(l) &&
      l.target.kind === "device" &&
      l.target.deviceId === "instrument" &&
      (l.target.param === "cutoffHz" || l.target.param === "filter.cutoff")
  );
  if (!lane) return undefined;
  const clipEndMs = clip.startMs + clip.durationMs;
  const maxHz = Math.max(20, sampleRate / 2 - 1);
  const points: FramePoint[] = [];
  for (const bp of automationBreakpoints(lane.points, clip.startMs, {
    maxStepMs: 10
  })) {
    if (bp.timeMs > clipEndMs) break;
    const frame = Math.max(
      0,
      Math.round(((bp.timeMs - clip.startMs) / 1000) * sampleRate)
    );
    const value = Math.min(maxHz, Math.max(20, bp.value));
    const last = points[points.length - 1];
    if (last && last.frame === frame) {
      if (last.value !== value && frame > 0) {
        last.frame = frame - 1;
        points.push({ frame, value });
      } else {
        last.value = value;
      }
    } else {
      points.push({ frame, value });
    }
  }
  return points.length > 0 ? { cutoffHz: points } : undefined;
}
