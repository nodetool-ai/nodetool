/**
 * Step Sequencer data model helpers: defaults, normalization, compaction,
 * labels, length resizing, subrows, sorting, transforms, text format (SQ47),
 * and MIDI -> Pattern conversion (SQ21).
 */

import type {
  MidiControllerLane,
  MidiInstrument,
  MidiNote,
  Step,
  StepAutomationMode,
  StepAutomationTarget,
  StepCondition,
  StepDegree,
  StepEditMode,
  StepKey,
  StepPattern,
  StepPlaybackMode,
  StepRate,
  StepRow,
  StepRowAssignment,
  StepRowSort,
  StepScaleId
} from "../types.js";
import { controllerValueAt } from "./controllers.js";
import { GM_DRUM_LANES } from "./stepEditor.js";
import {
  STEP_RATES,
  kitPadPitch,
  nudgeStepRate,
  resolveStepKey,
  rowKeyHash,
  shortestTonicDelta,
  stepHash,
  stepRateTicks
} from "./stepPatternExpand.js";

export const STEP_PATTERN_MAX_ROWS = 128;
export const STEP_PATTERN_MAX_STEPS = 64;
export const STEP_PATTERN_PAGE_SIZE = 16;

export const STEP_PLAYBACK_MODES: readonly StepPlaybackMode[] = [
  "forward",
  "backward",
  "pingPong",
  "pendulum",
  "wander",
  "shuffle",
  "random"
];

