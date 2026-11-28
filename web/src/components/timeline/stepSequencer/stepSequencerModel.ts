/**
 * Pure model of the Step Sequencer editor (SQ27 to SQ46): the edit-mode table,
 * cell values and labels, the playing step, and the op builders every gesture
 * and command goes through. Nothing here touches React or a store, so agents,
 * gestures and tests share one translation from intent to `TimelineOp`.
 *
 * Steps are 0-based in the UI and 1-based in ops.
 */

import {
  STEP_RATES,
  activeLoopMs,
  controllerValueRange,
  kitPadPitch,
  msToTicks,
  normalizeStep,
  playOrder,
  rowKeyHash,
  stepNoteName,
  stepRateTicks
} from "@nodetool-ai/timeline";
import type {
  MidiInstrument,
  Step,
  StepEditMode,
  StepPattern,
  StepPlaybackMode,
  StepRate,
  StepRow
} from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

// ── Edit modes ─────────────────────────────────────────────────────────────

export type ModeKind = "bool" | "number" | "rate" | "loop";

export interface ModeSpec {
  mode: StepEditMode;
  kind: ModeKind;
  /** The `Step` field the mode writes. `null` for row-level modes. */
  field: keyof Step | null;
  unit?: "%";
  /** Single-letter key that selects the mode (SQ35). */
  key?: string;
}

export const MODE_SPECS: Readonly<Record<StepEditMode, ModeSpec>> = {
  onOff: { mode: "onOff", kind: "bool", field: "on" },
  velocity: { mode: "velocity", kind: "number", field: "velocity", key: "v" },
  value: { mode: "value", kind: "number", field: "value", key: "v" },
  gate: { mode: "gate", kind: "number", field: "gate", unit: "%", key: "g" },
  tie: { mode: "tie", kind: "bool", field: "tie", key: "t" },
  note: { mode: "note", kind: "number", field: "note", key: "n" },
  octave: { mode: "octave", kind: "number", field: "octave", key: "o" },
  repeat: { mode: "repeat", kind: "number", field: "repeat", key: "r" },
  chance: { mode: "chance", kind: "number", field: "chance", unit: "%", key: "c" },
  offset: { mode: "offset", kind: "number", field: "offset", unit: "%", key: "f" },
  stepRate: { mode: "stepRate", kind: "rate", field: "stepRate", key: "a" },
  skip: { mode: "skip", kind: "bool", field: "skip", key: "k" },
  loop: { mode: "loop", kind: "loop", field: null, key: "l" }
};

/** Edit modes in selector order (p. 735). */
export const EDIT_MODE_ORDER: readonly StepEditMode[] = [
  "onOff",
  "velocity",
  "gate",
  "tie",
  "note",
  "octave",
  "repeat",
  "chance",
  "offset",
  "stepRate",
  "skip",
  "loop"
];

export const isAutomationRow = (row: Pick<StepRow, "assignment">): boolean =>
  row.assignment.type === "automation";

/** Modes the row supports. Automation rows use Value in place of Velocity. */
export function rowSupportsMode(row: Pick<StepRow, "assignment">, mode: StepEditMode): boolean {
  if (isAutomationRow(row)) {
    return !["velocity", "gate", "tie", "note", "octave", "repeat"].includes(mode);
  }
  return mode !== "value";
}

/** The mode a row shows for the global edit mode: Velocity reads as Value on automation rows. */
export function effectiveMode(row: Pick<StepRow, "assignment">, mode: StepEditMode): StepEditMode {
  if (mode === "velocity" && isAutomationRow(row)) return "value";
  if (mode === "value" && !isAutomationRow(row)) return "velocity";
  return mode;
}

export interface ModeRange {
  min: number;
  max: number;
}

/** The row's base octave in the Logic numbering (C3 = 60). */
export function rowBaseOctave(row: Pick<StepRow, "assignment">): number {
  const a = row.assignment;
  if (a.type === "degree") return a.octave;
  if (a.type === "note" || a.type === "melodic") return Math.floor(a.pitch / 12) - 2;
  return 3;
}

export function rowBasePitch(row: Pick<StepRow, "assignment">): number | null {
  const a = row.assignment;
  if (a.type === "note" || a.type === "melodic") return a.pitch;
  if (a.type === "kit") return 36 + a.pad;
  return null;
}

/** Device parameters are 0..1, so their values keep fractions. */
export const isDeviceValue = (row: Pick<StepRow, "assignment">, mode: StepEditMode): boolean =>
  mode === "value" && row.assignment.type === "automation" && row.assignment.target.kind === "device";

