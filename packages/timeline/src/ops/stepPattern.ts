/**
 * Step Sequencer timeline ops (SQ20–SQ22, SQ42, SQ45, SQ47–SQ54).
 *
 * All 27 ops share one pure implementation invoked by `applyTimelineOp` across
 * both the headless bridge and browser editor. Steps and loop bounds in tool
 * input/output are 1-based (D97); stored `StepRow.steps` and `loopStart` are
 * 0-based with exclusive `loopEnd`.
 */

import { isFullResourceId, isShortResourceId } from "@nodetool-ai/protocol";
import { activeLoopMs } from "../clipLoop.js";
import { makeClip, makeTrack } from "../defaults.js";
import { barDurationMs } from "../midi/grid.js";
import {
  DEFAULT_MIDI_INSTRUMENT,
  instrumentSignature
} from "../midi/instrument.js";
import {
  findInstrumentPreset,
  presetIdForInstrument
} from "../midi/presets.js";
import {
  STEP_DEGREES,
  STEP_PATTERN_MAX_ROWS,
  STEP_PATTERN_MAX_STEPS,
  addPatternRow,
  applyMonoAtSteps,
  applyPatternRowSort,
  assignmentFromRowName,
  clearRowSteps,
  compactStep,
  defaultSubrowsForAssignment,
  isNoteRow,
  midiToPattern,
  normalizePattern,
  normalizeRow,
  normalizeStep,
  nudgeRowValues,
  parsePatternTextLines,
  parseStepNoteName,
  parseStepSelection,
  patternFromText,
  patternToText,
  randomizePatternSteps,
  resizePatternLength,
  resizeRowLength,
  rotateRowSteps,
  rowLabel,
  setPatternAutomationMode,
  setPatternKey,
  setPatternLoop,
  setPatternMidiChannel,
  setPatternPlayback,
  setPatternStepRate,
  setStepValue,
  sortPatternRows,
  stripPatternSteps,
  tieRowSteps,
  transposeRowSteps
} from "../midi/stepPattern.js";
import {
  deriveTrackAutomationFromPatterns,
  expandPattern,
  fnv1a32Uints,
  kitPadPitch,
  rowKeyHash,
  stepRateTicks
} from "../midi/stepPatternExpand.js";
import {
  FACTORY_STEP_PATTERNS,
  FACTORY_STEP_TEMPLATES,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  extractStepPatternTemplate,
  findFactoryStepPattern,
  isWithinStepPatternFolder,
  listFactoryStepPatterns,
  normalizeStepPatternFolderPath,
  parentStepPatternFolder,
  remapStepPatternFolderPath,
  stepPatternRootFolder
} from "../midi/stepPatternLibrary.js";
import { DEFAULT_TEMPO, resolveTempo } from "../midi/tempo.js";
import { msToTicks } from "../midi/ticks.js";
import type {
  MidiInstrument,
  Step,
  StepDegree,
  StepEditMode,
  StepKey,
  StepPattern,
  StepRate,
  StepRow,
  StepRowAssignment,
  TimelineClip,
  TimelineTrack
} from "../types.js";
import { resolveBarTime } from "./barTime.js";
import type { TimelineOp } from "./op.js";
import {
  collectStepPatternFolders,
  resolveCreateStepPatternFolderTarget,
  resolveMoveDestinationFolder,
  resolveRenameStepPatternFolderTarget,
  resolveStepPatternFolderRef,
  resolveUserStepPatternRef,
  type ExplicitStepPatternFolderRecord
} from "./stepPatternFolders.js";
import type {
  FullStepPatternLibrary,
  TimelineOpContext,
  TimelineOpResult,
  TimelineOpState,
  TimelineOpStepPatternFolder,
  TimelineOpStepPatternLibrary,
  TimelineOpUserStepPattern
} from "./types.js";

export interface StepPatternScope {
  readonly state: TimelineOpState;
  readonly ctx: TimelineOpContext;
  readonly tracks: TimelineTrack[];
  clips: TimelineClip[];
  touch(...ids: string[]): void;
  resolveTrack(idOrName: string): TimelineTrack;
  resolveMidiTrack(target: string): TimelineTrack;
  resolveClip(target: string): TimelineClip;
  resolveMidiClip(target: string): TimelineClip;
  assertWritable(clips: readonly TimelineClip[], destinationTrackId?: string): void;
  trackEndMs(trackId: string): number;
  clipOut(clip: TimelineClip): Record<string, unknown>;
  trackOut(track: TimelineTrack): Record<string, unknown>;
}

export type StepPatternOpName =
  | "get_pattern"
  | "create_pattern_region"
  | "convert_pattern_to_midi"
  | "convert_midi_to_pattern"
  | "separate_pattern_rows"
  | "set_pattern"
  | "set_pattern_seed"
  | "add_pattern_rows"
  | "set_pattern_row"
  | "remove_pattern_rows"
  | "move_pattern_row"
  | "sort_pattern_rows"
  | "set_pattern_row_sort"
  | "copy_pattern_row"
  | "set_steps"
  | "set_pattern_text"
  | "clear_pattern"
  | "copy_steps"
  | "repeat_step"
  | "rotate_pattern"
  | "transpose_pattern"
  | "randomize_pattern"
  | "nudge_pattern_values"
  | "tie_steps"
  | "list_step_patterns"
  | "apply_step_pattern"
  | "save_step_pattern"
  | "set_track_step_template"
  | "create_step_pattern_folder"
  | "rename_step_pattern_folder"
  | "delete_step_pattern_folder"
  | "move_step_pattern";

type StepPatternOp<N extends StepPatternOpName> = Extract<TimelineOp, { op: N }>;

const clampInt = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

/** Deterministic non-zero uint32 seed derived from a clip id. */
function seedForClipId(clipId: string): number {
  const h = rowKeyHash(clipId);
  return h === 0 ? 1 : h;
}

/** Deterministic next uint32 seed distinct from `currentSeed`. */
function nextPatternSeed(clipId: string, currentSeed: number): number {
  const cur = currentSeed >>> 0;
  let next = fnv1a32Uints(rowKeyHash(clipId), cur, 0x9e3779b9, 1) >>> 0;
  if (next === 0 || next === cur) {
    next = ((cur + 1) >>> 0) || 1;
  }
  return next;
}

/** Mint a unique deterministic row id within `pattern`. */
function mintRowId(pattern: Pick<StepPattern, "rows">): string {
  const used = new Set(pattern.rows.map((r) => r.id));
  let k = 1;
  while (used.has(`r${k}`)) k += 1;
  return `r${k}`;
}

function trackInstrumentOf(
  scope: StepPatternScope,
  clip: TimelineClip
): MidiInstrument | undefined {
  return scope.tracks.find((t) => t.id === clip.trackId)?.instrument;
}

function chordsOf(scope: StepPatternScope) {
  return scope.tracks.find((t) => t.type === "chord")?.chords;
}

function resolvePatternClip(
  scope: StepPatternScope,
  clipId: string
): { clip: TimelineClip; pattern: StepPattern; instrument?: MidiInstrument } {
  const clip = scope.resolveMidiClip(clipId);
  if (!clip.pattern) {
    throw new Error(
      `Clip "${clip.name}" is a regular MIDI clip, not a step sequencer pattern region. Convert it with convert_midi_to_pattern or create one with create_pattern_region.`
    );
  }
  return {
    clip,
    pattern: clip.pattern,
    instrument: trackInstrumentOf(scope, clip)
  };
}

function formatValidRows(
  pattern: StepPattern,
  instrument?: MidiInstrument
): string {
  if (pattern.rows.length === 0) {
    return "This pattern has no rows yet.";
  }
  const names = pattern.rows
    .slice(0, 16)
    .map((r) => `${r.id} ("${rowLabel(r, instrument)}")`)
    .join(", ");
  const more = pattern.rows.length > 16 ? `, and ${pattern.rows.length - 16} more` : "";
  return `Valid rows: ${names}${more}.`;
}

/** Resolve a row by exact id, unique 12-char id prefix, or unique case-insensitive name/label. */
function resolveRow(
  pattern: StepPattern,
  target: string,
  instrument?: MidiInstrument
): { row: StepRow; index: number } {
  const byIdIdx = pattern.rows.findIndex((r) => r.id === target);
  if (byIdIdx >= 0) {
    return { row: pattern.rows[byIdIdx]!, index: byIdIdx };
  }
  if (isShortResourceId(target)) {
    const prefixMatches: Array<{ row: StepRow; index: number }> = [];
    pattern.rows.forEach((row, index) => {
      if (row.id.startsWith(target)) prefixMatches.push({ row, index });
    });
    if (prefixMatches.length > 1) {
      throw new Error(
        `Row prefix "${target}" matches ${prefixMatches.length} rows (${prefixMatches
          .map((m) => m.row.id)
          .join(", ")}); use a full row id.`
      );
    }
    if (prefixMatches.length === 1) {
      return prefixMatches[0]!;
    }
  }
  const lower = target.trim().toLowerCase();
  const matches: Array<{ row: StepRow; index: number }> = [];
  pattern.rows.forEach((row, index) => {
    const label = rowLabel(row, instrument).toLowerCase();
    const explicit = row.name?.trim().toLowerCase();
    if (label === lower || explicit === lower) {
      matches.push({ row, index });
    }
  });
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new Error(
      `Row name "${target}" matches ${matches.length} rows (${matches
        .map((m) => m.row.id)
        .join(", ")}); address one by rowId.`
    );
  }
  throw new Error(
    `No row found matching "${target}". ${formatValidRows(pattern, instrument)}`
  );
}

export function patternSummary(pattern: StepPattern): string {
  return `${pattern.rows.length} rows x ${pattern.lengthSteps} @${pattern.stepRate}`;
}

/** One step's value as an edit mode shows it. */
type StepModeValue = boolean | number | StepRate | undefined;

function modeValueAtStep(
  row: StepRow,
  stepIndex: number,
  mode: StepEditMode,
  instrument?: MidiInstrument
): StepModeValue {
  const raw = row.steps[stepIndex] ?? {};
  const n = normalizeStep(raw);
  switch (mode) {
    case "onOff":
      return n.on;
    case "velocity":
      return raw.velocity !== undefined ? n.velocity : n.on ? 100 : 0;
    case "value":
      return raw.value !== undefined ? n.value : n.on ? 64 : 0;
    case "gate":
      return n.gate;
    case "tie":
      return n.tie;
    case "note":
      return n.note;
    case "octave":
      return (
        n.octave ??
        (row.assignment.type === "degree"
          ? row.assignment.octave
          : row.assignment.type === "kit"
            ? Math.floor(kitPadPitch(row.assignment.pad, instrument) / 12) - 2
            : row.assignment.type === "note" || row.assignment.type === "melodic"
              ? Math.floor(row.assignment.pitch / 12) - 2
              : 3)
      );
    case "repeat":
      return n.repeat;
    case "chance":
      return n.chance;
    case "offset":
      return n.offset;
    case "stepRate":
      return n.stepRate ?? row.stepRate;
    case "skip":
      return n.skip;
    case "loop":
      return stepIndex >= row.loopStart && stepIndex < row.loopEnd;
  }
}

