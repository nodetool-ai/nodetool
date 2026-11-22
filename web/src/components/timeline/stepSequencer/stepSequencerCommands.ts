/**
 * The Step Sequencer command table (SQ35): every command has one id, one key
 * chord, one menu and one result. A result is a list of ops (document edits,
 * one undo entry) or a view action. Keys and menus both read this table, so a
 * command cannot exist on a key without a menu item.
 *
 * Modifier names are macOS. Off macOS, Command is Ctrl, Option is Alt and
 * Control is Ctrl+Alt (D106). A Control chord that then collides with another
 * chord is menu-only off macOS (`nonMacChord`).
 */

import { nudgeStepRate } from "@nodetool-ai/timeline";
import type { StepEditMode, StepPattern, StepPlaybackMode } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import {
  EDIT_MODE_ORDER,
  PLAYBACK_KEYS,
  effectiveMode,
  modeUnit,
  parseStepKey,
  type StepKey
} from "./stepSequencerModel";

export interface Chord {
  key: string;
  cmd?: boolean;
  opt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

export type StepUiAction =
  | { type: "setMode"; mode: StepEditMode }
  | { type: "cycleMode"; dir: 1 | -1 }
  | { type: "move"; dx: number; dy: number; extend: boolean }
  | { type: "subrows"; show: boolean; all: boolean }
  | { type: "clipboard"; action: "copySteps" | "cutSteps" | "pasteSteps" | "pasteStepsOnly" }
  | { type: "rowClipboard"; action: "copy" | "paste" | "pasteNew" | "pasteSettings" }
  | { type: "toggle"; what: "browser" | "inspector" | "learnAdd" | "liveRecord" }
  | { type: "renameRow" }
  | { type: "nextPage" }
  | { type: "save"; kind: "pattern" | "template" };

export interface CommandContext {
  clipId: string;
  trackId: string;
  pattern: StepPattern;
  selection: ReadonlySet<StepKey>;
  /** Rows selected by a header click, else the rows of the selected steps. */
  rowIds: readonly string[];
  editMode: StepEditMode;
}

export interface CommandResult {
  ops?: TimelineOp[];
  ui?: StepUiAction;
}

export type StepMenu = "edit" | "functions" | "view";

export interface StepCommand {
  id: string;
  menu: StepMenu;
  chord?: Chord;
  /** `null` when the command has nothing to act on. */
  run: (ctx: CommandContext) => CommandResult | null;
}

const stepsByRow = (selection: ReadonlySet<StepKey>): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  for (const k of selection) {
    const { rowId, step } = parseStepKey(k);
    const list = out.get(rowId) ?? [];
    list.push(step + 1);
    out.set(rowId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
};

const firstRow = (ctx: CommandContext): string | undefined => ctx.rowIds[0];

const perRow = (
  ctx: CommandContext,
  build: (rowId: string) => TimelineOp | null
): CommandResult | null => {
  const ops = ctx.rowIds.map(build).filter((o): o is TimelineOp => o !== null);
  return ops.length > 0 ? { ops } : null;
};

const ui = (action: StepUiAction) => (): CommandResult => ({ ui: action });

/** A fresh seed per randomize, so a second click gives a new result (F6, D98). */
export const nextSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/**
 * The rows of `rowIds` grouped by the mode they edit: Velocity reads as Value
 * on automation rows (F8). One group when every row edits the same mode.
 */
function rowsByMode(ctx: CommandContext, rowIds: readonly string[]): Array<[StepEditMode, string[]]> {
  const out = new Map<StepEditMode, string[]>();
  for (const id of rowIds) {
    const row = ctx.pattern.rows.find((r) => r.id === id);
    if (!row) continue;
    const mode = effectiveMode(row, ctx.editMode);
    out.set(mode, [...(out.get(mode) ?? []), id]);
  }
  return [...out];
}

const rowMode = (ctx: CommandContext, rowId: string): StepEditMode => {
  const row = ctx.pattern.rows.find((r) => r.id === rowId);
  return row ? effectiveMode(row, ctx.editMode) : ctx.editMode;
};

const allRowIds = (ctx: CommandContext): string[] => ctx.pattern.rows.map((r) => r.id);

/** Increment or decrement the current mode by one unit per row (SQ35). */
export function nudgeOps(ctx: CommandContext, rowIds: readonly string[], dir: number): TimelineOp[] {
  return rowIds.flatMap((id) => {
    const row = ctx.pattern.rows.find((r) => r.id === id);
    if (!row) return [];
    const mode = effectiveMode(row, ctx.editMode);
    return [{ op: "nudge_pattern_values" as const, clipId: ctx.clipId, row: id, mode, delta: dir * modeUnit(row, mode) }];
  });
}

/** Clear the current mode on every row of one type, in that type's mode. */
const clearModeOfType = (ctx: CommandContext, rowType: "note" | "automation"): TimelineOp | null => {
  const row = ctx.pattern.rows.find((r) => (r.assignment.type === "automation") === (rowType === "automation"));
  if (!row) return null;
  return { op: "clear_pattern", clipId: ctx.clipId, scope: "pattern", mode: effectiveMode(row, ctx.editMode), rowType };
};

const randomize = (ctx: CommandContext, rowIds: readonly string[], all: boolean, steps?: number[]): TimelineOp[] => {
  const groups = rowsByMode(ctx, rowIds);
  if (all && groups.length <= 1) {
    return [{ op: "randomize_pattern", clipId: ctx.clipId, mode: groups[0]?.[0] ?? ctx.editMode, seed: nextSeed() }];
  }
  return groups.map(([mode, rows]) => ({
    op: "randomize_pattern" as const,
    clipId: ctx.clipId,
    mode,
    rows,
    ...(steps ? { steps } : {}),
    seed: nextSeed()
  }));
};

const transpose = (semitones: number) => (ctx: CommandContext): CommandResult | null => {
  if (ctx.selection.size > 0) {
    return {
      ops: [...stepsByRow(ctx.selection)].map(([row, steps]) => ({
        op: "transpose_pattern" as const,
        clipId: ctx.clipId,
        row,
        steps,
        semitones
      }))
    };
  }
  if (ctx.rowIds.length > 0) {
    return perRow(ctx, (row) => ({ op: "transpose_pattern", clipId: ctx.clipId, row, semitones }));
  }
  return { ops: [{ op: "transpose_pattern", clipId: ctx.clipId, semitones }] };
};

const rowRateNudge = (delta: number) => (ctx: CommandContext): CommandResult | null =>
  perRow(ctx, (rowId) => {
    const row = ctx.pattern.rows.find((r) => r.id === rowId);
    return row
      ? { op: "set_pattern_row", clipId: ctx.clipId, row: rowId, stepRate: nudgeStepRate(row.stepRate, delta) }
      : null;
  });

const loopNudge = (edge: "start" | "end", delta: number) => (ctx: CommandContext): CommandResult | null =>
  perRow(ctx, (rowId) => {
    const row = ctx.pattern.rows.find((r) => r.id === rowId);
    if (!row) return null;
    // Stored loop range is 0-based start, exclusive end; ops take 1-based inclusive.
    const start = row.loopStart + 1;
    const end = row.loopEnd;
    const nextStart = edge === "start" ? Math.max(1, Math.min(end, start + delta)) : start;
    const nextEnd = edge === "end" ? Math.max(start, Math.min(row.lengthSteps, end + delta)) : end;
    return { op: "set_pattern_row", clipId: ctx.clipId, row: rowId, loopStart: nextStart, loopEnd: nextEnd };
  });

const playbackCommands = (): StepCommand[] =>
  PLAYBACK_KEYS.flatMap(([key, mode]: [string, StepPlaybackMode]) => [
    {
      id: `patternPlayback.${mode}`,
      menu: "functions" as const,
      chord: { key, ctrl: true, opt: true },
      run: (ctx: CommandContext): CommandResult => ({
        ops: [{ op: "set_pattern", clipId: ctx.clipId, playback: mode }]
      })
    },
    {
      id: `rowPlayback.${mode}`,
      menu: "functions" as const,
      chord: { key, ctrl: true },
      run: (ctx: CommandContext): CommandResult | null =>
        perRow(ctx, (row) => ({ op: "set_pattern_row", clipId: ctx.clipId, row, playback: mode }))
    }
  ]);

const MODE_KEYS: Partial<Record<StepEditMode, Chord>> = {
  onOff: { key: "s", ctrl: true, opt: true },
  velocity: { key: "v" },
  gate: { key: "g" },
  tie: { key: "t" },
  note: { key: "n" },
  octave: { key: "o" },
  loop: { key: "l" },
  repeat: { key: "r" },
  chance: { key: "c" },
  offset: { key: "f" },
  stepRate: { key: "a" },
  skip: { key: "k" }
};

const modeCommands = (): StepCommand[] =>
  EDIT_MODE_ORDER.map((mode) => ({
    id: `mode.${mode}`,
    menu: "view" as const,
    chord: MODE_KEYS[mode],
    run: ui({ type: "setMode", mode })
  }));

export const STEP_COMMANDS: readonly StepCommand[] = [
  // Edit: steps
  { id: "cut", menu: "edit", chord: { key: "x", cmd: true }, run: ui({ type: "clipboard", action: "cutSteps" }) },
  { id: "copy", menu: "edit", chord: { key: "c", cmd: true }, run: ui({ type: "clipboard", action: "copySteps" }) },
  { id: "paste", menu: "edit", chord: { key: "v", cmd: true }, run: ui({ type: "clipboard", action: "pasteSteps" }) },
  { id: "pasteSteps", menu: "edit", chord: { key: "v", opt: true, shift: true }, run: ui({ type: "clipboard", action: "pasteStepsOnly" }) },
  {
    id: "repeatStep",
    menu: "edit",
    chord: { key: "r", cmd: true },
    run: (ctx) => {
      const ops = [...stepsByRow(ctx.selection)].map(([row, steps]) => ({
        op: "repeat_step" as const,
        clipId: ctx.clipId,
        row,
        step: steps[steps.length - 1]!
      }));
      return ops.length > 0 ? { ops } : null;
    }
  },
  {
    id: "clearStep",
    menu: "edit",
    chord: { key: "Backspace", ctrl: true },
    run: (ctx) => {
      const ops = [...stepsByRow(ctx.selection)].map(([row, steps]) => ({
        op: "clear_pattern" as const,
        clipId: ctx.clipId,
        scope: "steps" as const,
        row,
        steps
      }));
      return ops.length > 0 ? { ops } : null;
    }
  },
  {
    id: "toggleStep",
    menu: "edit",
    chord: { key: "'" },
    run: (ctx) => {
      const ops: TimelineOp[] = [];
      for (const [rowId, steps] of stepsByRow(ctx.selection)) {
        const row = ctx.pattern.rows.find((r) => r.id === rowId);
        if (!row) continue;
        const on = steps.filter((s) => row.steps[s - 1]?.on === true);
        const off = steps.filter((s) => row.steps[s - 1]?.on !== true);
        if (on.length) ops.push({ op: "set_steps", clipId: ctx.clipId, row: rowId, steps: on, values: { on: false } });
        if (off.length) ops.push({ op: "set_steps", clipId: ctx.clipId, row: rowId, steps: off, values: { on: true } });
      }
      return ops.length > 0 ? { ops } : null;
    }
  },
  // Edit: rows
  { id: "copyRow", menu: "edit", chord: { key: "c", ctrl: true }, run: ui({ type: "rowClipboard", action: "copy" }) },
  { id: "pasteRow", menu: "edit", chord: { key: "v", ctrl: true }, run: ui({ type: "rowClipboard", action: "paste" }) },
  { id: "pasteNewRow", menu: "edit", chord: { key: "v", ctrl: true, shift: true }, run: ui({ type: "rowClipboard", action: "pasteNew" }) },
  { id: "pasteRowSettings", menu: "edit", chord: { key: "v", ctrl: true, opt: true, shift: true }, run: ui({ type: "rowClipboard", action: "pasteSettings" }) },
  {
    id: "duplicateRow",
    menu: "edit",
    chord: { key: "d", cmd: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "copy_pattern_row", clipId: ctx.clipId, row, nextAssignment: true }))
  },
  {
    id: "deleteRow",
    menu: "edit",
    chord: { key: "Backspace", cmd: true },
    run: (ctx) => (ctx.rowIds.length ? { ops: [{ op: "remove_pattern_rows", clipId: ctx.clipId, rows: [...ctx.rowIds] }] } : null)
  },
  {
    id: "deleteUnusedRows",
    menu: "edit",
    chord: { key: "Backspace", cmd: true, shift: true },
    run: (ctx) =>
      ctx.pattern.rows.some((r) => !r.steps.some((s) => s?.on))
        ? { ops: [{ op: "remove_pattern_rows", clipId: ctx.clipId, unused: true }] }
        : null
  },
  {
    id: "clearRow",
    menu: "edit",
    chord: { key: "Backspace", ctrl: true, cmd: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "clear_pattern", clipId: ctx.clipId, scope: "row", row }))
  },
  {
    id: "clearModeRow",
    menu: "edit",
    chord: { key: "Backspace", opt: true, cmd: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "clear_pattern", clipId: ctx.clipId, scope: "row", row, mode: rowMode(ctx, row) }))
  },
  { id: "renameRow", menu: "edit", chord: { key: "Enter", shift: true }, run: ui({ type: "renameRow" }) },
  {
    id: "soloRow",
    menu: "edit",
    chord: { key: "s", ctrl: true, shift: true },
    run: (ctx) =>
      perRow(ctx, (rowId) => {
        const row = ctx.pattern.rows.find((r) => r.id === rowId);
        return row ? { op: "set_pattern_row", clipId: ctx.clipId, row: rowId, solo: !row.solo } : null;
      })
  },
  {
    id: "muteRow",
    menu: "edit",
    chord: { key: "m", ctrl: true, shift: true },
    run: (ctx) =>
      perRow(ctx, (rowId) => {
        const row = ctx.pattern.rows.find((r) => r.id === rowId);
        return row ? { op: "set_pattern_row", clipId: ctx.clipId, row: rowId, mute: !row.mute } : null;
      })
  },
  // Functions: pattern
  {
    id: "clearPattern",
    menu: "functions",
    chord: { key: "Backspace", ctrl: true, shift: true, cmd: true },
    run: (ctx) => ({ ops: [{ op: "clear_pattern", clipId: ctx.clipId, scope: "pattern" }] })
  },
  {
    id: "clearModeAll",
    menu: "functions",
    chord: { key: "Backspace", opt: true, shift: true, cmd: true },
    run: (ctx) => {
      if (rowsByMode(ctx, allRowIds(ctx)).length <= 1) {
        return { ops: [{ op: "clear_pattern", clipId: ctx.clipId, scope: "pattern", mode: rowMode(ctx, allRowIds(ctx)[0] ?? "") }] };
      }
      const ops = [clearModeOfType(ctx, "note"), clearModeOfType(ctx, "automation")].filter((o): o is TimelineOp => o !== null);
      return { ops };
    }
  },
  {
    id: "clearModeNoteRows",
    menu: "functions",
    run: (ctx) => {
      const op = clearModeOfType(ctx, "note");
      return op ? { ops: [op] } : null;
    }
  },
  {
    id: "clearModeAutomationRows",
    menu: "functions",
    run: (ctx) => {
      const op = clearModeOfType(ctx, "automation");
      return op ? { ops: [op] } : null;
    }
  },
  { id: "transposeUp", menu: "functions", chord: { key: "ArrowUp", opt: true }, run: transpose(1) },
  { id: "transposeDown", menu: "functions", chord: { key: "ArrowDown", opt: true }, run: transpose(-1) },
  { id: "transposeOctaveUp", menu: "functions", chord: { key: "ArrowUp", opt: true, shift: true }, run: transpose(12) },
  { id: "transposeOctaveDown", menu: "functions", chord: { key: "ArrowDown", opt: true, shift: true }, run: transpose(-12) },
  {
    id: "rotatePatternLeft",
    menu: "functions",
    chord: { key: "ArrowLeft", ctrl: true, opt: true, cmd: true },
    run: (ctx) => ({ ops: [{ op: "rotate_pattern", clipId: ctx.clipId, by: -1 }] })
  },
  {
    id: "rotatePatternRight",
    menu: "functions",
    chord: { key: "ArrowRight", ctrl: true, opt: true, cmd: true },
    run: (ctx) => ({ ops: [{ op: "rotate_pattern", clipId: ctx.clipId, by: 1 }] })
  },
  {
    id: "rotateRowLeft",
    menu: "functions",
    chord: { key: "ArrowLeft", opt: true, cmd: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "rotate_pattern", clipId: ctx.clipId, row, by: -1 }))
  },
  {
    id: "rotateRowRight",
    menu: "functions",
    chord: { key: "ArrowRight", opt: true, cmd: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "rotate_pattern", clipId: ctx.clipId, row, by: 1 }))
  },
  {
    id: "rotateModeLeft",
    menu: "functions",
    chord: { key: "ArrowLeft", opt: true, shift: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "rotate_pattern", clipId: ctx.clipId, row, by: -1, mode: rowMode(ctx, row) }))
  },
  {
    id: "rotateModeRight",
    menu: "functions",
    chord: { key: "ArrowRight", opt: true, shift: true },
    run: (ctx) => perRow(ctx, (row) => ({ op: "rotate_pattern", clipId: ctx.clipId, row, by: 1, mode: rowMode(ctx, row) }))
  },
  {
    id: "randomizeRows",
    menu: "functions",
    chord: { key: "r", shift: true, cmd: true },
    run: (ctx) => (ctx.rowIds.length ? { ops: randomize(ctx, ctx.rowIds, false) } : null)
  },
  {
    id: "randomizeAll",
    menu: "functions",
    chord: { key: "r", opt: true, cmd: true },
    run: (ctx) => ({ ops: randomize(ctx, allRowIds(ctx), true) })
  },
  {
    id: "randomizeSteps",
    menu: "functions",
    chord: { key: "r", opt: true, shift: true, cmd: true },
    run: (ctx) => {
      const ops = [...stepsByRow(ctx.selection)].flatMap(([row, steps]) => randomize(ctx, [row], false, steps));
      return ops.length ? { ops } : null;
    }
  },
  ...playbackCommands(),
  {
    id: "patternRateUp",
    menu: "functions",
    chord: { key: "=", ctrl: true, shift: true },
    run: (ctx) => ({ ops: [{ op: "set_pattern", clipId: ctx.clipId, stepRate: nudgeStepRate(ctx.pattern.stepRate, 1) }] })
  },
  {
    id: "patternRateDown",
    menu: "functions",
    chord: { key: "-", ctrl: true, shift: true },
    run: (ctx) => ({ ops: [{ op: "set_pattern", clipId: ctx.clipId, stepRate: nudgeStepRate(ctx.pattern.stepRate, -1) }] })
  },
  { id: "rowRateUp", menu: "functions", chord: { key: "=", ctrl: true }, run: rowRateNudge(1) },
  { id: "rowRateDown", menu: "functions", chord: { key: "-", ctrl: true }, run: rowRateNudge(-1) },
  { id: "loopStartUp", menu: "functions", chord: { key: "=", ctrl: true, opt: true }, run: loopNudge("start", 1) },
  { id: "loopStartDown", menu: "functions", chord: { key: "-", ctrl: true, opt: true }, run: loopNudge("start", -1) },
  { id: "loopEndUp", menu: "functions", chord: { key: "=", opt: true, cmd: true }, run: loopNudge("end", 1) },
  { id: "loopEndDown", menu: "functions", chord: { key: "-", opt: true, cmd: true }, run: loopNudge("end", -1) },
  {
    id: "mono",
    menu: "functions",
    chord: { key: "m", ctrl: true, shift: true, cmd: true },
    run: (ctx) => ({ ops: [{ op: "set_pattern", clipId: ctx.clipId, mono: !ctx.pattern.mono }] })
  },
  { id: "savePattern", menu: "functions", chord: { key: "p", shift: true, cmd: true }, run: ui({ type: "save", kind: "pattern" }) },
  { id: "saveTemplate", menu: "functions", chord: { key: "t", shift: true, cmd: true }, run: ui({ type: "save", kind: "template" }) },
  {
    id: "storeDefaultTemplate",
    menu: "functions",
    chord: { key: "d", ctrl: true, opt: true, cmd: true },
    run: (ctx) => ({ ops: [{ op: "set_track_step_template", trackId: ctx.trackId, fromClipId: ctx.clipId }] })
  },
  {
    id: "revertDefaultTemplate",
    menu: "functions",
    chord: { key: "d", ctrl: true, opt: true, shift: true },
    run: (ctx) => ({ ops: [{ op: "set_track_step_template", trackId: ctx.trackId, clear: true }] })
  },
  { id: "liveRecord", menu: "functions", chord: { key: "r", shift: true }, run: ui({ type: "toggle", what: "liveRecord" }) },
  { id: "learnAdd", menu: "functions", chord: { key: "l", opt: true, cmd: true }, run: ui({ type: "toggle", what: "learnAdd" }) },
  // View
  ...modeCommands(),
  { id: "nextMode", menu: "view", chord: { key: "PageDown", opt: true }, run: ui({ type: "cycleMode", dir: 1 }) },
  { id: "previousMode", menu: "view", chord: { key: "PageUp", opt: true }, run: ui({ type: "cycleMode", dir: -1 }) },
  { id: "showSubrows", menu: "view", chord: { key: "ArrowRight", ctrl: true, cmd: true }, run: ui({ type: "subrows", show: true, all: false }) },
  { id: "hideSubrows", menu: "view", chord: { key: "ArrowLeft", ctrl: true, cmd: true }, run: ui({ type: "subrows", show: false, all: false }) },
  { id: "showAllSubrows", menu: "view", chord: { key: "ArrowRight", ctrl: true, shift: true, cmd: true }, run: ui({ type: "subrows", show: true, all: true }) },
  { id: "hideAllSubrows", menu: "view", chord: { key: "ArrowLeft", ctrl: true, shift: true, cmd: true }, run: ui({ type: "subrows", show: false, all: true }) },
  { id: "browser", menu: "view", chord: { key: "b", opt: true, shift: true }, run: ui({ type: "toggle", what: "browser" }) },
  { id: "inspector", menu: "view", run: ui({ type: "toggle", what: "inspector" }) },
  { id: "nextPage", menu: "view", chord: { key: "`", opt: true }, run: ui({ type: "nextPage" }) },
  // Navigation (no menu label needed beyond Edit)
  { id: "moveLeft", menu: "edit", chord: { key: "ArrowLeft" }, run: ui({ type: "move", dx: -1, dy: 0, extend: false }) },
  { id: "moveRight", menu: "edit", chord: { key: "ArrowRight" }, run: ui({ type: "move", dx: 1, dy: 0, extend: false }) },
  { id: "moveUp", menu: "edit", chord: { key: "ArrowUp" }, run: ui({ type: "move", dx: 0, dy: -1, extend: false }) },
  { id: "moveDown", menu: "edit", chord: { key: "ArrowDown" }, run: ui({ type: "move", dx: 0, dy: 1, extend: false }) },
  { id: "extendLeft", menu: "edit", chord: { key: "ArrowLeft", shift: true }, run: ui({ type: "move", dx: -1, dy: 0, extend: true }) },
  { id: "extendRight", menu: "edit", chord: { key: "ArrowRight", shift: true }, run: ui({ type: "move", dx: 1, dy: 0, extend: true }) },
  { id: "extendUp", menu: "edit", chord: { key: "ArrowUp", shift: true }, run: ui({ type: "move", dx: 0, dy: -1, extend: true }) },
  { id: "extendDown", menu: "edit", chord: { key: "ArrowDown", shift: true }, run: ui({ type: "move", dx: 0, dy: 1, extend: true }) }
];