/** One increment of `mode` on `row`: a percent of the range for device values. */
export const modeUnit = (row: Pick<StepRow, "assignment">, mode: StepEditMode): number =>
  isDeviceValue(row, mode) ? 0.01 : 1;

export function modeRange(row: Pick<StepRow, "assignment">, mode: StepEditMode): ModeRange {
  switch (mode) {
    case "velocity":
      return { min: 1, max: 127 };
    case "value": {
      const a = row.assignment;
      if (a.type === "automation") {
        if (a.target.kind === "pitchBend") return controllerValueRange("pitchBend");
        if (a.target.kind === "device") return { min: 0, max: 1 };
      }
      return { min: 0, max: 127 };
    }
    case "gate":
      return { min: 1, max: 100 };
    case "note":
      return { min: -12, max: 12 };
    case "octave":
      return { min: -2, max: 8 };
    case "repeat":
      return { min: 1, max: 16 };
    case "chance":
      return { min: 0, max: 100 };
    case "offset":
      return { min: -50, max: 50 };
    case "stepRate":
      return { min: 0, max: STEP_RATES.length - 1 };
    default:
      return { min: 0, max: 1 };
  }
}

/** The numeric value of `mode` on a step, after defaults. Booleans are 0 or 1. */
export function stepModeValue(row: StepRow, stepIndex: number, mode: StepEditMode): number {
  const n = normalizeStep(row.steps[stepIndex]);
  switch (mode) {
    case "onOff":
      return n.on ? 1 : 0;
    case "tie":
      return n.tie ? 1 : 0;
    case "skip":
      return n.skip ? 1 : 0;
    case "velocity":
      return n.velocity;
    case "value":
      return n.value ?? modeRange(row, "value").min;
    case "gate":
      return n.gate;
    case "note":
      return n.note;
    case "octave":
      return n.octave ?? rowBaseOctave(row);
    case "repeat":
      return n.repeat;
    case "chance":
      return n.chance;
    case "offset":
      return n.offset;
    case "stepRate":
      return STEP_RATES.indexOf(n.stepRate ?? row.stepRate);
    case "loop":
      return stepIndex >= row.loopStart && stepIndex < row.loopEnd ? 1 : 0;
  }
}

/** 0..1 height of the value line inside a cell. */
export function valueFraction(row: StepRow, stepIndex: number, mode: StepEditMode): number {
  const { min, max } = modeRange(row, mode);
  if (max === min) return 0;
  return (stepModeValue(row, stepIndex, mode) - min) / (max - min);
}

/** Integer value for a 0..1 drag fraction, clamped to the mode range. */
export function valueFromFraction(
  row: Pick<StepRow, "assignment">,
  mode: StepEditMode,
  fraction: number
): number {
  const { min, max } = modeRange(row, mode);
  const f = Math.max(0, Math.min(1, fraction));
  const raw = min + (max - min) * f;
  return isDeviceValue(row, mode) ? Math.round(raw * 1000) / 1000 : Math.round(raw);
}

/** The text a value cell shows bottom-left (`47`, `100%`, `B-1`, `-1`, `1/16`). */
export function stepValueText(row: StepRow, stepIndex: number, mode: StepEditMode): string {
  const v = stepModeValue(row, stepIndex, mode);
  const spec = MODE_SPECS[mode];
  if (mode === "note") {
    const base = rowBasePitch(row);
    if (base !== null && row.assignment.type !== "kit") {
      return stepNoteName(Math.max(0, Math.min(127, base + v)));
    }
    return v > 0 ? `+${v}` : String(v);
  }
  if (mode === "stepRate") return STEP_RATES[v] ?? row.stepRate;
  if (spec.kind === "bool" || spec.kind === "loop") return "";
  if (mode === "value" && row.assignment.type === "automation" && row.assignment.target.kind === "device") {
    return `${Math.round(v * 100)}%`;
  }
  return spec.unit ? `${v}${spec.unit}` : String(v);
}

/** The value text a drag preview shows for `value` on one step. */
export function previewValueText(row: StepRow, stepIndex: number, mode: StepEditMode, value: number): string {
  const field = MODE_SPECS[mode].field;
  if (!field) return "";
  const patched = mode === "stepRate" ? STEP_RATES[value] : value;
  const steps = row.steps.map((st, i) => (i === stepIndex ? { ...st, [field]: patched } : st));
  return stepValueText({ ...row, steps }, stepIndex, mode);
}