function serializePatternRow(
  row: StepRow,
  instrument: MidiInstrument | undefined,
  modes?: readonly StepEditMode[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: row.id,
    name: rowLabel(row, instrument),
    assignment: structuredClone(row.assignment),
    stepRate: row.stepRate,
    lengthSteps: row.lengthSteps,
    playback: row.playback,
    mute: row.mute,
    solo: row.solo,
    // 1-based inclusive loop range for agent output (D97).
    loopStart: row.loopStart + 1,
    loopEnd: row.loopEnd,
    midiChannel: row.midiChannel,
    automationMode: row.automationMode,
    subrows: [...row.subrows]
  };
  if (row.color !== undefined) out.color = row.color;
  if (row.subrowsExpanded !== undefined) out.subrowsExpanded = row.subrowsExpanded;
  if (modes && modes.length > 0) {
    const values: Record<string, unknown[]> = {};
    for (const mode of modes) {
      values[mode] = Array.from({ length: row.lengthSteps }, (_, i) =>
        modeValueAtStep(row, i, mode, instrument)
      );
    }
    out.values = values;
  }
  return out;
}

function serializePatternSettings(pattern: StepPattern): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: pattern.name,
    lengthSteps: pattern.lengthSteps,
    stepRate: pattern.stepRate,
    playback: pattern.playback,
    swing: pattern.swing,
    swingDivision: pattern.swingDivision,
    legato: pattern.legato,
    mono: pattern.mono,
    midiChannel: pattern.midiChannel,
    pitchSource: pattern.pitchSource,
    key: pattern.key ? { ...pattern.key } : undefined,
    scale: pattern.scale,
    noTranspose: pattern.noTranspose,
    scaleQuantize: pattern.scaleQuantize,
    automationMode: pattern.automationMode,
    seed: pattern.seed
  };
  if (pattern.rowSort !== undefined) out.rowSort = pattern.rowSort;
  return out;
}

/** Build default kit rows for a DR-1 or Sampler kit track (SQ42). */
function defaultRowsForTrack(
  track: TimelineTrack
): StepRow[] {
  const defaults = {
    lengthSteps: 16,
    stepRate: "1/16" as const,
    playback: "forward" as const,
    midiChannel: 1,
    automationMode: "latch" as const
  };
  const inst = track.instrument;
  if (inst?.type === "drum" && inst.pads.length > 0) {
    return inst.pads.map((pad, idx) =>
      normalizeRow(
        {
          id: `r${idx + 1}`,
          name: pad.name,
          assignment: { type: "kit", pad: idx }
        },
        defaults
      )
    );
  }
  if (inst?.type === "sampler" && inst.zones.length > 0) {
    return inst.zones.slice(0, 16).map((zone, idx) =>
      normalizeRow(
        {
          id: `r${idx + 1}`,
          name: zone.name,
          assignment: { type: "kit", pad: idx }
        },
        defaults
      )
    );
  }
  if (track.musicRole === "drums") {
    const drumRows: Array<{ name: string; pitch: number }> = [
      { name: "Kick", pitch: 36 },
      { name: "Snare", pitch: 38 },
      { name: "Closed Hat", pitch: 42 },
      { name: "Clap", pitch: 39 }
    ];
    return drumRows.map((d, idx) =>
      normalizeRow(
        {
          id: `r${idx + 1}`,
          name: d.name,
          assignment: { type: "note", pitch: d.pitch }
        },
        defaults
      )
    );
  }
  return [
    normalizeRow(
      {
        id: "r1",
        name: "C3",
        assignment: { type: "melodic", pitch: 60 }
      },
      defaults
    )
  ];
}

function projectKeyToStepKey(
  tempo: ReturnType<typeof resolveTempo>
): StepKey | undefined {
  if (!tempo.key) return undefined;
  const tonicNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flatMap: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
  };
  const idx = flatMap[tempo.key.tonic] ?? tonicNames.indexOf(tempo.key.tonic);
  if (idx < 0) return undefined;
  return {
    tonic: idx,
    mode: tempo.key.mode === "minor" ? "minor" : "major"
  };
}

const DEFAULT_MIDI_INSTRUMENT_SIG = instrumentSignature(DEFAULT_MIDI_INSTRUMENT);

function isDefaultOrUnsetTrackInstrument(
  instrument: MidiInstrument | undefined,
  hostDefault: MidiInstrument | undefined
): boolean {
  if (!instrument) return true;
  const sig = instrumentSignature(instrument);
  if (sig === DEFAULT_MIDI_INSTRUMENT_SIG) return true;
  if (hostDefault && sig === instrumentSignature(hostDefault)) return true;
  return false;
}

function resolveSavedPatternInstrument(entry: {
  instrument?: MidiInstrument;
  instrumentPreset?: string;
}): { instrument: MidiInstrument; presetId?: string } | null {
  if (entry.instrument) {
    const instrument = structuredClone(entry.instrument);
    const presetId = presetIdForInstrument(instrument);
    return presetId ? { instrument, presetId } : { instrument };
  }
  if (entry.instrumentPreset) {
    const preset = findInstrumentPreset(entry.instrumentPreset);
    if (preset) {
      return {
        instrument: structuredClone(preset.instrument),
        presetId: preset.id
      };
    }
  }
  return null;
}

interface ResolvedLibraryPattern {
  id: string;
  name: string;
  kind: "pattern" | "template";
  source: "factory" | "user";
  pattern: StepPattern;
  instrument?: MidiInstrument;
  instrumentPreset?: string;
}

function resolvedLibraryPattern(
  entry: Omit<ResolvedLibraryPattern, "source">,
  source: ResolvedLibraryPattern["source"]
): ResolvedLibraryPattern {
  const resolved: ResolvedLibraryPattern = {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    source,
    pattern: normalizePattern(structuredClone(entry.pattern))
  };
  if (entry.instrument) resolved.instrument = structuredClone(entry.instrument);
  if (entry.instrumentPreset) resolved.instrumentPreset = entry.instrumentPreset;
  return resolved;
}

async function resolveLibraryPattern(
  scope: StepPatternScope,
  ref: string
): Promise<ResolvedLibraryPattern> {
  const trimmed = ref.trim();
  const needle = trimmed.toLowerCase();
  if (scope.ctx.stepPatternLibrary) {
    const userEntries = await scope.ctx.stepPatternLibrary.list();
    let userMatch = userEntries.find(
      (e) => e.id.toLowerCase() === needle || e.name.toLowerCase() === needle
    );
    if (!userMatch && isShortResourceId(trimmed)) {
      const prefixMatches = userEntries.filter((e) => e.id.startsWith(trimmed));
      if (prefixMatches.length > 1) {
        throw new Error(
          `Step pattern prefix "${trimmed}" matches ${prefixMatches.length} user patterns; use a full id.`
        );
      }
      userMatch = prefixMatches[0];
    }
    if (userMatch) return resolvedLibraryPattern(userMatch, "user");
  }
  const factory = findFactoryStepPattern(ref);
  if (factory) return resolvedLibraryPattern(factory, "factory");
  const sampleNames = [...FACTORY_STEP_PATTERNS, ...FACTORY_STEP_TEMPLATES]
    .slice(0, 10)
    .map((e) => `"${e.name}"`)
    .join(", ");
  throw new Error(
    `No step pattern or template found matching "${ref}". Examples: ${sampleNames} — call list_step_patterns for the full list.`
  );
}

/** Resolve a 12-char effect id prefix against `track.effects` (Resource ID Principles). */
function resolveDeviceId(
  deviceId: string | undefined,
  track: TimelineTrack | undefined
): string {
  if (!deviceId || deviceId === "instrument") return "instrument";
  const effects = track?.effects ?? [];
  const exact = effects.find((e) => e.id === deviceId);
  if (exact) return exact.id;
  if (isShortResourceId(deviceId)) {
    const matches = effects.filter((e) => e.id.startsWith(deviceId)); // key-boundary-ok: deviceId is an exact 12-char short id and more than one match is refused below.
    if (matches.length > 1) {
      throw new Error(
        `Device prefix "${deviceId}" matches ${matches.length} effects on track "${track?.name ?? ""}"; use a full effect id.`
      );
    }
    if (matches.length === 1) return matches[0]!.id;
  }
  return deviceId;
}

/** Enforce SQ4 / SQ19 row assignment restrictions. */
function assertAssignmentAllowed(
  assignment: StepRowAssignment,
  pattern: Pick<StepPattern, "pitchSource">,
  instrument: MidiInstrument | undefined
): void {
  if (assignment.type === "degree" && pattern.pitchSource !== "chords") {
    throw new Error(
      'Degree rows require pattern pitchSource "chords" (call set_pattern with pitchSource: "chords" first).'
    );
  }
  if (
    assignment.type === "kit" &&
    instrument?.type !== "drum" &&
    instrument?.type !== "sampler"
  ) {
    throw new Error(
      `Kit rows require a DR-1 drum or Sampler track (this track uses ${instrument?.type ?? "no"} instrument).`
    );
  }
}