interface KeyLike {
  key: string;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  code?: string;
}

/** The key name a chord compares, ignoring the Shift and Option glyph changes. */
function keyName(event: KeyLike): string {
  const code = event.code ?? "";
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code === "Equal") return "=";
  if (code === "Minus") return "-";
  if (code === "BracketRight") return "]";
  if (code === "BracketLeft") return "[";
  if (code === "Backslash") return "\\";
  if (code === "Quote") return "'";
  if (code === "Backquote") return "`";
  if (event.key === "Delete") return "Backspace";
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/** Ctrl and Alt a macOS chord becomes off macOS (D106). */
const nonMacMods = (c: Chord) => ({
  ctrl: c.cmd === true || c.ctrl === true,
  alt: c.opt === true || c.ctrl === true,
  shift: c.shift === true
});
const nonMacSignature = (c: Chord): string => {
  const m = nonMacMods(c);
  return `${c.key}|${m.ctrl}|${m.alt}|${m.shift}`;
};
const modifierCount = (c: Chord): number =>
  [c.cmd, c.opt, c.ctrl, c.shift].filter((v) => v === true).length;

/**
 * The command that keeps each colliding chord off macOS (D106): a chord
 * without Control wins (the Option-Command entry), then the one with the
 * fewest modifiers. The others are menu-only off macOS.
 */