// ── Ties ───────────────────────────────────────────────────────────────────

export interface TieSpan {
  start: number;
  /** Inclusive end. */
  end: number;
}

/** Each on step with its tied followers, as merged cell spans (SQ30). An off step does not hold a tie. */
export function tieSpans(row: StepRow): TieSpan[] {
  const out: TieSpan[] = [];
  for (let i = 0; i < row.lengthSteps; i++) {
    const start = i;
    if (row.steps[i]?.on === true) {
      while (i + 1 < row.lengthSteps && row.steps[i + 1]?.tie === true) i++;
    }
    out.push({ start, end: i });
  }
  return out;
}

// ── Learn ────────────────────────────────────────────────────────────────

/**
 * Where a learned note goes (SQ38): the row that already plays `pitch` (a kit
 * pad or a note row), else a new kit pad row on a drum or sampler track, else
 * a new note row.
 */
export function learnTarget(
  pattern: Pick<StepPattern, "rows">,
  instrument: MidiInstrument | undefined,
  pitch: number
): { rowId: string } | { add: { pad: number } | { pitch: number } } {
  const existing = pattern.rows.find((r) => {
    const a = r.assignment;
    if (a.type === "kit") return kitPadPitch(a.pad, instrument) === pitch;
    return (a.type === "note" || a.type === "melodic") && a.pitch === pitch;
  });
  if (existing) return { rowId: existing.id };
  const pads = instrument?.type === "drum" ? instrument.pads.length : instrument?.type === "sampler" ? instrument.zones.length : 0;
  for (let pad = 0; pad < pads; pad++) {
    if (kitPadPitch(pad, instrument) === pitch) return { add: { pad } };
  }
  return { add: { pitch } };
}

// ── Playing step ───────────────────────────────────────────────────────────

/** One played step of a pattern region, in clip ticks from the region start. */
export interface PatternCell {
  rowIndex: number;
  rowId: string;
  stepIndex: number;
  startTick: number;
  lengthTicks: number;
  /** An on step, or a tied follower of one. */
  on: boolean;
  /** A follower that continues the previous step's note. */
  tied: boolean;
  /** Muted by the row's Mute or left out by another row's Solo. */
  muted: boolean;
  /** Inside a region loop repeat, not the first pass. */
  repeat: boolean;
}

export interface PatternCellWindow {
  clipLengthTicks: number;
  loopLengthTicks?: number;
  /** Pattern phase plus the region in point, in ticks. */
  phaseTicks?: number;
}

/**
 * Every step each row plays across a pattern region (SQ10, SQ14, SQ19, SQ27).
 * Same schedule as `expandPattern`: rows restart at each region loop, cycles
 * carry their index and wander position, and a cycle may change length when a
 * random order repeats steps with their own rates.
 */
export function patternRegionCells(pattern: StepPattern, win: PatternCellWindow): PatternCell[] {
  const total = Math.max(0, Math.round(win.clipLengthTicks));
  if (total <= 0) return [];
  const phase = Math.max(0, Math.round(win.phaseTicks ?? 0));
  const loop = win.loopLengthTicks !== undefined && win.loopLengthTicks > 0 && win.loopLengthTicks < total
    ? Math.max(1, Math.round(win.loopLengthTicks))
    : total;
  const hasSolo = pattern.rows.some((r) => r.solo);
  const out: PatternCell[] = [];
  pattern.rows.forEach((row, rowIndex) => {
    const muted = row.mute || (hasSolo && !row.solo);
    const lo = Math.max(0, Math.min(row.steps.length, row.loopStart));
    const hi = Math.max(lo, Math.min(row.steps.length, row.loopEnd));
    const active: number[] = [];
    for (let i = lo; i < hi; i++) if (!row.steps[i]?.skip) active.push(i);
    if (active.length === 0) return;
    const leadOn = new Map<number, boolean>();
    for (const span of tieSpans(row)) {
      for (let i = span.start; i <= span.end; i++) leadOn.set(i, row.steps[span.start]?.on === true);
    }
    const rk = rowKeyHash(row.id);
    let cycle = 0;
    let wanderPos: number | undefined;
    for (let seg = 0; seg * loop < total; seg++) {
      const segStart = seg * loop;
      const segLen = Math.min(loop, total - segStart);
      const segPhase = seg === 0 ? phase : 0;
      const limit = segPhase + segLen;
      let passStart = 0;
      for (let safety = 0; passStart < limit && safety < 16384; safety++) {
        const order = playOrder(active.length, row.playback, pattern.seed, cycle, rk, wanderPos);
        if (order.length === 0) break;
        wanderPos = order[order.length - 1];
        let cursor = 0;
        for (const pos of order) {
          const stepIndex = active[pos]!;
          const step = row.steps[stepIndex];
          const len = stepRateTicks(step?.stepRate ?? row.stepRate);
          const raw = passStart + cursor;
          cursor += len;
          const from = Math.max(raw, segPhase);
          const to = Math.min(raw + len, limit);
          if (to <= from) continue;
          const tied = step?.tie === true && step.on !== true && leadOn.get(stepIndex) === true;
          out.push({
            rowIndex,
            rowId: row.id,
            stepIndex,
            startTick: segStart + from - segPhase,
            lengthTicks: to - from,
            on: step?.on === true || tied,
            tied,
            muted,
            repeat: seg > 0
          });
        }
        if (cursor <= 0) break;
        passStart += cursor;
        cycle += 1;
      }
    }
  });
  return out;
}