export const STEP_EDIT_MODES: readonly StepEditMode[] = [
  "onOff",
  "velocity",
  "value",
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

export const STEP_DEGREES: readonly StepDegree[] = [
  "root", "2nd", "3rd", "4th", "5th", "6th", "7th"
];

export const STEP_ROW_SORTS: readonly StepRowSort[] = [
  "none",
  "typeAsc",
  "typeDesc",
  "typeAndNoteAsc",
  "typeAndNoteDesc",
  "typeAndNameAsc",
  "typeAndNameDesc",
  "typeAndKitPadAsc",
  "typeAndKitPadDesc"
];

const NOTE_SUBROW_MODES: readonly StepEditMode[] = [
  "velocity", "gate", "tie", "note", "octave", "repeat", "chance", "offset", "stepRate", "skip", "loop"
];

const AUTOMATION_SUBROW_MODES: readonly StepEditMode[] = [
  "value", "chance", "offset", "stepRate", "skip", "loop"
];

export interface NormalizedStep {
  on: boolean;
  velocity: number;
  gate: number;
  tie: boolean;
  note: number;
  octave: number | undefined;
  repeat: number;
  chance: number;
  offset: number;
  stepRate: StepRate | undefined;
  skip: boolean;
  value: number | undefined;
  condition: StepCondition;
  midiChannel: number | undefined;
  articulation: number;
  velocityRamp: number;
  velocityCurve: number;
  distribution: number;
}

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

/** Normalize one step cell with the exact SQ5 / D77 defaults. */
export function normalizeStep(step: Partial<Step> = {}): NormalizedStep {
  const cond: StepCondition =
    step.condition?.type === "recurrence"
      ? {
          type: "recurrence",
          cycles: clampInt(step.condition.cycles, 2, 16),
          iteration: clampInt(
            step.condition.iteration,
            1,
            clampInt(step.condition.cycles, 2, 16)
          )
        }
      : step.condition?.type === "first" || step.condition?.type === "last"
        ? { type: step.condition.type }
        : { type: "always" };

  return {
    on: step.on === true,
    velocity: step.velocity !== undefined ? clampInt(step.velocity, 1, 127) : 100,
    gate: step.gate !== undefined ? clampInt(step.gate, 1, 100) : 100,
    tie: step.tie === true,
    note: step.note !== undefined ? clampInt(step.note, -12, 12) : 0,
    octave: step.octave !== undefined ? clampInt(step.octave, -2, 8) : undefined,
    repeat: step.repeat !== undefined ? clampInt(step.repeat, 1, 16) : 1,
    chance: step.chance !== undefined ? clampInt(step.chance, 0, 100) : 100,
    offset: step.offset !== undefined ? clampInt(step.offset, -50, 50) : 0,
    stepRate: step.stepRate,
    skip: step.skip === true,
    value: step.value !== undefined && Number.isFinite(step.value) ? step.value : undefined,
    condition: cond,
    midiChannel:
      step.midiChannel !== undefined ? clampInt(step.midiChannel, 1, 16) : undefined,
    articulation:
      step.articulation !== undefined ? clampInt(step.articulation, 0, 255) : 0,
    velocityRamp:
      step.velocityRamp !== undefined ? clampInt(step.velocityRamp, -100, 100) : 0,
    velocityCurve:
      step.velocityCurve !== undefined ? clampInt(step.velocityCurve, -100, 100) : 0,
    distribution:
      step.distribution !== undefined ? clampInt(step.distribution, -100, 100) : 0
  };
}

/** Omit every field equal to its SQ5 default so stored patterns stay small. */
export function compactStep(step: Partial<Step>): Step {
  const n = normalizeStep(step);
  const out: Step = {};
  if (n.on) out.on = true;
  if (n.velocity !== 100) out.velocity = n.velocity;
  if (n.gate !== 100) out.gate = n.gate;
  if (n.tie) out.tie = true;
  if (n.note !== 0) out.note = n.note;
  if (n.octave !== undefined) out.octave = n.octave;
  if (n.repeat !== 1) out.repeat = n.repeat;
  if (n.chance !== 100) out.chance = n.chance;
  if (n.offset !== 0) out.offset = n.offset;
  if (n.stepRate !== undefined) out.stepRate = n.stepRate;
  if (n.skip) out.skip = true;
  if (n.value !== undefined) out.value = n.value;
  if (n.condition.type !== "always") out.condition = n.condition;
  if (n.midiChannel !== undefined) out.midiChannel = n.midiChannel;
  if (n.articulation !== 0) out.articulation = n.articulation;
  if (n.velocityRamp !== 0) out.velocityRamp = n.velocityRamp;
  if (n.velocityCurve !== 0) out.velocityCurve = n.velocityCurve;
  if (n.distribution !== 0) out.distribution = n.distribution;
  return out;
}

/** Default subrows per row type (SQ8). */
export function defaultSubrowsForAssignment(assignment: StepRowAssignment): StepEditMode[] {
  switch (assignment.type) {
    case "note":
    case "kit":
      return ["velocity", "gate"];
    case "melodic":
      return ["note", "octave"];
    case "degree":
      return ["velocity", "octave"];
    case "automation":
      return ["value"];
  }
}

export function isNoteRow(row: Pick<StepRow, "assignment">): boolean {
  return row.assignment.type !== "automation";
}

function fitSteps(steps: readonly Step[] | undefined, lengthSteps: number): Step[] {
  const src = steps ?? [];
  const out: Step[] = [];
  for (let i = 0; i < lengthSteps; i++) {
    out.push(src[i] ? compactStep(src[i]!) : {});
  }
  return out;
}

/** Normalize one row against pattern-level defaults (SQ3). */
export function normalizeRow(
  partial: Partial<StepRow> & Pick<StepRow, "id" | "assignment">,
  defaults: Pick<StepPattern, "lengthSteps" | "stepRate" | "playback" | "midiChannel" | "automationMode">
): StepRow {
  const maxLen = clampInt(defaults.lengthSteps, 1, STEP_PATTERN_MAX_STEPS);
  const lengthSteps = clampInt(partial.lengthSteps ?? maxLen, 1, maxLen);
  const loopEnd = clampInt(partial.loopEnd ?? lengthSteps, 1, lengthSteps);
  const loopStart = clampInt(partial.loopStart ?? 0, 0, loopEnd - 1);
  const subrows = partial.subrows
    ? [...new Set(partial.subrows)]
    : defaultSubrowsForAssignment(partial.assignment);
  const row: StepRow = {
    id: partial.id,
    assignment: structuredClone(partial.assignment),
    mute: partial.mute === true,
    solo: partial.solo === true,
    lengthSteps,
    loopStart,
    loopEnd,
    stepRate: partial.stepRate ?? defaults.stepRate,
    playback: partial.playback ?? defaults.playback,
    midiChannel: clampInt(partial.midiChannel ?? defaults.midiChannel, 1, 16),
    automationMode: partial.automationMode ?? defaults.automationMode,
    subrows,
    steps: fitSteps(partial.steps, lengthSteps)
  };
  if (partial.name !== undefined) row.name = partial.name;
  if (partial.color !== undefined) row.color = partial.color;
  if (partial.subrowsExpanded !== undefined) row.subrowsExpanded = partial.subrowsExpanded;
  return row;
}

/** Normalize a pattern with exact SQ2 defaults. Pure and deterministic. */
export function normalizePattern(partial: Partial<StepPattern> = {}): StepPattern {
  const lengthSteps = clampInt(partial.lengthSteps ?? 16, 1, STEP_PATTERN_MAX_STEPS);
  const stepRate: StepRate = partial.stepRate ?? "1/16";
  const playback: StepPlaybackMode = partial.playback ?? "forward";
  const midiChannel = clampInt(partial.midiChannel ?? 1, 1, 16);
  const automationMode: StepAutomationMode = partial.automationMode ?? "latch";
  const seed =
    partial.seed !== undefined && Number.isFinite(partial.seed)
      ? partial.seed >>> 0
      : 1;
  const defaults = { lengthSteps, stepRate, playback, midiChannel, automationMode };
  const rows = (partial.rows ?? [])
    .slice(0, STEP_PATTERN_MAX_ROWS)
    .map((r) => normalizeRow(r, defaults));
  const out: StepPattern = {
    version: 1,
    seed,
    lengthSteps,
    stepRate,
    playback,
    legato: partial.legato === true,
    swing: clampInt(partial.swing ?? 0, 0, 100),
    swingDivision: partial.swingDivision ?? "1/16",
    pitchSource: partial.pitchSource ?? "off",
    scale: (partial.scale ?? "chromatic") as StepScaleId,
    noTranspose: partial.noTranspose === true,
    scaleQuantize: partial.scaleQuantize === true,
    midiChannel,
    automationMode,
    mono: partial.mono === true,
    name: partial.name ?? "Pattern",
    rows
  };
  if (partial.key !== undefined) out.key = resolveStepKey(partial.key);
  if (
    partial.rowSort !== undefined &&
    partial.rowSort !== "none" &&
    STEP_ROW_SORTS.includes(partial.rowSort)
  ) {
    out.rowSort = partial.rowSort;
  }
  return out;
}

/** Validate a stored pattern and return human-readable problems. */
export function validateStepPattern(pattern: StepPattern): string[] {
  const problems: string[] = [];
  if (pattern.version !== 1) {
    problems.push(`Unsupported pattern version ${String(pattern.version)}; expected 1.`);
  }
  if (!Number.isInteger(pattern.lengthSteps) || pattern.lengthSteps < 1 || pattern.lengthSteps > STEP_PATTERN_MAX_STEPS) {
    problems.push(`lengthSteps must be an integer 1..${STEP_PATTERN_MAX_STEPS}, got ${pattern.lengthSteps}.`);
  }
  if (!STEP_RATES.includes(pattern.stepRate)) {
    problems.push(`Invalid pattern stepRate "${String(pattern.stepRate)}".`);
  }
  if (pattern.rowSort !== undefined && !STEP_ROW_SORTS.includes(pattern.rowSort)) {
    problems.push(
      `Invalid pattern rowSort "${String(pattern.rowSort)}". Valid values: ${STEP_ROW_SORTS.join(", ")}.`
    );
  }
  if (pattern.rows.length > STEP_PATTERN_MAX_ROWS) {
    problems.push(`A pattern supports at most ${STEP_PATTERN_MAX_ROWS} rows; found ${pattern.rows.length}.`);
  }
  const ids = new Set<string>();
  for (const row of pattern.rows) {
    if (ids.has(row.id)) {
      problems.push(`Duplicate row id "${row.id}".`);
    }
    ids.add(row.id);
    if (row.lengthSteps < 1 || row.lengthSteps > pattern.lengthSteps) {
      problems.push(
        `Row "${row.id}" lengthSteps (${row.lengthSteps}) must be within 1..${pattern.lengthSteps}.`
      );
    }
    if (row.steps.length !== row.lengthSteps) {
      problems.push(`Row "${row.id}" has ${row.steps.length} steps, expected ${row.lengthSteps}.`);
    }
    if (row.loopStart < 0 || row.loopEnd > row.lengthSteps || row.loopStart >= row.loopEnd) {
      problems.push(`Row "${row.id}" has invalid loop range [${row.loopStart}, ${row.loopEnd}).`);
    }
    if (new Set(row.subrows).size !== row.subrows.length) {
      problems.push(`Row "${row.id}" has duplicate subrow edit modes.`);
    }
  }
  return problems;
}

// ── Labels (SQ4) ────────────────────────────────────────────────────────────

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Step Sequencer note name with C3 = 60 (SQ4, D80). */
export function stepNoteName(pitch: number): string {
  const p = clampInt(pitch, 0, 127);
  const name = NOTE_NAMES_SHARP[p % 12]!;
  const octave = Math.floor(p / 12) - 2;
  return `${name}${octave}`;
}

const DEGREE_LABELS: Readonly<Record<StepDegree, string>> = {
  root: "Root",
  "2nd": "2nd",
  "3rd": "3rd",
  "4th": "4th",
  "5th": "5th",
  "6th": "6th",
  "7th": "7th"
};

/** Display label of `row` (SQ4). */
export function rowLabel(
  row: Pick<StepRow, "assignment" | "name">,
  instrument?: MidiInstrument
): string {
  if (row.name && row.name.trim().length > 0) return row.name;
  const a = row.assignment;
  switch (a.type) {
    case "kit": {
      if (instrument?.type === "drum") {
        return instrument.pads[a.pad]?.name ?? `Pad ${a.pad + 1}`;
      }
      if (instrument?.type === "sampler") {
        return instrument.zones[a.pad]?.name ?? `Pad ${a.pad + 1}`;
      }
      const gm = GM_DRUM_LANES.find((l) => l.pitch === 36 + a.pad);
      return gm?.name ?? `Pad ${a.pad + 1}`;
    }
    case "note": {
      const isNonMelodic =
        instrument?.type === "drum" ||
        (instrument?.type === "sampler" && instrument.oneShot);
      if (isNonMelodic) {
        const gm = GM_DRUM_LANES.find((l) => l.pitch === a.pitch);
        if (gm) return gm.name;
      }
      return stepNoteName(a.pitch);
    }
    case "melodic":
      return stepNoteName(a.pitch);
    case "degree":
      return `${DEGREE_LABELS[a.degree]} : ${a.octave}`;
    case "automation": {
      const t = a.target;
      if (t.kind === "cc") return `CC ${t.cc}`;
      if (t.kind === "pitchBend") return "Pitch Bend";
      if (t.kind === "channelPressure") return "Channel Pressure";
      return t.param;
    }
  }
}

// ── Pattern & row mutations (SQ2–SQ8, SQ18, SQ36–SQ37) ──────────────────────

/** Append a row to `pattern`, enforcing the 128-row limit (SQ3) and active rowSort (SQ36). */
export function addPatternRow(
  pattern: StepPattern,
  input: Partial<StepRow> & Pick<StepRow, "id" | "assignment">,
  instrument?: MidiInstrument
): StepPattern {
  if (pattern.rows.length >= STEP_PATTERN_MAX_ROWS) {
    throw new Error(
      `Cannot add row: a pattern holds at most ${STEP_PATTERN_MAX_ROWS} rows.`
    );
  }
  const row = normalizeRow(input, pattern);
  return applyPatternRowSort({ ...pattern, rows: [...pattern.rows, row] }, instrument);
}

/** Set pattern stepRate and write through to every row (SQ2). */
export function setPatternStepRate(pattern: StepPattern, stepRate: StepRate): StepPattern {
  stepRateTicks(stepRate);
  return {
    ...pattern,
    stepRate,
    rows: pattern.rows.map((r) => ({ ...r, stepRate }))
  };
}

/** Set pattern playback mode and write through to every row (SQ2). */
export function setPatternPlayback(
  pattern: StepPattern,
  playback: StepPlaybackMode
): StepPattern {
  return {
    ...pattern,
    playback,
    rows: pattern.rows.map((r) => ({ ...r, playback }))
  };
}

/** Set pattern MIDI channel and write through to every row (SQ2). */
export function setPatternMidiChannel(
  pattern: StepPattern,
  midiChannel: number
): StepPattern {
  const ch = clampInt(midiChannel, 1, 16);
  return {
    ...pattern,
    midiChannel: ch,
    rows: pattern.rows.map((r) => ({ ...r, midiChannel: ch }))
  };
}

/** Set pattern automation mode and write through to every row (SQ2). */
export function setPatternAutomationMode(
  pattern: StepPattern,
  automationMode: StepAutomationMode
): StepPattern {
  return {
    ...pattern,
    automationMode,
    rows: pattern.rows.map((r) => ({ ...r, automationMode }))
  };
}

/** Write loop start/end through to every row (SQ2). */
export function setPatternLoop(
  pattern: StepPattern,
  loopStart?: number,
  loopEnd?: number
): StepPattern {
  return {
    ...pattern,
    rows: pattern.rows.map((r) => {
      const nextEnd =
        loopEnd !== undefined ? clampInt(loopEnd, 1, r.lengthSteps) : r.loopEnd;
      const nextStart =
        loopStart !== undefined
          ? clampInt(loopStart, 0, nextEnd - 1)
          : Math.min(r.loopStart, nextEnd - 1);
      return { ...r, loopStart: nextStart, loopEnd: nextEnd };
    })
  };
}

/** Resize a row's step array, repeating from step 0 when growing (SQ7). */
export function resizeRowLength(row: StepRow, newLength: number): StepRow {
  const nextLen = clampInt(newLength, 1, STEP_PATTERN_MAX_STEPS);
  const oldLen = row.steps.length;
  const steps: Step[] = [];
  for (let i = 0; i < nextLen; i++) {
    const src = oldLen > 0 ? row.steps[i % oldLen] : undefined;
    steps.push(src ? structuredClone(src) : {});
  }
  const loopEnd = row.loopEnd === row.lengthSteps ? nextLen : Math.min(row.loopEnd, nextLen);
  const loopStart = Math.min(row.loopStart, loopEnd - 1);
  return {
    ...row,
    lengthSteps: nextLen,
    loopStart,
    loopEnd,
    steps
  };
}

/**
 * Resize pattern length (SQ7): growing repeats steps from step 0; rows whose
 * length matched the old pattern length follow, shorter rows stay shorter, and
 * rows longer than `newLength` are cut.
 */
export function resizePatternLength(pattern: StepPattern, newLength: number): StepPattern {
  const nextLen = clampInt(newLength, 1, STEP_PATTERN_MAX_STEPS);
  const oldLen = pattern.lengthSteps;
  const rows = pattern.rows.map((row) => {
    if (row.lengthSteps === oldLen || row.lengthSteps > nextLen) {
      return resizeRowLength(row, nextLen);
    }
    return row;
  });
  return { ...pattern, lengthSteps: nextLen, rows };
}

/**
 * Change pattern key, transposing pitched (`note` / `melodic`) rows by the
 * shortest tonic interval unless `noTranspose` is set (SQ18).
 */
export function setPatternKey(pattern: StepPattern, nextKey: StepKey): StepPattern {
  const oldK = resolveStepKey(pattern.key);
  const newK = resolveStepKey(nextKey);
  if (pattern.noTranspose || oldK.tonic === newK.tonic) {
    return { ...pattern, key: newK };
  }
  const delta = shortestTonicDelta(oldK.tonic, newK.tonic);
  const rows = pattern.rows.map((row) => {
    if (row.assignment.type !== "note" && row.assignment.type !== "melodic") {
      return row;
    }
    const oldPc = ((row.assignment.pitch % 12) + 12) % 12;
    const octWrap = Math.floor((oldPc + delta) / 12);
    const nextPitch = clampInt(row.assignment.pitch + delta, 0, 127);
    const steps =
      octWrap === 0
        ? row.steps
        : row.steps.map((s) =>
            s.octave !== undefined
              ? compactStep({ ...s, octave: clampInt(s.octave + octWrap, -2, 8) })
              : s
          );
    return {
      ...row,
      assignment: { ...row.assignment, pitch: nextPitch },
      steps
    };
  });
  return { ...pattern, key: newK, rows };
}

/** Add a subrow set to the next unused edit mode for `row` (SQ8). */
export function addRowSubrow(row: StepRow): StepRow {
  const candidates =
    row.assignment.type === "automation" ? AUTOMATION_SUBROW_MODES : NOTE_SUBROW_MODES;
  const used = new Set(row.subrows);
  const next = candidates.find((m) => !used.has(m));
  if (!next) {
    throw new Error(`Row "${row.id}" already shows every available edit mode.`);
  }
  return { ...row, subrows: [...row.subrows, next] };
}

/** Change subrow `index` to `mode`, refusing modes already used by another subrow (SQ8). */
export function setRowSubrowMode(
  row: StepRow,
  index: number,
  mode: StepEditMode
): StepRow {
  if (index < 0 || index >= row.subrows.length) {
    throw new Error(`Subrow index ${index} out of range 0..${row.subrows.length - 1}.`);
  }
  if (row.subrows.some((m, i) => i !== index && m === mode)) {
    throw new Error(
      `Subrow mode "${mode}" is already used on row "${row.id}". Two subrows cannot share a mode.`
    );
  }
  const subrows = [...row.subrows];
  subrows[index] = mode;
  return { ...row, subrows };
}

const VALUE_ACTIVATION_KEYS: readonly (keyof Step)[] = [
  "velocity", "gate", "note", "octave", "repeat", "chance", "offset",
  "value", "condition", "midiChannel", "articulation", "velocityRamp",
  "velocityCurve", "distribution"
];

/**
 * Edit one step on `row` (SQ4, SQ32, SQ52).
 * - Editing `note` or `octave` on a fixed `note` row converts it to `melodic`.
 * - Editing a value field on an off step turns it on (unless `on: false` is explicit
 *   or `keepOff` is set, as in SQ33 Shift-ramp).
 */
export function setStepValue(
  row: StepRow,
  stepIndex: number,
  values: Partial<Step>,
  options: { keepOff?: boolean } = {}
): StepRow {
  if (stepIndex < 0 || stepIndex >= row.steps.length) {
    throw new Error(
      `Step ${stepIndex + 1} is outside row length 1..${row.steps.length}.`
    );
  }
  let assignment = row.assignment;
  if (
    assignment.type === "note" &&
    (values.note !== undefined || values.octave !== undefined)
  ) {
    assignment = { type: "melodic", pitch: assignment.pitch };
  }
  const current = row.steps[stepIndex] ?? {};
  const merged: Step = { ...current, ...values };
  const setsValue = VALUE_ACTIVATION_KEYS.some((k) => values[k] !== undefined);
  if (setsValue && values.on === undefined && !options.keepOff && !current.on) {
    merged.on = true;
  }
  const steps = [...row.steps];
  steps[stepIndex] = compactStep(merged);
  return { ...row, assignment, steps };
}

/** In Mono mode, turn off all other note/kit/melodic/degree rows at `stepIndices` (SQ37). */
export function applyMonoAtSteps(
  pattern: StepPattern,
  activeRowId: string,
  stepIndices: ReadonlyArray<number>
): StepPattern {
  if (!pattern.mono || stepIndices.length === 0) return pattern;
  const activeRow = pattern.rows.find((r) => r.id === activeRowId);
  if (!activeRow || !isNoteRow(activeRow)) return pattern;
  const idxSet = new Set(stepIndices);
  return {
    ...pattern,
    rows: pattern.rows.map((r) => {
      if (r.id === activeRowId || !isNoteRow(r)) return r;
      let changed = false;
      const steps = r.steps.map((s, i) => {
        if (!idxSet.has(i) || !s.on) return s;
        changed = true;
        return compactStep({ ...s, on: false });
      });
      return changed ? { ...r, steps } : r;
    })
  };
}

/** Deep equality of two normalized patterns (for SQ24 join). */
export function patternsEqual(a: StepPattern, b: StepPattern): boolean {
  return JSON.stringify(normalizePattern(a)) === JSON.stringify(normalizePattern(b));
}

/** Return a template copy of `pattern`: rows, subrows and settings kept, step values cleared (SQ44). */
export function stripPatternSteps(pattern: StepPattern): StepPattern {
  return {
    ...structuredClone(pattern),
    rows: pattern.rows.map((r) => ({
      ...structuredClone(r),
      steps: Array.from({ length: r.lengthSteps }, () => ({}))
    }))
  };
}

// ── Sorting (SQ36, SQ51) ────────────────────────────────────────────────────

export type StepRowSortBy = "type" | "typeAndNote" | "typeAndName" | "typeAndKitPad";

/** Decode a persisted `StepRowSort` value into criterion + direction, or `null` for none. */
export function parseStepRowSort(
  rowSort: StepRowSort | undefined
): { by: StepRowSortBy; descending: boolean } | null {
  switch (rowSort) {
    case "typeAsc":
      return { by: "type", descending: false };
    case "typeDesc":
      return { by: "type", descending: true };
    case "typeAndNoteAsc":
      return { by: "typeAndNote", descending: false };
    case "typeAndNoteDesc":
      return { by: "typeAndNote", descending: true };
    case "typeAndNameAsc":
      return { by: "typeAndName", descending: false };
    case "typeAndNameDesc":
      return { by: "typeAndName", descending: true };
    case "typeAndKitPadAsc":
      return { by: "typeAndKitPad", descending: false };
    case "typeAndKitPadDesc":
      return { by: "typeAndKitPad", descending: true };
    default:
      return null;
  }
}

/** Encode a sort criterion + direction into its persisted `StepRowSort` value. */
export function formatStepRowSort(
  by: StepRowSortBy,
  descending = false
): Exclude<StepRowSort, "none"> {
  return `${by}${descending ? "Desc" : "Asc"}` as Exclude<StepRowSort, "none">;
}

/** Re-apply `pattern.rowSort` if active, otherwise return `pattern` unchanged. */
export function applyPatternRowSort(
  pattern: StepPattern,
  instrument?: MidiInstrument
): StepPattern {
  const spec = parseStepRowSort(pattern.rowSort);
  return spec ? sortPatternRows(pattern, spec.by, spec.descending, instrument) : pattern;
}

function assignmentTypeRank(a: StepRowAssignment): number {
  switch (a.type) {
    case "note":
    case "kit":
      return 0;
    case "melodic":
    case "degree":
      return 1;
    case "automation":
      switch (a.target.kind) {
        case "cc":
          return 2;
        case "pitchBend":
          return 3;
        case "channelPressure":
          return 4;
        case "device":
          return 5;
      }
  }
}

function assignmentNoteKey(a: StepRowAssignment, instrument?: MidiInstrument): number {
  switch (a.type) {
    case "note":
    case "melodic":
      return a.pitch;
    case "kit":
      return kitPadPitch(a.pad, instrument);
    case "degree":
      return (a.octave + 2) * 12 + STEP_DEGREES.indexOf(a.degree);
    case "automation":
      return a.target.kind === "cc" ? a.target.cc : 0;
  }
}

/** Sort rows according to SQ36 View > Sort Rows rules. */
export function sortPatternRows(
  pattern: StepPattern,
  by: StepRowSortBy,
  descending = false,
  instrument?: MidiInstrument
): StepPattern {
  const dir = descending ? -1 : 1;
  const indexed = pattern.rows.map((row, idx) => ({ row, idx }));
  indexed.sort((a, b) => {
    const typeCmp = assignmentTypeRank(a.row.assignment) - assignmentTypeRank(b.row.assignment);
    if (typeCmp !== 0) return typeCmp * dir;
    if (by === "typeAndNote") {
      const noteCmp =
        assignmentNoteKey(a.row.assignment, instrument) -
        assignmentNoteKey(b.row.assignment, instrument);
      if (noteCmp !== 0) return noteCmp * dir;
    } else if (by === "typeAndName") {
      const nameCmp = rowLabel(a.row, instrument).localeCompare(
        rowLabel(b.row, instrument)
      );
      if (nameCmp !== 0) return nameCmp * dir;
    } else if (by === "typeAndKitPad") {
      const padA = a.row.assignment.type === "kit" ? a.row.assignment.pad : assignmentNoteKey(a.row.assignment, instrument);
      const padB = b.row.assignment.type === "kit" ? b.row.assignment.pad : assignmentNoteKey(b.row.assignment, instrument);
      if (padA !== padB) return (padA - padB) * dir;
    }
    return a.idx - b.idx;
  });
  return { ...pattern, rows: indexed.map((x) => x.row) };
}

// ── Pattern text format (SQ47, SQ60) ────────────────────────────────────────

const DRUM_ALIASES: Readonly<Record<string, number>> = {
  kick: 36, bd: 36, "bass drum": 36,
  snare: 38, sd: 38, "snare 2": 40,
  "side stick": 37, rim: 37, rimshot: 37,
  clap: 39, cp: 39,
  "closed hi-hat": 42, "closed hat": 42, "hi-hat": 42, hihat: 42, hat: 42, ch: 42, hh: 42,
  "pedal hi-hat": 44, "pedal hat": 44,
  "open hi-hat": 46, "open hat": 46, oh: 46,
  "low tom": 41, "mid tom": 45, "high tom": 48,
  crash: 49, ride: 51, "ride bell": 53, tambourine: 54, tamb: 54, cowbell: 56, cb: 56
};

const NOTE_NAME_RE = /^([A-Ga-g])([#b]?)(-?\d)$/;
const LETTER_SEMITONE: Readonly<Record<string, number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

/** Parse a note name with C3 = 60 (SQ4, D80), or undefined. */
export function parseStepNoteName(name: string): number | undefined {
  const m = NOTE_NAME_RE.exec(name.trim());
  if (!m) return undefined;
  const base = LETTER_SEMITONE[m[1]!.toUpperCase()]!;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const oct = Number(m[3]!);
  const pitch = (oct + 2) * 12 + base + acc;
  return pitch >= 0 && pitch <= 127 ? pitch : undefined;
}

/** Infer a row assignment from a pattern-text row name (SQ47). */
export function assignmentFromRowName(
  name: string,
  instrument?: MidiInstrument
): { assignment: StepRowAssignment; customName?: string } {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Kit pads on DR-1 or Sampler
  if (instrument?.type === "drum") {
    const padIdx = instrument.pads.findIndex((p) => p.name.toLowerCase() === lower);
    if (padIdx >= 0) return { assignment: { type: "kit", pad: padIdx } };
  } else if (instrument?.type === "sampler") {
    const zoneIdx = instrument.zones.findIndex((z) => z.name.toLowerCase() === lower);
    if (zoneIdx >= 0 && zoneIdx < 16) return { assignment: { type: "kit", pad: zoneIdx } };
  }

  // CC / pitchBend / channelPressure
  const ccMatch = /^cc\s*(\d+)$/i.exec(trimmed);
  if (ccMatch) {
    const cc = Number(ccMatch[1]!);
    if (cc >= 0 && cc <= 127) {
      return { assignment: { type: "automation", target: { kind: "cc", cc } } };
    }
  }
  if (lower === "pitch bend" || lower === "pitchbend") {
    return { assignment: { type: "automation", target: { kind: "pitchBend" } } };
  }
  if (lower === "channel pressure" || lower === "channelpressure") {
    return { assignment: { type: "automation", target: { kind: "channelPressure" } } };
  }

  // Degree (`Root : 3`)
  const degMatch = /^(root|2nd|3rd|4th|5th|6th|7th)\s*:\s*(-?\d+)$/i.exec(trimmed);
  if (degMatch) {
    const degree = degMatch[1]!.toLowerCase() as StepDegree;
    const octave = clampInt(Number(degMatch[2]!), -2, 8);
    return { assignment: { type: "degree", degree, octave } };
  }

  // GM drum names & aliases
  const gmLane = GM_DRUM_LANES.find((l) => l.name.toLowerCase() === lower);
  if (gmLane) {
    if (instrument?.type === "drum") {
      const idx = gmLane.pitch - instrument.baseNote;
      if (idx >= 0 && idx < instrument.pads.length) {
        return { assignment: { type: "kit", pad: idx } };
      }
    }
    return { assignment: { type: "note", pitch: gmLane.pitch }, customName: gmLane.name };
  }
  const aliasPitch = DRUM_ALIASES[lower];
  if (aliasPitch !== undefined) {
    if (instrument?.type === "drum") {
      const idx = aliasPitch - instrument.baseNote;
      if (idx >= 0 && idx < instrument.pads.length) {
        return { assignment: { type: "kit", pad: idx } };
      }
    }
    return { assignment: { type: "note", pitch: aliasPitch }, customName: trimmed };
  }

  // Note name (C3 = 60)
  const notePitch = parseStepNoteName(trimmed);
  if (notePitch !== undefined) {
    return { assignment: { type: "note", pitch: notePitch } };
  }

  return { assignment: { type: "note", pitch: 60 }, customName: trimmed };
}

/** Encode one step to its SQ47 character. */
export function stepToChar(step: Step): string {
  if (step.skip) return "_";
  if (step.tie) return "-";
  if (!step.on) return ".";
  const vel = step.velocity ?? 100;
  if (vel >= 120) return "X";
  if (vel <= 60) return "o";
  return "x";
}

/** Decode one SQ47 character to a compacted `Step`. */
export function charToStep(ch: string): Step {
  switch (ch) {
    case "x":
      return { on: true };
    case "X":
      return { on: true, velocity: 127 };
    case "o":
      return { on: true, velocity: 50 };
    case ".":
      return {};
    case "-":
      return { tie: true };
    case "_":
      return { skip: true };
    default:
      throw new Error(
        `Invalid pattern step character "${ch}". Valid characters: x (on), X (vel 127), o (vel 50), . (off), - (tie), _ (skip).`
      );
  }
}

/** Render `pattern` to SQ47 text (one line per row, steps grouped by 4). */
export function patternToText(
  pattern: StepPattern,
  instrument?: MidiInstrument
): string {
  return pattern.rows
    .map((row) => {
      const label = rowLabel(row, instrument);
      const ratePart = row.stepRate !== pattern.stepRate ? ` | ${row.stepRate}` : "";
      const chars = row.steps.map(stepToChar);
      const groups: string[] = [];
      for (let i = 0; i < chars.length; i += 4) {
        groups.push(chars.slice(i, i + 4).join(""));
      }
      return `${label}${ratePart}: ${groups.join(" ")}`;
    })
    .join("\n");
}

export interface ParsedPatternLine {
  name: string;
  stepRate?: StepRate;
  steps: Step[];
}

/** Parse SQ47 pattern text lines into structured row entries. */
export function parsePatternTextLines(text: string): ParsedPatternLine[] {
  const lines = text.split(/\r?\n/);
  const parsed: ParsedPatternLine[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.lastIndexOf(":");
    if (colon <= 0) {
      throw new Error(
        `Invalid pattern text line "${trimmed}". Expected "<row name> [| rate]: <steps>".`
      );
    }
    const header = trimmed.slice(0, colon).trim();
    const stepsPart = trimmed.slice(colon + 1);
    let name = header;
    let stepRate: StepRate | undefined;
    const pipe = header.lastIndexOf("|");
    if (pipe > 0) {
      name = header.slice(0, pipe).trim();
      const rateText = header.slice(pipe + 1).trim();
      if (!STEP_RATES.includes(rateText as StepRate)) {
        throw new Error(
          `Invalid step rate "${rateText}" on row "${name}". Valid rates: ${STEP_RATES.join(", ")}.`
        );
      }
      stepRate = rateText as StepRate;
    }
    const compactChars = stepsPart.replace(/[\s|]+/g, "");
    if (compactChars.length === 0) {
      throw new Error(`Row "${name}" has no step characters after ":".`);
    }
    if (compactChars.length > STEP_PATTERN_MAX_STEPS) {
      throw new Error(
        `Row "${name}" has ${compactChars.length} steps; maximum is ${STEP_PATTERN_MAX_STEPS}.`
      );
    }
    const steps: Step[] = [];
    for (let i = 0; i < compactChars.length; i++) {
      steps.push(charToStep(compactChars[i]!));
    }
    parsed.push({ name, stepRate, steps });
  }
  return parsed;
}

/** Parse SQ47 pattern text into a normalized `StepPattern` (SQ47, SQ60). */
export function patternFromText(
  text: string,
  options: {
    name?: string;
    seed?: number;
    stepRate?: StepRate;
    instrument?: MidiInstrument;
    newRowId?: (index: number) => string;
  } = {}
): StepPattern {
  const lines = parsePatternTextLines(text);
  const lengthSteps =
    lines.length > 0
      ? clampInt(Math.max(...lines.map((l) => l.steps.length)), 1, STEP_PATTERN_MAX_STEPS)
      : 16;
  const baseRate: StepRate = options.stepRate ?? "1/16";
  const rows: StepRow[] = lines.map((line, i) => {
    const inferred = assignmentFromRowName(line.name, options.instrument);
    const id = options.newRowId ? options.newRowId(i) : `row_${i + 1}`;
    const partialRow: Partial<StepRow> & Pick<StepRow, "id" | "assignment"> = {
      id,
      assignment: inferred.assignment,
      lengthSteps: line.steps.length,
      loopStart: 0,
      loopEnd: line.steps.length,
      stepRate: line.stepRate ?? baseRate,
      steps: line.steps
    };
    if (inferred.customName !== undefined) partialRow.name = inferred.customName;
    return normalizeRow(
      partialRow,
      {
        lengthSteps,
        stepRate: baseRate,
        playback: "forward",
        midiChannel: 1,
        automationMode: "latch"
      }
    );
  });
  return normalizePattern({
    name: options.name ?? "Pattern",
    seed: options.seed ?? 1,
    lengthSteps,
    stepRate: baseRate,
    rows
  });
}

// ── MIDI -> Pattern conversion (SQ21, SQ60) ─────────────────────────────────

export interface MidiToPatternOptions {
  clipLengthTicks: number;
  windowStartTick?: number;
  stepRate?: StepRate;
  instrument?: MidiInstrument;
  seed?: number;
  name?: string;
  newRowId?: (index: number) => string;
}

export interface MidiToPatternResult {
  pattern: StepPattern;
  droppedNotes: number;
  mergedCollisions: number;
}

/** Convert MIDI notes and controller lanes into a StepPattern (SQ21, SQ60). */
export function midiToPattern(
  notes: ReadonlyArray<MidiNote>,
  controllers: ReadonlyArray<MidiControllerLane> = [],
  options: MidiToPatternOptions
): MidiToPatternResult {
  const stepRate: StepRate = options.stepRate ?? "1/16";
  const stepTicks = stepRateTicks(stepRate);
  const windowStart = options.windowStartTick ?? 0;
  const rawSteps = Math.ceil(Math.max(1, options.clipLengthTicks) / stepTicks);
  const lengthSteps = Math.max(1, Math.min(STEP_PATTERN_MAX_STEPS, rawSteps));

  const windowEnd = windowStart + options.clipLengthTicks;
  const inWindow = notes.filter(
    (n) => !n.muted && n.startTick >= windowStart && n.startTick < windowEnd
  );

  // Group by pitch, highest first (SQ21).
  const byPitch = new Map<number, MidiNote[]>();
  for (const note of inWindow) {
    const list = byPitch.get(note.pitch);
    if (list) list.push(note);
    else byPitch.set(note.pitch, [note]);
  }
  const pitches = [...byPitch.keys()].sort((a, b) => b - a);

  let droppedNotes = 0;
  let mergedCollisions = 0;
  const rows: StepRow[] = [];
  let rowCounter = 0;
  const nextRowId = () =>
    options.newRowId ? options.newRowId(rowCounter++) : `row_${++rowCounter}`;

  const patternDefaults = {
    lengthSteps,
    stepRate,
    playback: "forward" as const,
    midiChannel: 1,
    automationMode: "latch" as const
  };

  for (const pitch of pitches) {
    if (rows.length >= STEP_PATTERN_MAX_ROWS) {
      droppedNotes += byPitch.get(pitch)!.length;
      continue;
    }
    const pitchNotes = [...byPitch.get(pitch)!].sort((a, b) => a.startTick - b.startTick);
    const steps: Step[] = Array.from({ length: lengthSteps }, () => ({}));
    const placed: Array<{ idx: number; note: MidiNote; offset: number }> = [];
    const byStep = new Map<number, { idx: number; note: MidiNote; offset: number }>();

    for (const note of pitchNotes) {
      const rel = note.startTick - windowStart;
      if (rel < 0 || rel >= lengthSteps * stepTicks) {
        droppedNotes++;
        continue;
      }
      const idx = Math.min(lengthSteps - 1, Math.round(rel / stepTicks));
      const rem = rel - idx * stepTicks;
      const offset = clampInt((rem / stepTicks) * 100, -50, 50);
      const prev = byStep.get(idx);
      if (prev) {
        mergedCollisions++;
        if (note.velocity > prev.note.velocity) {
          prev.note = note;
          prev.offset = offset;
        }
      } else {
        const entry = { idx, note, offset };
        byStep.set(idx, entry);
        placed.push(entry);
      }
    }

    if (placed.length === 0) continue;
    placed.sort((a, b) => a.idx - b.idx);

    for (let p = 0; p < placed.length; p++) {
      const { idx, note, offset } = placed[p]!;
      const nextNoteIdx = p + 1 < placed.length ? placed[p + 1]!.idx : lengthSteps;
      const maxSpan = Math.max(1, nextNoteIdx - idx);
      const desiredSpan = Math.max(1, Math.ceil(note.durationTick / stepTicks));
      const span = Math.min(maxSpan, desiredSpan);
      const ch1 = (note.channel ?? 0) + 1;

      if (span === 1) {
        const gate = clampInt((note.durationTick / stepTicks) * 100, 1, 100);
        steps[idx] = compactStep({
          on: true,
          velocity: note.velocity,
          gate,
          offset,
          midiChannel: ch1 !== 1 ? ch1 : undefined
        });
      } else {
        steps[idx] = compactStep({
          on: true,
          velocity: note.velocity,
          gate: 100,
          offset,
          midiChannel: ch1 !== 1 ? ch1 : undefined
        });
        for (let k = 1; k < span; k++) {
          const isLast = k === span - 1;
          const tailTicks = note.durationTick - (span - 1) * stepTicks;
          const gate = isLast ? clampInt((tailTicks / stepTicks) * 100, 1, 100) : 100;
          steps[idx + k] = compactStep({ tie: true, gate });
        }
      }
    }

    let assignment: StepRowAssignment = { type: "note", pitch };
    if (options.instrument?.type === "drum") {
      const pad = pitch - options.instrument.baseNote;
      if (pad >= 0 && pad < options.instrument.pads.length) {
        assignment = { type: "kit", pad };
      }
    } else if (options.instrument?.type === "sampler") {
      const pad = options.instrument.zones.findIndex((z) => z.rootNote === pitch);
      if (pad >= 0 && pad < 16) {
        assignment = { type: "kit", pad };
      }
    }

    rows.push(
      normalizeRow(
        { id: nextRowId(), assignment, lengthSteps, loopStart: 0, loopEnd: lengthSteps, steps },
        patternDefaults
      )
    );
  }

  // Controller lanes -> automation rows (SQ21).
  for (const lane of controllers) {
    if (rows.length >= STEP_PATTERN_MAX_ROWS) break;
    let target: StepAutomationTarget | null = null;
    if (lane.kind === "cc" && lane.cc !== undefined) {
      target = { kind: "cc", cc: lane.cc };
    } else if (lane.kind === "pitchBend") {
      target = { kind: "pitchBend" };
    } else if (lane.kind === "channelPressure") {
      target = { kind: "channelPressure" };
    }
    if (!target) continue;

    const steps: Step[] = Array.from({ length: lengthSteps }, () => ({}));
    let anyOn = false;
    for (let i = 0; i < lengthSteps; i++) {
      const s0 = windowStart + i * stepTicks;
      const s1 = s0 + stepTicks;
      const inStep = lane.points.filter((p) => p.tick >= s0 && p.tick < s1);
      if (inStep.length === 0) continue;
      const val = controllerValueAt(lane, s0) ?? inStep[0]!.value;
      steps[i] = compactStep({ on: true, value: Math.round(val) });
      anyOn = true;
    }
    if (!anyOn) continue;

    rows.push(
      normalizeRow(
        {
          id: nextRowId(),
          assignment: { type: "automation", target },
          lengthSteps,
          loopStart: 0,
          loopEnd: lengthSteps,
          midiChannel: (lane.channel ?? 0) + 1,
          automationMode: lane.interpolation === "step" ? "latch" : "slide",
          steps
        },
        patternDefaults
      )
    );
  }

  const pattern = normalizePattern({
    name: options.name ?? "Pattern",
    seed: options.seed ?? 1,
    lengthSteps,
    stepRate,
    rows
  });
  return { pattern, droppedNotes, mergedCollisions };
}

// ── Selection & transform helpers for SQ51–SQ53 ─────────────────────────────

/**
 * Parse 1-based step selector ("1,5,9" | "1-16" | [1, 5]) into sorted unique
 * 0-based step indices within `[0, maxSteps)` (D97, SQ52).
 */
export function parseStepSelection(
  spec: string | ReadonlyArray<number>,
  maxSteps: number
): number[] {
  const out = new Set<number>();
  const add1Based = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || n > maxSteps) {
      throw new Error(`Step ${n} is out of range. Valid steps are 1..${maxSteps}.`);
    }
    out.add(n - 1);
  };
  if (Array.isArray(spec)) {
    for (const n of spec) add1Based(n);
  } else {
    const trimmed = String(spec).trim();
    if (!trimmed) throw new Error(`Empty step list. Valid steps are 1..${maxSteps}.`);
    for (const part of trimmed.split(",")) {
      const token = part.trim();
      if (!token) continue;
      const range = /^(\d+)\s*-\s*(\d+)$/.exec(token);
      if (range) {
        const a = Number(range[1]!);
        const b = Number(range[2]!);
        if (a > b) throw new Error(`Invalid step range "${token}": start must be <= end.`);
        for (let k = a; k <= b; k++) add1Based(k);
      } else if (/^\d+$/.test(token)) {
        add1Based(Number(token));
      } else {
        throw new Error(`Invalid step selector "${token}". Use 1-based numbers or ranges like "1-4,9".`);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

const MODE_TO_FIELD: Partial<Record<StepEditMode, keyof Step>> = {
  onOff: "on",
  velocity: "velocity",
  value: "value",
  gate: "gate",
  tie: "tie",
  note: "note",
  octave: "octave",
  repeat: "repeat",
  chance: "chance",
  offset: "offset",
  stepRate: "stepRate",
  skip: "skip"
};

/** Rotate a row's steps (or only one edit mode's values) by `by` (+ right, - left) (SQ35, SQ53). */
export function rotateRowSteps(row: StepRow, by: number, mode?: StepEditMode): StepRow {
  const n = row.steps.length;
  if (n <= 1) return row;
  const shift = ((Math.trunc(by) % n) + n) % n;
  if (shift === 0) return row;

  if (!mode) {
    const steps = row.steps.map((_, i) => row.steps[(i - shift + n) % n]!);
    return { ...row, steps };
  }
  const field = MODE_TO_FIELD[mode];
  if (!field) return row;
  const steps = row.steps.map((cur, i) => {
    const donor = row.steps[(i - shift + n) % n]!;
    const next: Step = { ...cur };
    if (donor[field] === undefined) delete next[field];
    else (next as Record<string, unknown>)[field] = donor[field];
    return compactStep(next);
  });
  return { ...row, steps };
}

/** Clear one mode (or all fields) on the selected step indices of `row` (SQ35, SQ52). */
export function clearRowSteps(
  row: StepRow,
  indices?: ReadonlyArray<number>,
  mode?: StepEditMode
): StepRow {
  const target = indices ? new Set(indices) : null;
  const field = mode ? MODE_TO_FIELD[mode] : undefined;
  const steps = row.steps.map((s, i) => {
    if (target && !target.has(i)) return s;
    if (!mode) return {};
    if (!field) return s;
    const next: Step = { ...s };
    delete next[field];
    return compactStep(next);
  });
  return { ...row, steps };
}

/** Transpose pitched row or selected steps by `semitones` (SQ35, SQ53). */
export function transposeRowSteps(
  row: StepRow,
  semitones: number,
  indices?: ReadonlyArray<number>,
  instrument?: MidiInstrument
): StepRow {
  if (row.assignment.type === "automation" || semitones === 0) return row;
  const semi = Math.trunc(semitones);
  if (semi === 0) return row;
  if (!indices) {
    if (row.assignment.type === "note" || row.assignment.type === "melodic") {
      const oldPitch = row.assignment.pitch;
      const nextPitch = clampInt(oldPitch + semi, 0, 127);
      const actualSemi = nextPitch - oldPitch;
      const oldPc = ((oldPitch % 12) + 12) % 12;
      const octWrap = Math.floor((oldPc + actualSemi) / 12);
      const steps =
        octWrap === 0
          ? row.steps
          : row.steps.map((s) =>
              s.octave !== undefined
                ? compactStep({ ...s, octave: clampInt(s.octave + octWrap, -2, 8) })
                : s
            );
      return { ...row, assignment: { ...row.assignment, pitch: nextPitch }, steps };
    }
    if (row.assignment.type === "degree") {
      const octDelta = Math.trunc(semi / 12);
      const octave = clampInt(row.assignment.octave + octDelta, -2, 8);
      return { ...row, assignment: { ...row.assignment, octave } };
    }
    if (row.assignment.type === "kit") {
      const targetIdx: number[] = [];
      row.steps.forEach((s, i) => {
        if (s.on || s.note !== undefined || s.octave !== undefined) targetIdx.push(i);
      });
      return targetIdx.length > 0
        ? transposeRowSteps(row, semi, targetIdx, instrument)
        : row;
    }
    return row;
  }
  let nextRow = row;
  for (const idx of indices) {
    const cur = nextRow.steps[idx] ?? {};
    const total = (cur.note ?? 0) + semi;
    const baseOct =
      cur.octave ??
      (nextRow.assignment.type === "degree"
        ? nextRow.assignment.octave
        : nextRow.assignment.type === "kit"
          ? Math.floor(kitPadPitch(nextRow.assignment.pad, instrument) / 12) - 2
          : nextRow.assignment.type === "note" || nextRow.assignment.type === "melodic"
            ? Math.floor(nextRow.assignment.pitch / 12) - 2
            : 3);
    let noteVal = total;
    let octaveVal = cur.octave;
    if (noteVal > 12 || noteVal < -12) {
      const octShift = Math.trunc(noteVal / 12);
      noteVal -= octShift * 12;
      octaveVal = clampInt(baseOct + octShift, -2, 8);
    }
    const values: Partial<Step> = { note: clampInt(noteVal, -12, 12) };
    if (octaveVal !== undefined) values.octave = octaveVal;
    nextRow = setStepValue(nextRow, idx, values, { keepOff: !cur.on });
  }
  return nextRow;
}

/** Increment/decrement values for `mode` across `row` (SQ35, SQ53). */
export function nudgeRowValues(
  row: StepRow,
  mode: StepEditMode,
  delta: number,
  instrument?: MidiInstrument
): StepRow {
  const isDeviceValue =
    mode === "value" &&
    row.assignment.type === "automation" &&
    row.assignment.target.kind === "device";
  if (!Number.isFinite(delta) || delta === 0) return row;
  const d = Math.trunc(delta);
  if (!isDeviceValue && d === 0) return row;
  if (mode === "onOff") {
    const on = d > 0;
    return {
      ...row,
      steps: row.steps.map((s) => compactStep({ ...s, on }))
    };
  }
  if (mode === "tie") {
    if (d > 0) {
      return {
        ...row,
        steps: row.steps.map((s, i) =>
          i > 0 ? compactStep({ ...s, tie: true }) : compactStep({ ...s, tie: false })
        )
      };
    }
    return {
      ...row,
      steps: row.steps.map((s) => compactStep({ ...s, tie: false }))
    };
  }
  if (mode === "skip") {
    return {
      ...row,
      steps: row.steps.map((s) => compactStep({ ...s, skip: d > 0 }))
    };
  }
  if (mode === "loop") {
    const loopEnd = clampInt(row.loopEnd + d, row.loopStart + 1, row.lengthSteps);
    return { ...row, loopEnd };
  }
  const steps = row.steps.map((s) => {
    const n = normalizeStep(s);
    switch (mode) {
      case "velocity":
        return compactStep({ ...s, velocity: clampInt(n.velocity + d, 1, 127) });
      case "gate":
        return compactStep({ ...s, gate: clampInt(n.gate + d, 1, 100) });
      case "note":
        return compactStep({ ...s, note: clampInt(n.note + d, -12, 12) });
      case "octave": {
        const curOct =
          n.octave ??
          (row.assignment.type === "degree"
            ? row.assignment.octave
            : row.assignment.type === "kit"
              ? Math.floor(kitPadPitch(row.assignment.pad, instrument) / 12) - 2
              : row.assignment.type === "note" || row.assignment.type === "melodic"
                ? Math.floor(row.assignment.pitch / 12) - 2
                : 3);
        return compactStep({ ...s, octave: clampInt(curOct + d, -2, 8) });
      }
      case "repeat":
        return compactStep({ ...s, repeat: clampInt(n.repeat + d, 1, 16) });
      case "chance":
        return compactStep({ ...s, chance: clampInt(n.chance + d, 0, 100) });
      case "offset":
        return compactStep({ ...s, offset: clampInt(n.offset + d, -50, 50) });
      case "stepRate":
        return compactStep({ ...s, stepRate: nudgeStepRate(n.stepRate ?? row.stepRate, d) });
      case "value": {
        const cur = n.value ?? 0;
        if (isDeviceValue) {
          return compactStep({ ...s, value: cur + delta });
        }
        const max =
          row.assignment.type === "automation" && row.assignment.target.kind === "pitchBend"
            ? 8191
            : 127;
        const min =
          row.assignment.type === "automation" && row.assignment.target.kind === "pitchBend"
            ? -8192
            : 0;
        return compactStep({ ...s, value: clampInt(cur + d, min, max) });
      }
      default:
        return s;
    }
  });
  const assignment =
    (mode === "note" || mode === "octave") && row.assignment.type === "note"
      ? { type: "melodic" as const, pitch: row.assignment.pitch }
      : row.assignment;
  return { ...row, assignment, steps };
}

/** Tie or untie steps from 0-based `fromIdx` to `toIdx` inclusive (SQ33, SQ53). */
export function tieRowSteps(
  row: StepRow,
  fromIdx: number,
  toIdx: number,
  tie: boolean
): StepRow {
  const lo = Math.max(0, Math.min(fromIdx, toIdx));
  const hi = Math.min(row.steps.length - 1, Math.max(fromIdx, toIdx));
  const steps = [...row.steps];
  if (tie) {
    if (!steps[lo]?.on) {
      steps[lo] = compactStep({ ...steps[lo], on: true, tie: false });
    }
    for (let i = lo + 1; i <= hi; i++) {
      steps[i] = compactStep({ ...steps[i], tie: true });
    }
  } else {
    for (let i = lo; i <= hi; i++) {
      steps[i] = compactStep({ ...steps[i], tie: false });
    }
  }
  return { ...row, steps };
}

/** Seeded deterministic randomize of `mode` across selected rows/steps (SQ35, SQ53, D78, D98). */
export function randomizePatternSteps(
  pattern: StepPattern,
  mode: StepEditMode,
  options: {
    rowIds?: ReadonlySet<string>;
    stepIndices?: ReadonlyArray<number>;
    seed: number;
    density?: number;
  }
): StepPattern {
  const density = clampInt(options.density ?? 50, 0, 100);
  const targetSteps = options.stepIndices ? new Set(options.stepIndices) : null;
  const seed = options.seed >>> 0;
  // Track mono occupancy if mode === "onOff" and pattern.mono is enabled (SQ35).
  const monoOccupied = new Set<number>();
  if (mode === "onOff" && pattern.mono) {
    for (const r of pattern.rows) {
      if (options.rowIds && !options.rowIds.has(r.id) && isNoteRow(r)) {
        r.steps.forEach((s, i) => {
          if (s.on) monoOccupied.add(i);
        });
      }
    }
  }

  const rows = pattern.rows.map((row) => {
    if (options.rowIds && !options.rowIds.has(row.id)) return row;
    const rk = rowKeyHash(row.id);
    let nextRow = row;
    let devRange: [number, number] | undefined;
    if (
      mode === "value" &&
      row.assignment.type === "automation" &&
      row.assignment.target.kind === "device"
    ) {
      const vals = row.steps
        .map((st) => st.value)
        .filter((v): v is number => v !== undefined && Number.isFinite(v));
      if (vals.length >= 2) {
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        devRange = hi > lo ? [lo, hi] : lo > 1 ? [0, lo * 2] : [0, 1];
      } else if (vals.length === 1) {
        devRange = vals[0]! > 1 ? [0, vals[0]! * 2] : [0, 1];
      } else {
        devRange = [0, 1];
      }
    }
    const steps = row.steps.map((s, i) => {
      if (targetSteps && !targetSteps.has(i)) return s;
      const u = stepHash(seed, rk, i, 0);
      switch (mode) {
        case "onOff": {
          let on = u * 100 < density;
          if (on && pattern.mono && isNoteRow(row)) {
            if (monoOccupied.has(i)) on = false;
            else monoOccupied.add(i);
          }
          return compactStep({ ...s, on });
        }
        case "velocity":
          return compactStep({ ...s, velocity: clampInt(1 + u * 126, 1, 127) });
        case "gate":
          return compactStep({ ...s, gate: clampInt(10 + u * 90, 1, 100) });
        case "tie":
          return compactStep({ ...s, tie: i > 0 && u < 0.35 });
        case "note":
          return compactStep({ ...s, note: clampInt(-12 + u * 24, -12, 12) });
        case "octave":
          return compactStep({ ...s, octave: clampInt(1 + u * 4, -2, 8) });
        case "repeat":
          return compactStep({ ...s, repeat: clampInt(1 + u * 3, 1, 16) });
        case "chance":
          return compactStep({ ...s, chance: clampInt(u * 100, 0, 100) });
        case "offset":
          return compactStep({ ...s, offset: clampInt(-50 + u * 100, -50, 50) });
        case "stepRate": {
          const choices: StepRate[] = ["1/8", "1/16", "1/32", "16T"];
          return compactStep({ ...s, stepRate: choices[Math.floor(u * choices.length)]! });
        }
        case "skip":
          return compactStep({ ...s, skip: u < 0.25 });
        case "value": {
          if (devRange) {
            const [lo, hi] = devRange;
            return compactStep({ ...s, value: Number((lo + u * (hi - lo)).toFixed(4)) });
          }
          if (row.assignment.type === "automation" && row.assignment.target.kind === "pitchBend") {
            return compactStep({ ...s, value: clampInt(-8192 + u * 16383, -8192, 8191) });
          }
          return compactStep({ ...s, value: clampInt(u * 127, 0, 127) });
        }
        case "loop":
          return s;
      }
    });
    if ((mode === "note" || mode === "octave") && nextRow.assignment.type === "note") {
      nextRow = { ...nextRow, assignment: { type: "melodic", pitch: nextRow.assignment.pitch } };
    }
    return { ...nextRow, steps };
  });

  return { ...pattern, rows };
}