const NON_MAC_WINNER: ReadonlyMap<string, string> = (() => {
  const groups = new Map<string, StepCommand[]>();
  for (const c of STEP_COMMANDS) {
    if (!c.chord) continue;
    const sig = nonMacSignature(c.chord);
    groups.set(sig, [...(groups.get(sig) ?? []), c]);
  }
  const out = new Map<string, string>();
  for (const [sig, list] of groups) {
    const ranked = [...list].sort(
      (a, b) =>
        Number(a.chord!.ctrl === true) - Number(b.chord!.ctrl === true) ||
        modifierCount(a.chord!) - modifierCount(b.chord!)
    );
    out.set(sig, ranked[0]!.id);
  }
  return out;
})();

/** The command's chord off macOS, or `undefined` when it is menu-only there (D106). */
export function nonMacChord(command: StepCommand): Chord | undefined {
  if (!command.chord) return undefined;
  return NON_MAC_WINNER.get(nonMacSignature(command.chord)) === command.id ? command.chord : undefined;
}

export function matchesChord(event: KeyLike, chord: Chord, mac: boolean): boolean {
  if (keyName(event) !== chord.key) return false;
  if (event.shiftKey !== (chord.shift === true)) return false;
  if (mac) {
    return (
      event.metaKey === (chord.cmd === true) &&
      event.altKey === (chord.opt === true) &&
      event.ctrlKey === (chord.ctrl === true)
    );
  }
  const m = nonMacMods(chord);
  return !event.metaKey && event.ctrlKey === m.ctrl && event.altKey === m.alt;
}