/**
 * The step index each row plays at `timeMs`, or -1 outside the region. Rows
 * with different rates or playback orders play different steps (SQ10), and
 * every row restarts at a region loop.
 */
export function playingSteps(
  pattern: StepPattern,
  clip: { startMs: number; durationMs: number; patternPhaseTicks?: number; inPointMs?: number; loopLengthMs?: number },
  bpm: number,
  timeMs: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (timeMs < clip.startMs || timeMs >= clip.startMs + clip.durationMs) return out;
  const local = msToTicks(timeMs - clip.startMs, bpm);
  const loopMs = activeLoopMs(clip);
  const cells = patternRegionCells(pattern, {
    clipLengthTicks: Math.floor(local) + 1,
    loopLengthTicks: loopMs !== undefined ? msToTicks(loopMs, bpm) : undefined,
    phaseTicks: (clip.patternPhaseTicks ?? 0) + msToTicks(clip.inPointMs ?? 0, bpm)
  });
  for (const c of cells) {
    if (local >= c.startTick && local < c.startTick + c.lengthTicks) out.set(c.rowId, c.stepIndex);
  }
  return out;
}

/** Ticks one step of the pattern grid lasts. */
export const patternStepTicks = (pattern: Pick<StepPattern, "stepRate">): number =>
  stepRateTicks(pattern.stepRate);

// ── Op builders (1-based steps) ────────────────────────────────────────────

const oneBased = (steps: readonly number[]): number[] =>
  [...new Set(steps)].sort((a, b) => a - b).map((s) => s + 1);

export function setOnOp(clipId: string, rowId: string, steps: readonly number[], on: boolean): TimelineOp {
  return { op: "set_steps", clipId, row: rowId, steps: oneBased(steps), values: { on } };
}

/** Write one mode value. A value edit on an off step turns it on (SQ32). */
export function setValueOp(
  clipId: string,
  row: StepRow,
  steps: readonly number[],
  mode: StepEditMode,
  value: number | boolean
): TimelineOp {
  const spec = MODE_SPECS[mode];
  const values: Record<string, unknown> = {};
  if (spec.kind === "rate") {
    values.stepRate = STEP_RATES[Number(value)] as StepRate;
  } else if (spec.field) {
    values[spec.field] = value;
  }
  return {
    op: "set_steps",
    clipId,
    row: row.id,
    steps: oneBased(steps),
    values
  } as TimelineOp;
}

/** Group per-step values into one `set_steps` per distinct value. */
export function setValuesOps(
  clipId: string,
  row: StepRow,
  mode: StepEditMode,
  perStep: ReadonlyMap<number, number>
): TimelineOp[] {
  const byValue = new Map<number, number[]>();
  for (const [step, value] of perStep) {
    const list = byValue.get(value) ?? [];
    list.push(step);
    byValue.set(value, list);
  }
  return [...byValue].map(([value, steps]) => setValueOp(clipId, row, steps, mode, value));
}

export function rampOp(
  clipId: string,
  rowId: string,
  from: number,
  to: number,
  mode: StepEditMode,
  fromValue: number,
  toValue: number,
  leaveOff: boolean
): TimelineOp {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const ascending = from <= to;
  return {
    op: "set_steps",
    clipId,
    row: rowId,
    steps: `${lo + 1}-${hi + 1}`,
    ramp: {
      field: mode as never,
      from: ascending ? fromValue : toValue,
      to: ascending ? toValue : fromValue,
      leaveOff: leaveOff || undefined
    }
  };
}