function resolveRowAssignmentInput(
  input: StepPatternOp<"add_pattern_rows">["rows"][number],
  instrument?: MidiInstrument,
  track?: TimelineTrack
): { assignment: StepRowAssignment; defaultName?: string } {
  if (input.assignment) {
    const cloned = structuredClone(input.assignment) as StepRowAssignment;
    if (cloned.type === "automation" && cloned.target.kind === "device") {
      cloned.target.deviceId = resolveDeviceId(cloned.target.deviceId, track);
    }
    return { assignment: cloned };
  }
  if (input.pad !== undefined) {
    if (typeof input.pad === "number") {
      return { assignment: { type: "kit", pad: clampInt(input.pad, 0, 15) } };
    }
    const lower = input.pad.trim().toLowerCase();
    if (instrument?.type === "drum") {
      const idx = instrument.pads.findIndex((p) => p.name.toLowerCase() === lower);
      if (idx >= 0) {
        return {
          assignment: { type: "kit", pad: idx },
          defaultName: instrument.pads[idx]!.name
        };
      }
      throw new Error(
        `No drum pad named "${input.pad}". Valid pads: ${instrument.pads
          .map((p, i) => `${i} ("${p.name}")`)
          .join(", ")}.`
      );
    }
    if (instrument?.type === "sampler") {
      const idx = instrument.zones.findIndex((z) => z.name.toLowerCase() === lower);
      if (idx >= 0 && idx < 16) {
        return {
          assignment: { type: "kit", pad: idx },
          defaultName: instrument.zones[idx]!.name
        };
      }
    }
    const inferred = assignmentFromRowName(input.pad, instrument);
    return { assignment: inferred.assignment, defaultName: inferred.customName ?? input.pad };
  }
  if (input.pitch !== undefined) {
    const pitch =
      typeof input.pitch === "number"
        ? clampInt(input.pitch, 0, 127)
        : parseStepNoteName(input.pitch);
    if (pitch === undefined) {
      throw new Error(
        `Invalid pitch "${String(input.pitch)}". Pass an integer 0..127 or a note name like "C3".`
      );
    }
    return { assignment: { type: "note", pitch } };
  }
  if (input.degree !== undefined) {
    const degree: StepDegree =
      typeof input.degree === "number"
        ? STEP_DEGREES[clampInt(input.degree, 0, STEP_DEGREES.length - 1)]!
        : input.degree;
    const octave = input.octave !== undefined ? clampInt(input.octave, -2, 8) : 3;
    return { assignment: { type: "degree", degree, octave } };
  }
  if (input.cc !== undefined) {
    return {
      assignment: {
        type: "automation",
        target: { kind: "cc", cc: clampInt(input.cc, 0, 127) }
      }
    };
  }
  if (input.param !== undefined) {
    const lower = input.param.trim().toLowerCase();
    if (lower === "pitchbend" || lower === "pitch bend") {
      return { assignment: { type: "automation", target: { kind: "pitchBend" } } };
    }
    if (lower === "channelpressure" || lower === "channel pressure") {
      return {
        assignment: { type: "automation", target: { kind: "channelPressure" } }
      };
    }
    return {
      assignment: {
        type: "automation",
        target: {
          kind: "device",
          deviceId: resolveDeviceId(input.deviceId, track),
          param: input.param
        }
      }
    };
  }
  if (input.name) {
    const inferred = assignmentFromRowName(input.name, instrument);
    return { assignment: inferred.assignment, defaultName: input.name };
  }
  throw new Error(
    "Each row in add_pattern_rows needs one of: assignment, pitch, pad, degree, cc, param, or name."
  );
}

function advanceAssignment(
  assignment: StepRowAssignment,
  instrument?: MidiInstrument
): StepRowAssignment {
  switch (assignment.type) {
    case "note":
      return { type: "note", pitch: Math.min(127, assignment.pitch + 1) };
    case "melodic":
      return { type: "melodic", pitch: Math.min(127, assignment.pitch + 1) };
    case "kit": {
      const maxPad =
        instrument?.type === "drum"
          ? Math.max(0, instrument.pads.length - 1)
          : instrument?.type === "sampler"
            ? Math.max(0, Math.min(15, instrument.zones.length - 1))
            : 15;
      return { type: "kit", pad: Math.min(maxPad, assignment.pad + 1) };
    }
    case "degree": {
      const idx = STEP_DEGREES.indexOf(assignment.degree);
      const nextIdx = (idx + 1) % STEP_DEGREES.length;
      const nextOct =
        nextIdx === 0 ? Math.min(8, assignment.octave + 1) : assignment.octave;
      return { type: "degree", degree: STEP_DEGREES[nextIdx]!, octave: nextOct };
    }
    case "automation":
      if (assignment.target.kind === "cc") {
        return {
          type: "automation",
          target: { kind: "cc", cc: Math.min(127, assignment.target.cc + 1) }
        };
      }
      return structuredClone(assignment);
  }
}

function assertUniqueSubrows(subrows: readonly StepEditMode[] | undefined): void {
  if (!subrows) return;
  const seen = new Set<StepEditMode>();
  for (const mode of subrows) {
    if (seen.has(mode)) {
      throw new Error(
        `Duplicate subrow mode "${mode}". Two subrows on the same row cannot share an edit mode.`
      );
    }
    seen.add(mode);
  }
}

function validateLoopBounds1Based(
  loopStart1: number | undefined,
  loopEnd1: number | undefined,
  lengthSteps: number,
  currentStart0: number,
  currentEndExcl: number
): { loopStart: number; loopEnd: number } {
  const nextStart0 = loopStart1 !== undefined ? loopStart1 - 1 : currentStart0;
  const nextEndExcl = loopEnd1 !== undefined ? loopEnd1 : currentEndExcl;
  if (nextStart0 < 0 || nextStart0 >= lengthSteps) {
    throw new Error(`loopStart must be between 1 and ${lengthSteps}.`);
  }
  if (nextEndExcl < 1 || nextEndExcl > lengthSteps) {
    throw new Error(`loopEnd must be between 1 and ${lengthSteps}.`);
  }
  if (nextStart0 >= nextEndExcl) {
    throw new Error(
      `loopStart (${nextStart0 + 1}) must be <= loopEnd (${nextEndExcl}).`
    );
  }
  return { loopStart: nextStart0, loopEnd: nextEndExcl };
}

function applyPatternTextToPattern(
  base: StepPattern,
  text: string,
  mode: "merge" | "replace",
  instrument?: MidiInstrument
): StepPattern {
  const lines = parsePatternTextLines(text);
  if (lines.length === 0) {
    throw new Error(
      'Pattern text contained no rows. Format each line as "<Row> [| rate] : <steps>", e.g. "Kick: x... x... x... x...".'
    );
  }
  if (mode === "replace") {
    const parsed = patternFromText(text, {
      name: base.name,
      seed: base.seed,
      stepRate: base.stepRate,
      instrument
    });
    return normalizePattern({
      ...base,
      lengthSteps: parsed.lengthSteps,
      rows: parsed.rows
    });
  }

  let pattern = structuredClone(base);
  const maxLineLen = Math.max(...lines.map((l) => l.steps.length));
  if (maxLineLen > pattern.lengthSteps) {
    pattern = resizePatternLength(pattern, Math.min(STEP_PATTERN_MAX_STEPS, maxLineLen));
  }
  for (const line of lines) {
    const lower = line.name.trim().toLowerCase();
    const existingIdx = pattern.rows.findIndex(
      (r) =>
        rowLabel(r, instrument).toLowerCase() === lower ||
        r.name?.trim().toLowerCase() === lower
    );
    if (existingIdx >= 0) {
      const existing = pattern.rows[existingIdx]!;
      const nextLen = line.steps.length;
      const updatedRow: StepRow = normalizeRow(
        {
          ...existing,
          lengthSteps: nextLen,
          loopStart: Math.min(existing.loopStart, nextLen - 1),
          loopEnd: existing.loopEnd === existing.lengthSteps ? nextLen : Math.min(existing.loopEnd, nextLen),
          stepRate: line.stepRate ?? existing.stepRate,
          steps: line.steps
        },
        pattern
      );
      pattern.rows[existingIdx] = updatedRow;
      if (pattern.mono && isNoteRow(updatedRow)) {
        const turnedOn = updatedRow.steps
          .map((s, i) => (s.on ? i : -1))
          .filter((i) => i >= 0);
        pattern = applyMonoAtSteps(pattern, updatedRow.id, turnedOn);
      }
    } else {
      if (pattern.rows.length >= STEP_PATTERN_MAX_ROWS) {
        throw new Error(
          `Cannot add row "${line.name}": a pattern holds at most ${STEP_PATTERN_MAX_ROWS} rows.`
        );
      }
      const inferred = assignmentFromRowName(line.name, instrument);
      const id = mintRowId(pattern);
      pattern = addPatternRow(
        pattern,
        {
          id,
          name: inferred.customName ?? line.name,
          assignment: inferred.assignment,
          lengthSteps: line.steps.length,
          loopStart: 0,
          loopEnd: line.steps.length,
          stepRate: line.stepRate ?? pattern.stepRate,
          steps: line.steps
        },
        instrument
      );
      const added = pattern.rows.find((r) => r.id === id);
      if (pattern.mono && added && isNoteRow(added)) {
        const turnedOn = added.steps
          .map((s, i) => (s.on ? i : -1))
          .filter((i) => i >= 0);
        pattern = applyMonoAtSteps(pattern, added.id, turnedOn);
      }
    }
  }
  return pattern;
}