export function commandForKey(event: KeyLike, mac: boolean): StepCommand | undefined {
  return STEP_COMMANDS.find((c) => {
    const chord = mac ? c.chord : nonMacChord(c);
    return chord !== undefined && matchesChord(event, chord, mac);
  });
}

/** The chord a menu row shows on this platform. */
export const menuChord = (command: StepCommand, mac: boolean): Chord | undefined =>
  mac ? command.chord : nonMacChord(command);

/** Shortcut text for a menu row, in platform glyphs. */
export function chordLabel(chord: Chord | undefined, mac: boolean): string | undefined {
  if (!chord) return undefined;
  const key =
    chord.key === "Backspace"
      ? mac ? "⌫" : "Del"
      : chord.key.startsWith("Arrow")
        ? { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" }[chord.key]
        : chord.key === "Enter"
          ? "↩"
          : chord.key.length === 1
            ? chord.key.toUpperCase()
            : chord.key;
  if (mac) {
    return `${chord.ctrl ? "⌃" : ""}${chord.opt ? "⌥" : ""}${chord.shift ? "⇧" : ""}${chord.cmd ? "⌘" : ""}${key}`;
  }
  const parts: string[] = [];
  if (chord.cmd || chord.ctrl) parts.push("Ctrl");
  if (chord.opt || chord.ctrl) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  parts.push(key ?? chord.key);
  return parts.join("+");
}