export function tieOp(clipId: string, rowId: string, from: number, to: number, tie: boolean): TimelineOp {
  return {
    op: "tie_steps",
    clipId,
    row: rowId,
    from: Math.min(from, to) + 1,
    to: Math.max(from, to) + 1,
    tie
  };
}

/**
 * A Step Rate ramp (SQ33): `set_steps` ramps numbers only, so each step gets
 * its rate name from the interpolated index.
 */
export function rateRampOps(
  clipId: string,
  row: StepRow,
  from: number,
  to: number,
  fromIndex: number,
  toIndex: number,
  leaveOff = false
): TimelineOp[] {
  const values = new Map<number, number>();
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (let s = lo; s <= hi; s++) {
    const f = hi === lo ? 0 : (s - from) / (to - from);
    values.set(s, Math.round(fromIndex + (toIndex - fromIndex) * f));
  }
  const ops = setValuesOps(clipId, row, "stepRate", values);
  // A value edit turns a step on. With Shift the off steps take the rate and
  // stay off (SQ33, F54), restored in the same run.
  const off = [...values.keys()].filter((s) => row.steps[s]?.on !== true);
  if (leaveOff && off.length > 0) ops.push({ op: "set_steps", clipId, row: row.id, steps: oneBased(off), values: { on: false } } as TimelineOp);
  return ops;
}

/** Option-click: reset the step to defaults and turn it off (D75). */
export function resetStepsOp(clipId: string, rowId: string, steps: readonly number[]): TimelineOp {
  return { op: "clear_pattern", clipId, scope: "steps", row: rowId, steps: oneBased(steps) };
}

export function loopRangeOp(clipId: string, rowId: string, from: number, to: number): TimelineOp {
  return {
    op: "set_pattern_row",
    clipId,
    row: rowId,
    loopStart: Math.min(from, to) + 1,
    loopEnd: Math.max(from, to) + 1
  };
}

/**
 * One shared delta for a multi-step drag, limited so no step leaves its range
 * (p. 736).
 */
export function sharedDeltaValues(
  row: StepRow,
  steps: readonly number[],
  mode: StepEditMode,
  delta: number
): Map<number, number> {
  const { min, max } = modeRange(row, mode);
  const current = steps.map((s) => stepModeValue(row, s, mode));
  const lo = Math.min(...current);
  const hi = Math.max(...current);
  const d = Math.max(min - lo, Math.min(max - hi, isDeviceValue(row, mode) ? delta : Math.round(delta)));
  const out = new Map<number, number>();
  steps.forEach((s, i) => out.set(s, current[i]! + d));
  return out;
}

/** Relative inspector edit on a mixed selection (`*` field, p. 754). */
export function relativeValues(
  row: StepRow,
  steps: readonly number[],
  mode: StepEditMode,
  delta: number
): Map<number, number> {
  const { min, max } = modeRange(row, mode);
  const out = new Map<number, number>();
  for (const s of steps) {
    out.set(s, Math.max(min, Math.min(max, stepModeValue(row, s, mode) + delta)));
  }
  return out;
}

// ── Selection ──────────────────────────────────────────────────────────────

/** A selected step: `rowId:stepIndex`. */
export type StepKey = `${string}:${number}`;
export const stepKey = (rowId: string, step: number): StepKey => `${rowId}:${step}`;
export function parseStepKey(key: StepKey): { rowId: string; step: number } {
  const i = key.lastIndexOf(":");
  return { rowId: key.slice(0, i), step: Number(key.slice(i + 1)) };
}

/** Selected steps of one row, sorted. */
export function rowSelection(selection: ReadonlySet<StepKey>, rowId: string): number[] {
  const out: number[] = [];
  for (const k of selection) {
    const p = parseStepKey(k);
    if (p.rowId === rowId) out.push(p.step);
  }
  return out.sort((a, b) => a - b);
}