/** All 27 Step Sequencer op handlers, keyed by op name. */
export const STEP_PATTERN_OP_HANDLERS: {
  [N in StepPatternOpName]: (
    scope: StepPatternScope,
    op: StepPatternOp<N>
  ) => TimelineOpResult | Promise<TimelineOpResult>;
} = {
  // ── SQ48: Read ────────────────────────────────────────────────────────────
  get_pattern: (scope, op) => {
    const { clip, pattern, instrument } = resolvePatternClip(scope, op.clipId);
    return {
      ok: true,
      clipId: clip.id,
      name: clip.name,
      summary: patternSummary(pattern),
      settings: serializePatternSettings(pattern),
      text: patternToText(pattern, instrument),
      rows: pattern.rows.map((row) =>
        serializePatternRow(row, instrument, op.modes)
      )
    };
  },

  // ── SQ49: Create & convert ────────────────────────────────────────────────
  create_pattern_region: async (scope, op) => {
    const track = scope.resolveMidiTrack(op.trackId);
    scope.assertWritable([], track.id);
    scope.state.tempo ??= structuredClone(DEFAULT_TEMPO);
    const tempo = resolveTempo(scope.state);
    const startMs =
      resolveBarTime(scope.state, op, op.atMs, "atMs") ??
      scope.trackEndMs(track.id);
    const bars = op.bars ?? 1;
    const durationMs = Math.max(1, Math.round(bars * barDurationMs(tempo)));
    const clipId = scope.ctx.newId("clip");
    const seed = seedForClipId(clipId);

    let pattern: StepPattern;
    if (op.template !== undefined) {
      if (op.template.trim().toLowerCase() === "track default") {
        pattern = track.stepTemplate
          ? normalizePattern({ ...structuredClone(track.stepTemplate), seed })
          : normalizePattern({
              name: op.name ?? "Pattern",
              seed,
              rows: defaultRowsForTrack(track)
            });
      } else {
        const entry = await resolveLibraryPattern(scope, op.template);
        pattern = normalizePattern({
          ...entry.pattern,
          seed
        });
      }
      if (op.text !== undefined) {
        pattern = applyPatternTextToPattern(
          pattern,
          op.text,
          "merge",
          track.instrument
        );
      }
    } else if (op.text !== undefined) {
      pattern = patternFromText(op.text, {
        name: op.name ?? "Pattern",
        seed,
        instrument: track.instrument
      });
    } else if (track.stepTemplate) {
      pattern = normalizePattern({
        ...structuredClone(track.stepTemplate),
        name: op.name || track.stepTemplate.name,
        seed
      });
    } else {
      pattern = normalizePattern({
        name: op.name ?? "Pattern",
        seed,
        rows: defaultRowsForTrack(track)
      });
    }
    if (op.name) {
      pattern.name = op.name;
    }

    const clip = makeClip({
      id: clipId,
      trackId: track.id,
      name: op.name ?? pattern.name,
      startMs,
      durationMs,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern
    });
    scope.clips.push(clip);
    scope.state.selectedClipIds = [clip.id];
    scope.touch(clip.id);
    return {
      ok: true,
      clip: scope.clipOut(clip),
      pattern: patternSummary(pattern),
      text: patternToText(pattern, track.instrument)
    };
  },

  convert_pattern_to_midi: (scope, op) => {
    const tempo = resolveTempo(scope.state);
    const chords = chordsOf(scope);
    const targets = op.clipIds.map((id) => resolvePatternClip(scope, id));
    scope.assertWritable(targets.map((t) => t.clip));

    const converted: Record<string, unknown>[] = [];
    for (const { clip, pattern, instrument } of targets) {
      const loopMs = activeLoopMs(clip);
      const inPointTicks = Math.max(
        0,
        Math.round(msToTicks(clip.inPointMs ?? 0, tempo.bpm))
      );
      const phaseTicks = (clip.patternPhaseTicks ?? 0) + inPointTicks;
      const repeatVaries =
        loopMs !== undefined &&
        (phaseTicks > 0 ||
          pattern.pitchSource === "chords" ||
          pattern.rows.some(
            (r) =>
              r.playback === "shuffle" ||
              r.playback === "random" ||
              r.playback === "wander" ||
              r.steps.some(
                (s) =>
                  (s.chance !== undefined && s.chance < 100) ||
                  (s.condition !== undefined && s.condition.type !== "always")
              )
          ));
      const expandDurMs = repeatVaries ? clip.durationMs : (loopMs ?? clip.durationMs);
      const clipLengthTicks = Math.max(
        1,
        Math.round(msToTicks(expandDurMs, tempo.bpm))
      );
      const loopLengthTicks =
        repeatVaries && loopMs !== undefined
          ? Math.max(1, Math.round(msToTicks(loopMs, tempo.bpm)))
          : undefined;
      const expanded = expandPattern(pattern, {
        clipLengthTicks,
        loopLengthTicks,
        patternPhaseTicks: phaseTicks,
        rowCycles: clip.patternRowCycles,
        instrument,
        chords,
        key: projectKeyToStepKey(tempo),
        clipStartDocTick: Math.round(msToTicks(clip.startMs - tempo.offsetMs, tempo.bpm))
      });
      if (expanded.deviceAutomation.length > 0) {
        const track = scope.tracks.find((t) => t.id === clip.trackId);
        if (track) {
          track.automation = deriveTrackAutomationFromPatterns(track, [clip], {
            tracks: scope.tracks,
            tempo
          });
        }
      }
      delete clip.pattern;
      delete clip.patternPhaseTicks;
      delete clip.patternRowCycles;
      if (repeatVaries) {
        delete clip.loopLengthMs;
      }
      clip.inPointMs = 0;
      if (clip.outPointMs !== undefined) {
        clip.outPointMs = repeatVaries ? clip.durationMs : (loopMs ?? clip.durationMs);
      }
      clip.notes = expanded.notes;
      if (expanded.controllers.length > 0) {
        clip.controllers = expanded.controllers;
      } else {
        delete clip.controllers;
      }
      scope.touch(clip.id);
      converted.push(scope.clipOut(clip));
    }
    return {
      ok: true,
      clips: converted
    };
  },

  convert_midi_to_pattern: (scope, op) => {
    const tempo = resolveTempo(scope.state);
    const clips = op.clipIds.map((id) => scope.resolveMidiClip(id));
    scope.assertWritable(clips);
    for (const clip of clips) {
      if (clip.pattern) {
        throw new Error(
          `Clip "${clip.name}" is already a step sequencer pattern region.`
        );
      }
    }

    let droppedNotes = 0;
    let collisions = 0;
    const conversions: Array<Record<string, unknown>> = [];
    for (const clip of clips) {
      const instrument = trackInstrumentOf(scope, clip);
      const windowStartTick = Math.max(
        0,
        Math.round(msToTicks(clip.inPointMs ?? 0, tempo.bpm))
      );
      const clipLengthTicks = Math.max(
        1,
        Math.round(msToTicks(activeLoopMs(clip) ?? clip.durationMs, tempo.bpm))
      );
      const res = midiToPattern(clip.notes ?? [], clip.controllers ?? [], {
        clipLengthTicks,
        windowStartTick,
        stepRate: op.stepRate,
        instrument,
        seed: seedForClipId(clip.id),
        name: clip.name
      });
      delete clip.notes;
      delete clip.controllers;
      delete clip.patternPhaseTicks;
      clip.inPointMs = 0;
      clip.pattern = res.pattern;
      scope.touch(clip.id);
      droppedNotes += res.droppedNotes;
      collisions += res.mergedCollisions;
      conversions.push({
        clipId: clip.id,
        droppedNotes: res.droppedNotes,
        collisions: res.mergedCollisions,
        stepRate: res.pattern.stepRate,
        lengthSteps: res.pattern.lengthSteps,
        rowCount: res.pattern.rows.length
      });
    }
    return {
      ok: true,
      droppedNotes,
      collisions,
      conversions,
      clips: clips.map((c) => scope.clipOut(c))
    };
  },

  separate_pattern_rows: (scope, op) => {
    const { clip, pattern, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    if (pattern.rows.length === 0) {
      throw new Error(`Pattern "${clip.name}" has no rows to separate.`);
    }
    const srcTrackIdx = scope.tracks.findIndex((t) => t.id === clip.trackId);
    const srcTrack = scope.tracks[srcTrackIdx];
    if (!srcTrack) {
      throw new Error(`Source track "${clip.trackId}" not found.`);
    }
    const anySolo = pattern.rows.some((r) => r.solo);

    const newTracks: TimelineTrack[] = [];
    const newClips: TimelineClip[] = [];
    for (const row of pattern.rows) {
      const name = rowLabel(row, instrument);
      const trackId = scope.ctx.newId("track");
      const newTrack = makeTrack({
        id: trackId,
        type: "midi",
        name,
        index: 0,
        instrument: srcTrack.instrument
          ? structuredClone(srcTrack.instrument)
          : undefined,
        volumeDb: srcTrack.volumeDb,
        pan: srcTrack.pan,
        effects: srcTrack.effects ? structuredClone(srcTrack.effects) : undefined,
        folderId: srcTrack.folderId,
        musicRole: srcTrack.musicRole
      });
      const clonedRow: StepRow = structuredClone(row);
      // Preserve mix when solo was active on the source pattern (SQ22).
      if (anySolo) {
        clonedRow.mute = !row.solo;
        clonedRow.solo = false;
      }
      const oneRowPattern: StepPattern = {
        ...structuredClone(pattern),
        name,
        rows: [clonedRow]
      };
      const newClip = makeClip({
        id: scope.ctx.newId("clip"),
        trackId,
        name,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        mediaType: "midi",
        sourceType: clip.sourceType,
        status: clip.status,
        loopLengthMs: clip.loopLengthMs,
        transpose: clip.transpose,
        velocityOffset: clip.velocityOffset,
        quantize: clip.quantize ? structuredClone(clip.quantize) : undefined,
        harmony: clip.harmony ? structuredClone(clip.harmony) : undefined,
        pattern: oneRowPattern,
        patternPhaseTicks: clip.patternPhaseTicks,
        patternRowCycles: clip.patternRowCycles?.[row.id]
          ? { [row.id]: structuredClone(clip.patternRowCycles[row.id]!) }
          : undefined
      });
      newTracks.push(newTrack);
      newClips.push(newClip);
    }

    // Insert new tracks immediately beneath the source track and re-index.
    scope.tracks.splice(srcTrackIdx + 1, 0, ...newTracks);
    scope.tracks.forEach((t, i) => {
      t.index = i;
    });
    // Replace source clip with the separated clips.
    scope.clips = scope.clips.filter((c) => c.id !== clip.id);
    scope.clips.push(...newClips);
    scope.state.selectedClipIds = newClips.map((c) => c.id);
    scope.touch(clip.id, ...newClips.map((c) => c.id));

    return {
      ok: true,
      removedClipId: clip.id,
      tracks: newTracks.map((t) => scope.trackOut(t)),
      clips: newClips.map((c) => scope.clipOut(c))
    };
  },

  // ── SQ50: Pattern settings ────────────────────────────────────────────────
  set_pattern: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    let pattern = structuredClone(clip.pattern!);

    if (op.name !== undefined) pattern.name = op.name;
    if (op.lengthSteps !== undefined) {
      pattern = resizePatternLength(pattern, op.lengthSteps);
    }
    if (op.stepRate !== undefined) {
      pattern = setPatternStepRate(pattern, op.stepRate);
    }
    if (op.playback !== undefined) {
      pattern = setPatternPlayback(pattern, op.playback);
    }
    if (op.swing !== undefined) pattern.swing = clampInt(op.swing, 0, 100);
    if (op.swingDivision !== undefined) pattern.swingDivision = op.swingDivision;
    if (op.legato !== undefined) pattern.legato = op.legato;
    if (op.mono !== undefined) pattern.mono = op.mono;
    if (op.midiChannel !== undefined) {
      pattern = setPatternMidiChannel(pattern, op.midiChannel);
    }
    if (op.pitchSource !== undefined) pattern.pitchSource = op.pitchSource;
    if (op.scale !== undefined) pattern.scale = op.scale;
    if (op.scaleQuantize !== undefined) pattern.scaleQuantize = op.scaleQuantize;
    if (op.noTranspose !== undefined) pattern.noTranspose = op.noTranspose;
    if (op.key !== undefined) {
      if (op.key === null) {
        delete pattern.key;
      } else {
        pattern = setPatternKey(pattern, op.key);
      }
    }
    if (op.automationMode !== undefined) {
      pattern = setPatternAutomationMode(pattern, op.automationMode);
    }
    if (op.loopStart !== undefined || op.loopEnd !== undefined) {
      const start0 = op.loopStart !== undefined ? op.loopStart - 1 : undefined;
      const endExcl = op.loopEnd !== undefined ? op.loopEnd : undefined;
      if (start0 !== undefined && endExcl !== undefined && start0 >= endExcl) {
        throw new Error(
          `loopStart (${op.loopStart}) must be <= loopEnd (${op.loopEnd}).`
        );
      }
      pattern = setPatternLoop(pattern, start0, endExcl);
    }

    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clip: scope.clipOut(clip),
      settings: serializePatternSettings(pattern),
      text: patternToText(pattern, instrument)
    };
  },

  set_pattern_seed: (scope, op) => {
    const { clip } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const seed =
      op.seed !== undefined
        ? op.seed >>> 0
        : nextPatternSeed(clip.id, clip.pattern!.seed);
    clip.pattern!.seed = seed;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      seed
    };
  },

  // ── SQ51: Rows ────────────────────────────────────────────────────────────
  add_pattern_rows: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const track = scope.tracks.find((t) => t.id === clip.trackId);
    let pattern = structuredClone(clip.pattern!);

    if (pattern.rows.length + op.rows.length > STEP_PATTERN_MAX_ROWS) {
      throw new Error(
        `Cannot add ${op.rows.length} row(s): pattern already has ${pattern.rows.length} rows and supports at most ${STEP_PATTERN_MAX_ROWS}.`
      );
    }

    const addedIds: string[] = [];
    for (const rowInput of op.rows) {
      assertUniqueSubrows(rowInput.subrows);
      const resolved = resolveRowAssignmentInput(rowInput, instrument, track);
      assertAssignmentAllowed(resolved.assignment, pattern, instrument);
      const id = mintRowId(pattern);
      let steps: Step[] | undefined;
      let lengthSteps = rowInput.lengthSteps ?? pattern.lengthSteps;
      let stepRate = rowInput.stepRate ?? pattern.stepRate;
      if (rowInput.text !== undefined) {
        const lineText = rowInput.text.includes(":")
          ? rowInput.text
          : `${rowInput.name ?? resolved.defaultName ?? "Row"}: ${rowInput.text}`;
        const parsed = parsePatternTextLines(lineText);
        if (parsed[0]) {
          steps = parsed[0].steps;
          if (rowInput.lengthSteps === undefined) {
            lengthSteps = parsed[0].steps.length;
          }
          if (rowInput.stepRate === undefined && parsed[0].stepRate) {
            stepRate = parsed[0].stepRate;
          }
        }
      }
      if (lengthSteps > pattern.lengthSteps) {
        throw new Error(
          `Row lengthSteps (${lengthSteps}) cannot exceed pattern lengthSteps (${pattern.lengthSteps}). Resize the pattern length first.`
        );
      }
      const loopBounds = validateLoopBounds1Based(
        rowInput.loopStart,
        rowInput.loopEnd,
        lengthSteps,
        0,
        lengthSteps
      );
      pattern = addPatternRow(
        pattern,
        {
          id,
          assignment: resolved.assignment,
          name: rowInput.name ?? resolved.defaultName,
          // normalizeRow leaves undefined color and subrowsExpanded off the row.
          color: rowInput.color,
          stepRate,
          lengthSteps,
          playback: rowInput.playback ?? pattern.playback,
          mute: rowInput.mute ?? false,
          solo: rowInput.solo ?? false,
          loopStart: loopBounds.loopStart,
          loopEnd: loopBounds.loopEnd,
          midiChannel: rowInput.midiChannel ?? pattern.midiChannel,
          automationMode: rowInput.automationMode ?? pattern.automationMode,
          subrowsExpanded: rowInput.subrowsExpanded,
          subrows: rowInput.subrows ?? defaultSubrowsForAssignment(resolved.assignment),
          steps
        },
        instrument
      );
      addedIds.push(id);
    }

    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      addedRowIds: addedIds,
      rows: pattern.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  set_pattern_row: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const track = scope.tracks.find((t) => t.id === clip.trackId);
    const pattern = structuredClone(clip.pattern!);
    const { row, index } = resolveRow(pattern, op.row, instrument);
    assertUniqueSubrows(op.subrows);

    let next: StepRow = structuredClone(row);
    if (op.lengthSteps !== undefined) {
      if (op.lengthSteps > pattern.lengthSteps) {
        throw new Error(
          `Row lengthSteps (${op.lengthSteps}) cannot exceed pattern lengthSteps (${pattern.lengthSteps}). Resize the pattern length first.`
        );
      }
      if (op.lengthSteps !== next.lengthSteps) {
        next = resizeRowLength(next, op.lengthSteps);
      }
    }
    if (op.name !== undefined) next.name = op.name;
    if (op.assignment !== undefined) {
      const nextAssign = structuredClone(op.assignment) as StepRowAssignment;
      if (nextAssign.type === "automation" && nextAssign.target.kind === "device") {
        nextAssign.target.deviceId = resolveDeviceId(nextAssign.target.deviceId, track);
      }
      assertAssignmentAllowed(nextAssign, pattern, instrument);
      next.assignment = nextAssign;
    }
    if (op.stepRate !== undefined) {
      stepRateTicks(op.stepRate);
      next.stepRate = op.stepRate;
    }
    if (op.playback !== undefined) next.playback = op.playback;
    if (op.mute !== undefined) next.mute = op.mute;
    if (op.solo !== undefined) next.solo = op.solo;
    if (op.midiChannel !== undefined) {
      next.midiChannel = clampInt(op.midiChannel, 1, 16);
    }
    if (op.automationMode !== undefined) {
      next.automationMode = op.automationMode;
    }
    if (op.color !== undefined) {
      if (op.color === null) delete next.color;
      else next.color = op.color;
    }
    if (op.subrowsExpanded !== undefined) {
      next.subrowsExpanded = op.subrowsExpanded;
    }
    if (op.subrows !== undefined) {
      next.subrows = [...op.subrows];
    }
    if (op.loopStart !== undefined || op.loopEnd !== undefined) {
      const bounds = validateLoopBounds1Based(
        op.loopStart,
        op.loopEnd,
        next.lengthSteps,
        next.loopStart,
        next.loopEnd
      );
      next.loopStart = bounds.loopStart;
      next.loopEnd = bounds.loopEnd;
    }

    pattern.rows[index] = next;
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      row: serializePatternRow(next, instrument)
    };
  },

  remove_pattern_rows: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    if (!op.unused && (!op.rows || op.rows.length === 0)) {
      throw new Error(
        "remove_pattern_rows requires `rows` (row ids or names) or `unused: true`."
      );
    }
    const pattern = structuredClone(clip.pattern!);
    const removeIds = new Set<string>();
    if (op.rows) {
      for (const ref of op.rows) {
        removeIds.add(resolveRow(pattern, ref, instrument).row.id);
      }
    }
    if (op.unused) {
      for (const r of pattern.rows) {
        if (!r.steps.some((s) => s.on)) {
          removeIds.add(r.id);
        }
      }
    }
    const removedRowIds = pattern.rows
      .filter((r) => removeIds.has(r.id))
      .map((r) => r.id);
    pattern.rows = pattern.rows.filter((r) => !removeIds.has(r.id));
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      removedRowIds,
      rows: pattern.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  move_pattern_row: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    const { row, index } = resolveRow(pattern, op.row, instrument);
    if (op.toIndex < 0 || op.toIndex >= pattern.rows.length) {
      throw new Error(
        `toIndex ${op.toIndex} is out of range. Valid indices are 0..${Math.max(0, pattern.rows.length - 1)}.`
      );
    }
    pattern.rows.splice(index, 1);
    pattern.rows.splice(op.toIndex, 0, row);
    delete pattern.rowSort;
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      rows: pattern.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  sort_pattern_rows: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const sorted = sortPatternRows(
      clip.pattern!,
      op.by,
      op.descending ?? false,
      instrument
    );
    clip.pattern = sorted;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      rows: sorted.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  set_pattern_row_sort: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    let pattern = structuredClone(clip.pattern!);
    if (op.rowSort === "none") {
      delete pattern.rowSort;
    } else {
      pattern.rowSort = op.rowSort;
      pattern = applyPatternRowSort(pattern, instrument);
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      rowSort: pattern.rowSort ?? "none",
      rows: pattern.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  copy_pattern_row: (scope, op) => {
    const src = resolvePatternClip(scope, op.clipId);
    const dst = op.toClipId
      ? resolvePatternClip(scope, op.toClipId)
      : src;
    scope.assertWritable([dst.clip]);
    const { row: srcRow, index: srcIndex } = resolveRow(
      src.pattern,
      op.row,
      src.instrument
    );
    const dstPattern = structuredClone(dst.pattern);

    if (op.toRow !== undefined && !op.asNew && !op.nextAssignment) {
      const { row: dstRow, index: dstIndex } = resolveRow(
        dstPattern,
        op.toRow,
        dst.instrument
      );
      if (isNoteRow(srcRow) !== isNoteRow(dstRow)) {
        throw new Error(
          `Cannot copy ${srcRow.assignment.type} row "${rowLabel(srcRow, src.instrument)}" onto ${dstRow.assignment.type} row "${rowLabel(dstRow, dst.instrument)}": row types must match (note vs automation).`
        );
      }
      if (op.settingsOnly) {
        const targetLen = Math.min(srcRow.lengthSteps, dstPattern.lengthSteps);
        const loopEnd = Math.min(srcRow.loopEnd, targetLen);
        const loopStart = Math.min(srcRow.loopStart, loopEnd - 1);
        let updated = resizeRowLength(dstRow, targetLen);
        updated = {
          ...updated,
          stepRate: srcRow.stepRate,
          playback: srcRow.playback,
          mute: srcRow.mute,
          solo: srcRow.solo,
          loopStart,
          loopEnd,
          midiChannel: srcRow.midiChannel,
          automationMode: srcRow.automationMode,
          subrows: [...srcRow.subrows]
        };
        dstPattern.rows[dstIndex] = updated;
      } else {
        // SQ4 / SQ35 / SQ51: preserve target assignment & name when copying
        // onto an existing row, promoting a fixed `note` target to `melodic`
        // if melodic steps are copied into it, and clamping row length to
        // destination pattern length (SQ7).
        const fitted =
          srcRow.lengthSteps > dstPattern.lengthSteps
            ? resizeRowLength(srcRow, dstPattern.lengthSteps)
            : structuredClone(srcRow);
        const hasMelodicOffsets = fitted.steps.some(
          (s) => s.note !== undefined || s.octave !== undefined
        );
        const nextAssignment: StepRowAssignment =
          dstRow.assignment.type === "note" &&
          (srcRow.assignment.type === "melodic" || hasMelodicOffsets)
            ? { type: "melodic", pitch: dstRow.assignment.pitch }
            : structuredClone(dstRow.assignment);
        dstPattern.rows[dstIndex] = {
          ...fitted,
          id: dstRow.id,
          name: dstRow.name,
          assignment: nextAssignment
        };
      }
      dst.clip.pattern = dstPattern;
      scope.touch(dst.clip.id);
      return {
        ok: true,
        clipId: dst.clip.id,
        row: serializePatternRow(dstPattern.rows[dstIndex]!, dst.instrument)
      };
    }

    // Paste as a new row (asNew / nextAssignment / toRow omitted).
    if (dstPattern.rows.length >= STEP_PATTERN_MAX_ROWS) {
      throw new Error(
        `Cannot copy row: destination pattern already has ${STEP_PATTERN_MAX_ROWS} rows.`
      );
    }
    const newId = mintRowId(dstPattern);
    const cloned =
      srcRow.lengthSteps > dstPattern.lengthSteps
        ? resizeRowLength(srcRow, dstPattern.lengthSteps)
        : structuredClone(srcRow);
    cloned.id = newId;
    if (op.settingsOnly) {
      cloned.steps = Array.from({ length: cloned.lengthSteps }, () => ({}));
    }
    if (op.nextAssignment) {
      cloned.assignment = advanceAssignment(srcRow.assignment, dst.instrument);
      delete cloned.name;
    }
    assertAssignmentAllowed(cloned.assignment, dstPattern, dst.instrument);
    const insertAt =
      dst.clip.id === src.clip.id ? srcIndex + 1 : dstPattern.rows.length;
    dstPattern.rows.splice(insertAt, 0, cloned);
    dst.clip.pattern = dstPattern;
    scope.touch(dst.clip.id);
    return {
      ok: true,
      clipId: dst.clip.id,
      row: serializePatternRow(cloned, dst.instrument)
    };
  },

  // ── SQ52: Steps ───────────────────────────────────────────────────────────
  set_steps: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    if (!op.values && !op.ramp) {
      throw new Error("set_steps requires `values` and/or `ramp`.");
    }
    let pattern = structuredClone(clip.pattern!);
    const { row, index } = resolveRow(pattern, op.row, instrument);
    const stepIndices = parseStepSelection(op.steps, row.lengthSteps);

    let updated = row;
    const turnedOn: number[] = [];
    stepIndices.forEach((stepIdx, pos) => {
      const patch: Partial<Step> = {};
      if (op.values) {
        for (const [k, v] of Object.entries(op.values)) {
          if (k === "stepRate" && v === null) {
            patch.stepRate = undefined;
          } else if (v !== undefined) {
            (patch as Record<string, unknown>)[k] = v;
          }
        }
      }
      if (op.ramp) {
        const isDeviceValue =
          op.ramp.field === "value" &&
          updated.assignment.type === "automation" &&
          updated.assignment.target.kind === "device";
        const raw =
          stepIndices.length <= 1
            ? op.ramp.from
            : op.ramp.from +
              ((op.ramp.to - op.ramp.from) * pos) / (stepIndices.length - 1);
        const val = isDeviceValue ? raw : Math.round(raw);
        (patch as Record<string, unknown>)[op.ramp.field] = val;
      }
      const keepOff = op.ramp?.leaveOff === true && op.values?.on !== true;
      // Handle explicit stepRate: null clearing inherited rate.
      if (op.values && op.values.stepRate === null) {
        const clearedSteps = [...updated.steps];
        const copy = { ...(clearedSteps[stepIdx] ?? {}) };
        delete copy.stepRate;
        clearedSteps[stepIdx] = compactStep(copy);
        updated = { ...updated, steps: clearedSteps };
      }
      updated = setStepValue(updated, stepIdx, patch, { keepOff });
      if (updated.steps[stepIdx]?.on) {
        turnedOn.push(stepIdx);
      }
    });

    pattern.rows[index] = updated;
    if (pattern.mono && turnedOn.length > 0) {
      pattern = applyMonoAtSteps(pattern, updated.id, turnedOn);
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      row: serializePatternRow(pattern.rows[index]!, instrument),
      editedSteps: stepIndices.map((i) => i + 1),
      text: patternToText(pattern, instrument)
    };
  },

  set_pattern_text: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const next = applyPatternTextToPattern(
      clip.pattern!,
      op.text,
      op.mode ?? "merge",
      instrument
    );
    clip.pattern = next;
    scope.touch(clip.id);
    return {
      ok: true,
      clip: scope.clipOut(clip),
      pattern: patternSummary(next),
      text: patternToText(next, instrument)
    };
  },

  clear_pattern: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);

    if (op.scope === "steps") {
      if (!op.row || op.steps === undefined) {
        throw new Error('clear_pattern with scope "steps" requires `row` and `steps`.');
      }
      const { row, index } = resolveRow(pattern, op.row, instrument);
      const indices = parseStepSelection(op.steps, row.lengthSteps);
      pattern.rows[index] = clearRowSteps(row, indices, op.mode);
    } else if (op.scope === "row") {
      if (!op.row) {
        throw new Error('clear_pattern with scope "row" requires `row`.');
      }
      const { row, index } = resolveRow(pattern, op.row, instrument);
      pattern.rows[index] = clearRowSteps(row, undefined, op.mode);
    } else {
      pattern.rows = pattern.rows.map((r) => {
        if (op.rowType === "note" && !isNoteRow(r)) return r;
        if (op.rowType === "automation" && isNoteRow(r)) return r;
        return clearRowSteps(r, undefined, op.mode);
      });
    }

    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      text: patternToText(pattern, instrument)
    };
  },

  copy_steps: (scope, op) => {
    const src = resolvePatternClip(scope, op.clipId);
    const dst = op.toClipId ? resolvePatternClip(scope, op.toClipId) : src;
    scope.assertWritable(
      op.cut && dst.clip.id !== src.clip.id ? [src.clip, dst.clip] : [dst.clip]
    );

    const srcPattern = structuredClone(src.pattern);
    const dstPattern =
      dst.clip.id === src.clip.id ? srcPattern : structuredClone(dst.pattern);
    const { row: srcRow, index: srcIdx } = resolveRow(
      srcPattern,
      op.row,
      src.instrument
    );
    const { row: dstRow, index: dstIdx } = resolveRow(
      dstPattern,
      op.toRow,
      dst.instrument
    );
    if (isNoteRow(srcRow) !== isNoteRow(dstRow)) {
      throw new Error(
        `Cannot paste steps from ${srcRow.assignment.type} row "${rowLabel(srcRow, src.instrument)}" to ${dstRow.assignment.type} row "${rowLabel(dstRow, dst.instrument)}": row types must match (note vs automation).`
      );
    }
    const srcIndices = parseStepSelection(op.steps, srcRow.lengthSteps);
    const dstStart = op.toStep - 1;
    if (dstStart < 0 || dstStart >= dstRow.lengthSteps) {
      throw new Error(
        `toStep ${op.toStep} is out of range. Valid steps are 1..${dstRow.lengthSteps}.`
      );
    }

    const base = srcIndices[0]!;
    const copied = srcIndices.map((idx) => structuredClone(srcRow.steps[idx] ?? {}));
    const prevTargetRates = srcIndices.map((idx) => {
      const targetIdx = dstStart + (idx - base);
      return targetIdx >= 0 && targetIdx < dstRow.lengthSteps
        ? dstRow.steps[targetIdx]?.stepRate
        : undefined;
    });

    // Clear source before writing destination so overlapping same-row cut+paste
    // does not erase the freshly pasted steps.
    if (op.cut) {
      srcPattern.rows[srcIdx] = clearRowSteps(srcPattern.rows[srcIdx]!, srcIndices);
      src.clip.pattern = srcPattern;
      scope.touch(src.clip.id);
    }

    const activeDstRow = dstPattern.rows[dstIdx]!;
    const nextDstSteps = [...activeDstRow.steps];
    const pastedOn: number[] = [];
    const pastedSteps1: number[] = [];
    let pastedMelodic = false;
    srcIndices.forEach((idx, k) => {
      const targetIdx = dstStart + (idx - base);
      if (targetIdx < 0 || targetIdx >= activeDstRow.lengthSteps) return;
      const incoming = copied[k]!;
      if (incoming.note !== undefined || incoming.octave !== undefined) {
        pastedMelodic = true;
      }
      // SQ35 / D81: explicit source stepRate stays; unset source stepRate takes
      // the replaced step's explicit rate if any (else inherits target row rate).
      const prevTargetRate = prevTargetRates[k];
      if (incoming.stepRate === undefined && prevTargetRate !== undefined) {
        incoming.stepRate = prevTargetRate;
      }
      nextDstSteps[targetIdx] = compactStep(incoming);
      pastedSteps1.push(targetIdx + 1);
      if (nextDstSteps[targetIdx]!.on) pastedOn.push(targetIdx);
    });

    const nextDstAssignment =
      pastedMelodic && activeDstRow.assignment.type === "note"
        ? { type: "melodic" as const, pitch: activeDstRow.assignment.pitch }
        : activeDstRow.assignment;
    dstPattern.rows[dstIdx] = {
      ...activeDstRow,
      assignment: nextDstAssignment,
      steps: nextDstSteps
    };
    let finalDst = dstPattern;
    if (finalDst.mono && pastedOn.length > 0) {
      finalDst = applyMonoAtSteps(finalDst, activeDstRow.id, pastedOn);
    }
    dst.clip.pattern = finalDst;
    scope.touch(dst.clip.id);
    return {
      ok: true,
      clipId: dst.clip.id,
      pastedSteps: pastedSteps1,
      text: patternToText(finalDst, dst.instrument)
    };
  },

  repeat_step: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    let pattern = structuredClone(clip.pattern!);
    const { row, index } = resolveRow(pattern, op.row, instrument);
    const idx = op.step - 1;
    if (idx < 0 || idx >= row.lengthSteps) {
      throw new Error(
        `Step ${op.step} is out of range. Valid steps are 1..${row.lengthSteps}.`
      );
    }
    if (idx + 1 >= row.lengthSteps) {
      throw new Error(
        `Step ${op.step} is the last step of row "${rowLabel(row, instrument)}" (length ${row.lengthSteps}); there is no following step to repeat into.`
      );
    }
    const nextSteps = [...row.steps];
    nextSteps[idx + 1] = compactStep(structuredClone(row.steps[idx] ?? {}));
    pattern.rows[index] = { ...row, steps: nextSteps };
    if (pattern.mono && nextSteps[idx + 1]!.on) {
      pattern = applyMonoAtSteps(pattern, row.id, [idx + 1]);
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      repeatedToStep: op.step + 1,
      text: patternToText(pattern, instrument)
    };
  },

  // ── SQ53: Transforms ──────────────────────────────────────────────────────
  rotate_pattern: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    if (op.row !== undefined) {
      const { row, index } = resolveRow(pattern, op.row, instrument);
      pattern.rows[index] = rotateRowSteps(row, op.by, op.mode);
    } else {
      pattern.rows = pattern.rows.map((r) => rotateRowSteps(r, op.by, op.mode));
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      text: patternToText(pattern, instrument)
    };
  },

  transpose_pattern: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    if (op.row !== undefined) {
      const { row, index } = resolveRow(pattern, op.row, instrument);
      const stepIndices =
        op.steps !== undefined
          ? parseStepSelection(op.steps, row.lengthSteps)
          : undefined;
      pattern.rows[index] = transposeRowSteps(row, op.semitones, stepIndices, instrument);
    } else {
      pattern.rows = pattern.rows.map((r) => {
        const stepIndices =
          op.steps !== undefined
            ? parseStepSelection(op.steps, r.lengthSteps)
            : undefined;
        return transposeRowSteps(r, op.semitones, stepIndices, instrument);
      });
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      rows: pattern.rows.map((r) => serializePatternRow(r, instrument))
    };
  },

  randomize_pattern: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    let rowIds: Set<string> | undefined;
    if (op.rows && op.rows.length > 0) {
      rowIds = new Set(op.rows.map((r) => resolveRow(pattern, r, instrument).row.id));
    }
    const maxLen =
      pattern.rows.length > 0
        ? Math.max(...pattern.rows.map((r) => r.lengthSteps))
        : pattern.lengthSteps;
    const stepIndices =
      op.steps !== undefined ? parseStepSelection(op.steps, maxLen) : undefined;
    const usedSeed =
      op.seed !== undefined
        ? op.seed >>> 0
        : fnv1a32Uints(
            pattern.seed >>> 0,
            rowKeyHash(clip.id),
            rowKeyHash(op.mode),
            Math.round(op.density ?? 50)
          ) || 1;
    const next = randomizePatternSteps(pattern, op.mode, {
      rowIds,
      stepIndices,
      seed: usedSeed,
      density: op.density
    });
    clip.pattern = next;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      seed: usedSeed,
      text: patternToText(next, instrument)
    };
  },

  nudge_pattern_values: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    if (op.row !== undefined) {
      const { row, index } = resolveRow(pattern, op.row, instrument);
      pattern.rows[index] = nudgeRowValues(row, op.mode, op.delta, instrument);
    } else {
      pattern.rows = pattern.rows.map((r) => nudgeRowValues(r, op.mode, op.delta, instrument));
    }
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      text: patternToText(pattern, instrument)
    };
  },

  tie_steps: (scope, op) => {
    const { clip, instrument } = resolvePatternClip(scope, op.clipId);
    scope.assertWritable([clip]);
    const pattern = structuredClone(clip.pattern!);
    const { row, index } = resolveRow(pattern, op.row, instrument);
    if (op.from < 1 || op.from > row.lengthSteps || op.to < 1 || op.to > row.lengthSteps) {
      throw new Error(
        `tie_steps range [${op.from}, ${op.to}] is outside 1..${row.lengthSteps}.`
      );
    }
    pattern.rows[index] = tieRowSteps(row, op.from - 1, op.to - 1, op.tie);
    clip.pattern = pattern;
    scope.touch(clip.id);
    return {
      ok: true,
      clipId: clip.id,
      text: patternToText(pattern, instrument)
    };
  },

  // ── SQ54, SQ43 & SQ45: Library, Folders & Track Template ──────────────────
  list_step_patterns: async (scope, op) => {
    const q = op.query?.trim().toLowerCase();
    const cat = op.category?.trim().toLowerCase();
    const rawUser: TimelineOpUserStepPattern[] = scope.ctx.stepPatternLibrary
      ? await scope.ctx.stepPatternLibrary.list()
      : [];
    const rawFolders: TimelineOpStepPatternFolder[] = scope.ctx.stepPatternLibrary
      ?.listFolders
      ? await scope.ctx.stepPatternLibrary.listFolders()
      : collectStepPatternFolders([], rawUser);

    let folderFilter: { folder: string; kind?: "pattern" | "template" } | null = null;
    if (op.folder !== undefined && op.folder.trim() !== "") {
      const trimmedFolder = op.folder.trim();
      const rootPattern = stepPatternRootFolder("pattern");
      const rootTemplate = stepPatternRootFolder("template");
      if (trimmedFolder.toLowerCase() === rootPattern.toLowerCase()) {
        folderFilter = { folder: rootPattern, kind: "pattern" };
      } else if (trimmedFolder.toLowerCase() === rootTemplate.toLowerCase()) {
        folderFilter = { folder: rootTemplate, kind: "template" };
      } else if (
        isShortResourceId(trimmedFolder) ||
        isFullResourceId(trimmedFolder)
      ) {
        const resolved = resolveStepPatternFolderRef(
          rawFolders,
          trimmedFolder,
          op.kind
        );
        folderFilter = { folder: resolved.folder, kind: resolved.kind };
      } else {
        const existing = rawFolders.find(
          (f) =>
            (!op.kind || f.kind === op.kind) &&
            (f.folder.toLowerCase() === trimmedFolder.toLowerCase() ||
              f.folder.toLowerCase() ===
                normalizeStepPatternFolderPath(f.kind, trimmedFolder).toLowerCase())
        );
        if (existing) {
          folderFilter = { folder: existing.folder, kind: existing.kind };
        } else {
          const fallbackKind = op.kind ?? "pattern";
          folderFilter = {
            folder: normalizeStepPatternFolderPath(fallbackKind, trimmedFolder),
            kind: op.kind
          };
        }
      }
    }

    const factory = folderFilter
      ? []
      : listFactoryStepPatterns({
          query: op.query,
          kind: op.kind,
          category: op.category
        }).map((e) => {
          const item = {
            id: e.id,
            name: e.name,
            kind: e.kind,
            category: e.category,
            tags: [...e.tags],
            source: "factory" as const
          };
          return e.instrumentPreset ? { ...item, instrumentPreset: e.instrumentPreset } : item;
        });

    const user = rawUser
      .filter((e) => {
        if (op.kind && e.kind !== op.kind) return false;
        if (folderFilter) {
          if (folderFilter.kind && e.kind !== folderFilter.kind) return false;
          const entryFolder = normalizeStepPatternFolderPath(e.kind, e.folder);
          if (!isWithinStepPatternFolder(entryFolder, folderFilter.folder)) {
            return false;
          }
        }
        if (cat && (e.category ?? "user").toLowerCase() !== cat) return false;
        if (q) {
          const hay = [e.id, e.name, e.folder ?? "", ...(e.tags ?? [])]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((e) => {
        const item = {
          id: e.id,
          name: e.name,
          kind: e.kind,
          category: e.category ?? "user",
          tags: [...(e.tags ?? [])],
          folder: e.folder,
          source: "user" as const
        };
        return e.instrumentPreset ? { ...item, instrumentPreset: e.instrumentPreset } : item;
      });

    const folders = rawFolders
      .filter((f) => {
        if (op.kind && f.kind !== op.kind) return false;
        if (folderFilter) {
          if (folderFilter.kind && f.kind !== folderFilter.kind) return false;
          if (!isWithinStepPatternFolder(f.folder, folderFilter.folder)) {
            return false;
          }
        }
        if (q) {
          const hay = `${f.name} ${f.folder}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((f) => {
        const listed = {
          name: f.name,
          kind: f.kind,
          folder: f.folder,
          parentFolder: f.parentFolder
        };
        return f.id !== undefined ? { id: f.id, ...listed } : listed;
      });

    return {
      ok: true,
      entries: [...user, ...factory],
      folders
    };
  },

  apply_step_pattern: async (scope, op) => {
    if (!op.clipId && !op.trackId) {
      throw new Error(
        "apply_step_pattern requires either `clipId` (existing clip) or `trackId` (create a new pattern region)."
      );
    }
    const entry = await resolveLibraryPattern(scope, op.pattern);
    const tempo = resolveTempo(scope.state);
    let loaded = normalizePattern(structuredClone(entry.pattern));
    if (op.useProjectKey) {
      const projKey = projectKeyToStepKey(tempo);
      if (projKey) {
        loaded = setPatternKey(loaded, projKey);
      }
    }

    if (op.clipId) {
      const clip = scope.resolveMidiClip(op.clipId);
      scope.assertWritable([clip]);
      if (!clip.pattern && (clip.notes?.length ?? 0) > 0) {
        throw new Error(
          `Clip "${clip.name}" already holds MIDI notes. Convert it with convert_midi_to_pattern or pass trackId to create a new pattern region.`
        );
      }
      loaded.seed = clip.pattern?.seed ?? seedForClipId(clip.id);
      delete clip.notes;
      delete clip.controllers;
      clip.pattern = loaded;
      scope.touch(clip.id);
      const instrument = trackInstrumentOf(scope, clip);
      return {
        ok: true,
        clip: scope.clipOut(clip),
        appliedPattern: entry.name,
        source: entry.source,
        text: patternToText(loaded, instrument)
      };
    }

    const track = scope.resolveMidiTrack(op.trackId!);
    scope.assertWritable([], track.id);
    scope.state.tempo ??= structuredClone(DEFAULT_TEMPO);
    const hadClips = scope.clips.some((c) => c.trackId === track.id);
    let instrumentApplied = false;
    let appliedInstrumentPreset: string | undefined;
    if (
      !hadClips &&
      isDefaultOrUnsetTrackInstrument(
        track.instrument,
        scope.ctx.defaultMidiInstrument
      )
    ) {
      const savedInstrument = resolveSavedPatternInstrument(entry);
      if (savedInstrument) {
        track.instrument = savedInstrument.instrument;
        instrumentApplied = true;
        appliedInstrumentPreset = savedInstrument.presetId;
      }
    }
    const startMs =
      resolveBarTime(scope.state, op, op.atMs, "atMs") ??
      scope.trackEndMs(track.id);
    const durationMs = Math.max(
      1,
      Math.round((op.bars ?? 1) * barDurationMs(resolveTempo(scope.state)))
    );
    const clipId = scope.ctx.newId("clip");
    loaded.seed = seedForClipId(clipId);
    const clip = makeClip({
      id: clipId,
      trackId: track.id,
      name: entry.name,
      startMs,
      durationMs,
      mediaType: "midi",
      sourceType: "imported",
      status: "generated",
      pattern: loaded
    });
    scope.clips.push(clip);
    scope.state.selectedClipIds = [clip.id];
    scope.touch(clip.id);
    const result: TimelineOpResult = {
      ok: true,
      clip: scope.clipOut(clip),
      appliedPattern: entry.name,
      source: entry.source,
      text: patternToText(loaded, track.instrument)
    };
    if (instrumentApplied) {
      result.track = scope.trackOut(track);
      result.instrumentApplied = true;
      if (appliedInstrumentPreset) result.instrumentPreset = appliedInstrumentPreset;
    }
    return result;
  },

  save_step_pattern: async (scope, op) => {
    const { clip, pattern, instrument } = resolvePatternClip(scope, op.clipId);
    const savedInstrument = instrument ? structuredClone(instrument) : undefined;
    const savedInstrumentPreset = savedInstrument
      ? presetIdForInstrument(savedInstrument)
      : undefined;
    const savedPattern: StepPattern =
      op.kind === "template"
        ? normalizePattern({ ...extractStepPatternTemplate(pattern), name: op.name })
        : normalizePattern({ ...structuredClone(pattern), name: op.name });
    let resolvedFolderArg = op.folder?.trim();
    if (
      resolvedFolderArg &&
      (isShortResourceId(resolvedFolderArg) || isFullResourceId(resolvedFolderArg)) &&
      scope.ctx.stepPatternLibrary?.listFolders
    ) {
      const existingFolders = await scope.ctx.stepPatternLibrary.listFolders();
      resolvedFolderArg = resolveMoveDestinationFolder(
        existingFolders,
        op.kind,
        resolvedFolderArg
      );
    }
    const folder = normalizeStepPatternFolderPath(op.kind, resolvedFolderArg);

    if (scope.ctx.stepPatternLibrary) {
      const rootFolder = stepPatternRootFolder(op.kind);
      const sub =
        folder.length > rootFolder.length
          ? folder.slice(rootFolder.length + 1)
          : undefined;
      const entry: Parameters<TimelineOpStepPatternLibrary["save"]>[0] = {
        name: op.name,
        kind: op.kind,
        folder: sub,
        pattern: savedPattern
      };
      if (savedInstrument) entry.instrument = savedInstrument;
      if (savedInstrumentPreset) entry.instrumentPreset = savedInstrumentPreset;
      const stored = await scope.ctx.stepPatternLibrary.save(entry);
      const saved: TimelineOpResult = {
        ok: true,
        id: stored.id,
        name: op.name,
        kind: op.kind,
        folder: stored.folder || folder,
        assetId: stored.assetId,
        contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
        clipId: clip.id
      };
      if (savedInstrumentPreset) saved.instrumentPreset = savedInstrumentPreset;
      return saved;
    }

    const slug = op.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const result: TimelineOpResult = {
      ok: true,
      id: `user:${op.kind}:${slug || "pattern"}`,
      name: op.name,
      kind: op.kind,
      folder,
      contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
      clipId: clip.id,
      pattern: savedPattern
    };
    if (savedInstrument) result.instrument = savedInstrument;
    if (savedInstrumentPreset) result.instrumentPreset = savedInstrumentPreset;
    return result;
  },

  set_track_step_template: (scope, op) => {
    const track = scope.resolveMidiTrack(op.trackId);
    scope.assertWritable([], track.id);
    if (op.clear) {
      delete track.stepTemplate;
      return {
        ok: true,
        track: scope.trackOut(track),
        cleared: true
      };
    }
    if (!op.fromClipId) {
      throw new Error(
        "set_track_step_template requires `fromClipId` or `clear: true`."
      );
    }
    const { pattern } = resolvePatternClip(scope, op.fromClipId);
    const template = stripPatternSteps(pattern);
    track.stepTemplate = template;
    return {
      ok: true,
      track: scope.trackOut(track),
      rowCount: template.rows.length
    };
  },

  create_step_pattern_folder: async (scope, op) => {
    const library = scope.ctx.stepPatternLibrary;
    if (!library?.createFolder) {
      throw new Error(
        "This session's step pattern library does not support folder operations."
      );
    }
    const created = await library.createFolder({
      name: op.name,
      kind: op.kind,
      parentFolder: op.parentFolder
    });
    return {
      ok: true,
      ...created
    };
  },

  rename_step_pattern_folder: async (scope, op) => {
    const library = scope.ctx.stepPatternLibrary;
    if (!library?.renameFolder) {
      throw new Error(
        "This session's step pattern library does not support folder operations."
      );
    }
    const renamed = await library.renameFolder({
      folder: op.folder,
      newName: op.newName,
      kind: op.kind
    });
    return {
      ok: true,
      ...renamed
    };
  },

  delete_step_pattern_folder: async (scope, op) => {
    const library = scope.ctx.stepPatternLibrary;
    if (!library?.deleteFolder) {
      throw new Error(
        "This session's step pattern library does not support folder operations."
      );
    }
    const deleted = await library.deleteFolder({
      folder: op.folder,
      kind: op.kind
    });
    return {
      ok: true,
      ...deleted
    };
  },

  move_step_pattern: async (scope, op) => {
    const library = scope.ctx.stepPatternLibrary;
    if (!library?.movePattern) {
      throw new Error(
        "This session's step pattern library does not support moving patterns between folders."
      );
    }
    const moved = await library.movePattern({
      pattern: op.pattern,
      folder: op.folder
    });
    return {
      ok: true,
      ...moved
    };
  }
};

export interface MemoryStepPatternLibrarySeed {
  entries?: readonly TimelineOpUserStepPattern[];
  folders?: readonly ExplicitStepPatternFolderRecord[];
}

/** Create an in-memory user step pattern library (for tests and headless bridge parity). */
export function createMemoryStepPatternLibrary(
  seed?: MemoryStepPatternLibrarySeed
): FullStepPatternLibrary {
  const entries: TimelineOpUserStepPattern[] = (seed?.entries ?? []).map((e) =>
    structuredClone(e)
  );
  const folderMarkers: ExplicitStepPatternFolderRecord[] = (
    seed?.folders ?? []
  ).map((f) => ({ ...f }));
  let patternSeq = 0;
  let folderSeq = 0;

  const mintPatternId = (): string => {
    for (;;) {
      const candidate = `${(++patternSeq).toString(16).padStart(8, "0")}a0a000000000000000000000`;
      if (!entries.some((e) => e.id === candidate)) return candidate;
    }
  };

  const mintFolderId = (): string => {
    for (;;) {
      const candidate = `${(++folderSeq).toString(16).padStart(8, "0")}f01d00000000000000000000`;
      if (!folderMarkers.some((f) => f.id === candidate)) return candidate;
    }
  };

  const currentFolders = (): TimelineOpStepPatternFolder[] =>
    collectStepPatternFolders(folderMarkers, entries);

  return {
    async list() {
      return entries.map((e) => structuredClone(e));
    },
    async listFolders() {
      return currentFolders().map((f) => ({ ...f }));
    },
    async save({ name, kind, folder, pattern, instrument, instrumentPreset }) {
      const fullFolder = normalizeStepPatternFolderPath(kind, folder);
      const existing = entries.find(
        (e) => e.kind === kind && e.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        existing.folder = fullFolder;
        existing.pattern = structuredClone(pattern);
        if (instrument) {
          existing.instrument = structuredClone(instrument);
        } else {
          delete existing.instrument;
        }
        if (instrumentPreset) {
          existing.instrumentPreset = instrumentPreset;
        } else {
          delete existing.instrumentPreset;
        }
        return { id: existing.id, folder: fullFolder };
      }
      const id = mintPatternId();
      const created: TimelineOpUserStepPattern = {
        id,
        name,
        kind,
        category: kind === "template" ? "templates" : "user",
        tags: [kind, "user"],
        folder: fullFolder,
        pattern: structuredClone(pattern)
      };
      if (instrument) created.instrument = structuredClone(instrument);
      if (instrumentPreset) created.instrumentPreset = instrumentPreset;
      entries.push(created);
      return { id, folder: fullFolder };
    },
    async createFolder({ kind, name, parentFolder }) {
      const target = resolveCreateStepPatternFolderTarget(currentFolders(), {
        kind,
        name,
        parentFolder
      });
      const id = mintFolderId();
      folderMarkers.push({ id, kind: target.kind, folder: target.folder });
      return {
        id,
        name: target.name,
        kind: target.kind,
        folder: target.folder,
        parentFolder: target.parentFolder
      };
    },
    async renameFolder({ folder, newName, kind }) {
      const plan = resolveRenameStepPatternFolderTarget(currentFolders(), {
        folder,
        newName,
        kind
      });
      for (const marker of folderMarkers) {
        if (
          marker.kind === plan.kind &&
          isWithinStepPatternFolder(marker.folder, plan.previousFolder)
        ) {
          marker.folder = remapStepPatternFolderPath(
            marker.folder,
            plan.previousFolder,
            plan.folder
          );
        }
      }
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (const entry of entries) {
        if (
          entry.kind === plan.kind &&
          isWithinStepPatternFolder(entry.folder, plan.previousFolder)
        ) {
          const nextFolder = remapStepPatternFolderPath(
            entry.folder!,
            plan.previousFolder,
            plan.folder
          );
          entry.folder = nextFolder;
          movedPatterns.push({
            id: entry.id,
            name: entry.name,
            folder: nextFolder
          });
        }
      }
      const renamed = {
        name: plan.name,
        kind: plan.kind,
        previousFolder: plan.previousFolder,
        folder: plan.folder,
        parentFolder: plan.parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
      return plan.current.id !== undefined ? { id: plan.current.id, ...renamed } : renamed;
    },
    async deleteFolder({ folder, kind }) {
      const target = resolveStepPatternFolderRef(currentFolders(), folder, kind);
      const parentFolder = parentStepPatternFolder(target.kind, target.folder);
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (const entry of entries) {
        if (
          entry.kind === target.kind &&
          isWithinStepPatternFolder(entry.folder, target.folder)
        ) {
          entry.folder = parentFolder;
          movedPatterns.push({
            id: entry.id,
            name: entry.name,
            folder: parentFolder
          });
        }
      }
      for (let i = folderMarkers.length - 1; i >= 0; i -= 1) {
        const marker = folderMarkers[i]!;
        if (
          marker.kind === target.kind &&
          isWithinStepPatternFolder(marker.folder, target.folder)
        ) {
          folderMarkers.splice(i, 1);
        }
      }
      return {
        kind: target.kind,
        deletedFolder: target.folder,
        parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
    },
    async movePattern({ pattern, folder }) {
      const match = resolveUserStepPatternRef(entries, pattern);
      const targetFolder = resolveMoveDestinationFolder(
        currentFolders(),
        match.kind,
        folder
      );
      const previousFolder = match.folder ?? stepPatternRootFolder(match.kind);
      match.folder = targetFolder;
      return {
        id: match.id,
        name: match.name,
        kind: match.kind,
        previousFolder,
        folder: targetFolder
      };
    }
  };
}