/** Marquee selection (F28, p. 749): the steps in the rectangle between two corners, added to `base`. */
export function marqueeSelection(
  pattern: StepPattern,
  a: { rowId: string; step: number },
  b: { rowId: string; step: number },
  base: ReadonlySet<StepKey> = new Set()
): Set<StepKey> {
  const out = new Set(base);
  const ia = pattern.rows.findIndex((r) => r.id === a.rowId);
  const ib = pattern.rows.findIndex((r) => r.id === b.rowId);
  if (ia < 0 || ib < 0) return out;
  const lo = Math.min(a.step, b.step);
  const hi = Math.max(a.step, b.step);
  for (let i = Math.min(ia, ib); i <= Math.max(ia, ib); i++) {
    const r = pattern.rows[i]!;
    for (let s = lo; s <= Math.min(hi, r.lengthSteps - 1); s++) out.add(stepKey(r.id, s));
  }
  return out;
}

/** Move (or with `extend`, grow) the selection one step left or right (SQ34). */
export function moveSelection(
  pattern: StepPattern,
  selection: ReadonlySet<StepKey>,
  anchor: StepKey | null,
  dx: number,
  dy: number,
  extend: boolean
): { selection: Set<StepKey>; anchor: StepKey | null } {
  if (!anchor) {
    const first = pattern.rows[0];
    if (!first) return { selection: new Set(), anchor: null };
    const k = stepKey(first.id, 0);
    return { selection: new Set([k]), anchor: k };
  }
  const { rowId, step } = parseStepKey(anchor);
  const rowIndex = pattern.rows.findIndex((r) => r.id === rowId);
  const nextRow = pattern.rows[Math.max(0, Math.min(pattern.rows.length - 1, rowIndex + dy))];
  if (!nextRow) return { selection: new Set(selection), anchor };
  const nextStep = Math.max(0, Math.min(nextRow.lengthSteps - 1, step + dx));
  const k = stepKey(nextRow.id, nextStep);
  const next = extend ? new Set(selection) : new Set<StepKey>();
  next.add(k);
  return { selection: next, anchor: k };
}

// ── Playback modes ─────────────────────────────────────────────────────────

/** Playback modes with their keys (SQ35): `]` `[` P `\` Y U J. */
export const PLAYBACK_KEYS: ReadonlyArray<[string, StepPlaybackMode]> = [
  ["]", "forward"],
  ["[", "backward"],
  ["p", "pingPong"],
  ["\\", "shuffle"],
  ["y", "pendulum"],
  ["u", "wander"],
  ["j", "random"]
];

export const PLAYBACK_GLYPH: Readonly<Record<StepPlaybackMode, string>> = {
  forward: "→",
  backward: "←",
  pingPong: "⇄",
  pendulum: "↹",
  wander: "↝",
  shuffle: "⤨",
  random: "?"
};

// ── Page overview commands (p. 733) ────────────────────────────────────────

export type PageAction = "cut" | "copy" | "paste" | "clear";

/** One copied page: each row's 16 steps, by row id. */
export interface PageClipboard {
  rows: Record<string, Array<Step | undefined>>;
}

const pageRange = (row: StepRow, page: number, size: number): number[] => {
  const out: number[] = [];
  for (let s = page * size; s < Math.min((page + 1) * size, row.lengthSteps); s++) out.push(s);
  return out;
};

export function copyPage(pattern: Pick<StepPattern, "rows">, page: number, size: number): PageClipboard {
  const rows: PageClipboard["rows"] = {};
  for (const r of pattern.rows) rows[r.id] = Array.from({ length: size }, (_, i) => (r.steps[page * size + i] ? { ...r.steps[page * size + i]! } : undefined));
  return { rows };
}

/** Clear every step of a page in every row, one op per row that has steps there. */
export function clearPageOps(clipId: string, pattern: Pick<StepPattern, "rows">, page: number, size: number): TimelineOp[] {
  return pattern.rows.flatMap((r) => {
    const steps = pageRange(r, page, size);
    return steps.length ? [resetStepsOp(clipId, r.id, steps)] : [];
  });
}

/** Paste a copied page onto a page: each row takes its own copied steps, all settings included. */
export function pastePageOps(clipId: string, pattern: Pick<StepPattern, "rows">, clip: PageClipboard, page: number, size: number): TimelineOp[] {
  const ops: TimelineOp[] = [];
  for (const r of pattern.rows) {
    const src = clip.rows[r.id];
    const steps = pageRange(r, page, size);
    if (!src || steps.length === 0) continue;
    ops.push(resetStepsOp(clipId, r.id, steps));
    for (const s of steps) {
      const v = src[s - page * size];
      if (!v || Object.keys(v).length === 0) continue;
      ops.push({ op: "set_steps", clipId, row: r.id, steps: [s + 1], values: { ...v, on: v.on === true } } as TimelineOp);
    }
  }
  return ops;
}
