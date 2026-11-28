/** @jsxImportSource @emotion/react */
/**
 * The Step Sequencer rows: one header and one canvas strip per row, and one
 * per visible subrow (SQ29, SQ30). A strip paints itself (`paintStrip`) and
 * hit-tests the pointer, so a drag or a playing-step change repaints one
 * canvas without a React render (F34). Every pointer gesture (SQ32, SQ33)
 * previews on the canvas and commits on release as one list of ops, so one
 * gesture is one undo entry (SQ46) and runs the same code as the agent tools.
 */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowRightOutlinedIcon from "@mui/icons-material/KeyboardArrowRightOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import AlbumOutlinedIcon from "@mui/icons-material/AlbumOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import LooksOneOutlinedIcon from "@mui/icons-material/LooksOneOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import RotateRightOutlinedIcon from "@mui/icons-material/RotateRightOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import DisabledByDefaultOutlinedIcon from "@mui/icons-material/DisabledByDefaultOutlined";

import { rowLabel, STEP_PLAYBACK_MODES } from "@nodetool-ai/timeline";
import type { MidiInstrument, Step, StepEditMode, StepPattern, StepRow } from "@nodetool-ai/timeline";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";

import {
  Caption,
  ColorSwatch,
  CONTROL,
  ContextMenu,
  FlexColumn,
  FlexRow,
  ICON_SIZE,
  MenuItemPrimitive,
  SPACING,
  Text,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  TYPOGRAPHY,
  FONT_WEIGHT,
  MOTION,
  Z_INDEX
} from "../../ui_primitives";
import { RowAssignmentMenu } from "./RowAssignmentMenu";
import { assignmentChoiceId, type AssignmentChoice, type AssignmentGroup } from "./stepRowAssignments";
import { mixHex } from "../Tracks/regionColors";
import { toolCursor } from "../pianoRoll/pianoRollTools";
import {
  EDIT_MODE_ORDER,
  MODE_SPECS,
  PLAYBACK_GLYPH,
  effectiveMode,
  loopRangeOp,
  modeRange,
  modeUnit,
  parseStepKey,
  rateRampOps,
  rampOp,
  resetStepsOp,
  marqueeSelection,
  rowSelection,
  rowSupportsMode,
  setOnOp,
  setValueOp,
  setValuesOps,
  sharedDeltaValues,
  stepKey,
  stepModeValue,
  tieOp,
  tieSpans,
  valueFromFraction,
  isDeviceValue,
  type StepKey
} from "./stepSequencerModel";
import {
  CELL_GAP_PX,
  paintStrip,
  stepAtX,
  watchDevicePixelRatio,
  stepX,
  stripPalette,
  stripWidth,
  type DragPreview,
  type StripPalette
} from "./stepStripPaint";

export { stepX, stripWidth, stepAtX };

export const ROW_HEADER_WIDTH_PX = 232;
export const RULER_HEIGHT_PX = 18;

export type ValueDisplay = "editing" | "selectedRow" | "all";

/**
 * The step each row plays, outside React state (F34): the editor pushes a
 * new map per playhead change and each strip repaints only for its own row.
 */
export interface PlayingSource {
  get: (rowId: string) => number | undefined;
  set: (next: ReadonlyMap<string, number>) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPlayingSource(): PlayingSource {
  let current: ReadonlyMap<string, number> = new Map();
  const listeners = new Set<() => void>();
  return {
    get: (rowId) => current.get(rowId),
    set: (next) => {
      current = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export interface StepGridProps {
  clipId: string;
  pattern: StepPattern;
  instrument?: MidiInstrument;
  baseColor: string;
  /** Per-row colors when Show Row Colors is on (SQ29). */
  rowColor: (rowIndex: number) => string;
  scheme: "light" | "dark";
  showRowColors: boolean;
  editMode: StepEditMode;
  stepWidth: number;
  rowHeight: number;
  valueDisplay: ValueDisplay;
  selection: ReadonlySet<StepKey>;
  /** The live selection, for gestures that read it after the last render. */
  getSelection: () => ReadonlySet<StepKey>;
  onSelectionChange: (next: Set<StepKey>, anchor: StepKey | null) => void;
  /** Marquee selection from an anchor step to the pointer, across rows (F28). */
  marqueeTo?: (anchor: { rowId: string; step: number }, clientX: number, clientY: number, base: ReadonlySet<StepKey>) => Set<StepKey>;
  /** The rows from `fromRowId` to the row under `clientY`, in grid order (F10). */
  rowsSpanned?: (fromRowId: string, clientY: number) => StepRow[];
  selectedRowIds: ReadonlySet<string>;
  onSelectRow: (rowId: string, additive: boolean) => void;
  expandedRows: ReadonlySet<string>;
  onToggleExpanded: (rowId: string, all: boolean) => void;
  onRenameRow: (rowId: string) => void;
  playing: PlayingSource;
  mac: boolean;
  runOps: (ops: TimelineOp[]) => Promise<void>;
  onStepAudition?: (row: StepRow, step: number, values?: Partial<Step>) => void;
  /** Row Assignment choices for the header picker (SQ29). */
  assignmentGroups?: readonly AssignmentGroup[];
  onAssignRow?: (rowId: string, choice: AssignmentChoice) => void;
  /** Row playback; the editor applies it to every selected row (p. 749). */
  onRowPlayback?: (rowId: string, playback: StepRow["playback"]) => void;
  onMoveRow?: (rowId: string, toIndex: number) => void;
  /** Custom row colors offered in the row menu (p. 760). */
  colorChoices?: readonly string[];
}

const ROW_ICONS: Record<StepRow["assignment"]["type"], typeof MusicNoteOutlinedIcon> = {
  kit: AlbumOutlinedIcon,
  note: MusicNoteOutlinedIcon,
  melodic: PianoOutlinedIcon,
  degree: LooksOneOutlinedIcon,
  automation: ShowChartOutlinedIcon
};

const headerStyles = (theme: Theme) =>
  css({
    width: ROW_HEADER_WIDTH_PX,
    flexShrink: 0,
    position: "sticky",
    left: 0,
    zIndex: Z_INDEX.raised,
    boxSizing: "border-box",
    padding: `0 ${theme.spacing(SPACING.xs)} 0 ${theme.spacing(SPACING.sm)}`,
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    borderRight: `1px solid ${theme.vars.palette.divider}`,
    cursor: "pointer",
    "&.selected": { backgroundColor: theme.vars.palette.action.selected },
    "& .stripe": { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
    "&.dropTarget": { boxShadow: `inset 0 2px 0 ${theme.vars.palette.primary.main}` },
    // Logic's per-row buttons show on hover only, so the header reads calm at rest (p0736).
    "& .inline": {
      position: "absolute",
      right: theme.spacing(SPACING.xs),
      top: theme.spacing(SPACING.micro),
      backgroundColor: theme.vars.palette.background.paper,
      opacity: 0,
      pointerEvents: "none",
      transition: MOTION.opacity
    },
    // A full-height header shows them on its lower line, after M and S, so the name and playback stay in view.
    "& .inline.lower": { top: "auto", bottom: theme.spacing(SPACING.micro) },
    // A short row or a subrow has no lower line: the buttons cover only the name area, so the controls at the right end stay usable.
    "& .inline.contained": { right: 0, top: "50%", transform: "translateY(-50%)" },
    "&:hover .inline, &:focus-within .inline": { opacity: 1, pointerEvents: "auto" },
    "&:hover .restLabel, &:focus-within .restLabel": { visibility: "hidden" }
  });

// Cell values read as bold sans, as in p0736.
const canvasStyles = css({ display: "block", touchAction: "none", ...TYPOGRAPHY.sans.caption, fontWeight: FONT_WEIGHT.semibold });

/** Plain hex colors of the active scheme, for canvas drawing (F37). */
function schemeColors(theme: Theme, scheme: "light" | "dark") {
  const p = theme.colorSchemes?.[scheme]?.palette;
  const paper = p?.background?.paper ?? "";
  const text = p?.text?.primary ?? "";
  return {
    dark: scheme === "dark",
    paper,
    text,
    playhead: p?.secondary?.main ?? text,
    band: mixHex(paper, text, scheme === "dark" ? 0.035 : 0.03)
  };
}

interface StripProps {
  clipId: string;
  row: StepRow;
  rowName: string;
  mode: StepEditMode;
  palette: StripPalette;
  stepWidth: number;
  rowHeight: number;
  /** The row's selected steps, comma-joined, so the strip memo compares a string. */
  selectedSteps: string;
  showValues: boolean;
  isMainRow: boolean;
  mac: boolean;
  playing: PlayingSource;
  getSelection: () => ReadonlySet<StepKey>;
  onSelectionChange: (next: Set<StepKey>, anchor: StepKey | null) => void;
  /** Marquee selection from an anchor step to the pointer, across rows (F28). */
  marqueeTo?: (anchor: { rowId: string; step: number }, clientX: number, clientY: number, base: ReadonlySet<StepKey>) => Set<StepKey>;
  /** The rows from `fromRowId` to the row under `clientY`, in grid order (F10). */
  rowsSpanned?: (fromRowId: string, clientY: number) => StepRow[];
  runOps: (ops: TimelineOp[]) => Promise<void>;
  onStepAudition?: (row: StepRow, step: number, values?: Partial<Step>) => void;
}

/** Same-step value changes audition at most this often (F31). */
const AUDITION_THROTTLE_MS = 120;

/**
 * Audition for a value drag (F31, SQ37): a new step plays at once, so a drag
 * plays one note per step it crosses. A changed value on the same step plays
 * at most once per AUDITION_THROTTLE_MS, and the last one always plays.
 */
export function dragAudition(
  row: StepRow,
  mode: StepEditMode,
  play: ((row: StepRow, step: number, values?: Partial<Step>) => void) | undefined
): DragAudition {
  const spec = MODE_SPECS[mode];
  const field = spec.kind === "number" ? spec.field : null;
  let lastStep = -1;
  let lastValue = NaN;
  let lastAt = -Infinity;
  let trailing: ReturnType<typeof setTimeout> | null = null;
  const sound = (step: number, value: number) => {
    lastStep = step;
    lastValue = value;
    lastAt = performance.now();
    play?.(row, step, field ? ({ [field]: value } as Partial<Step>) : undefined);
  };
  const clearTrailing = () => {
    if (trailing !== null) {
      clearTimeout(trailing);
      trailing = null;
    }
  };
  const hear = (step: number, value: number) => {
    if (!play) return;
    clearTrailing();
    if (step === lastStep && value === lastValue) return;
    const wait = lastAt + AUDITION_THROTTLE_MS - performance.now();
    if (step === lastStep && wait > 0) {
      // The last suppressed value plays when the window ends, so the final
      // value is always heard (F62).
      trailing = setTimeout(() => {
        trailing = null;
        sound(step, value);
      }, wait);
      return;
    }
    sound(step, value);
  };
  return Object.assign(hear, { cancel: clearTrailing });
}

/** Auditions a dragged value; `cancel` drops a pending trailing audition (F64). */
export type DragAudition = ((step: number, value: number) => void) & { cancel: () => void };

interface Gesture {
  move: (ev: PointerEvent) => void;
  commit: () => TimelineOp[];
  /** Runs when the gesture is cancelled or the strip unmounts mid-gesture. */
  cancel?: () => void;
}

const StepStrip: React.FC<StripProps> = memo((props) => {
  const { row, mode, stepWidth, rowHeight, selectedSteps, showValues, playing, isMainRow } = props;
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<DragPreview | null>(null);
  // The gesture that owns the preview, so an earlier gesture that settles
  // late never clears a newer one (F50).
  const previewOwnerRef = useRef(0);
  const gestureSeqRef = useRef(0);
  const playRef = useRef<number | undefined>(playing.get(row.id));
  const fontRef = useRef<string>("");
  const cleanupRef = useRef<(() => void) | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const width = stripWidth(row.lengthSteps, stepWidth);
  const baseCursor = isMainRow && mode === "onOff" ? "pointer" : "ns-resize";

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = propsRef.current;
    const w = stripWidth(p.row.lengthSteps, p.stepWidth);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(p.rowHeight * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(p.rowHeight * dpr);
    }
    if (!fontRef.current) {
      const cs = getComputedStyle(canvas);
      fontRef.current = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintStrip(ctx, {
      row: p.row,
      mode: p.mode,
      stepWidth: p.stepWidth,
      height: p.rowHeight,
      palette: p.palette,
      selected: new Set(p.selectedSteps ? p.selectedSteps.split(",").map(Number) : []),
      showValues: p.showValues,
      playStep: playRef.current,
      preview: previewRef.current,
      font: fontRef.current
    });
  }, []);

  // A new row is the committed result of the last gesture: drop its preview,
  // unless a gesture is still held (F50).
  useLayoutEffect(() => {
    if (!cleanupRef.current) previewRef.current = null;
  }, [row]);
  useLayoutEffect(paint);
  useEffect(() => watchDevicePixelRatio(paint), [paint]);
  useEffect(
    () =>
      playing.subscribe(() => {
        const s = playing.get(propsRef.current.row.id);
        if (s !== playRef.current) {
          playRef.current = s;
          paint();
        }
      }),
    [playing, paint]
  );
  useEffect(() => () => cleanupRef.current?.(), []);

  const setPreview = (p: DragPreview | null) => {
    previewRef.current = p;
    previewOwnerRef.current = gestureSeqRef.current;
    paint();
  };

  const localStep = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return stepAtX(clientX - (rect?.left ?? 0), row.lengthSteps, stepWidth);
  };
  const localFraction = (clientY: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const top = (rect?.top ?? 0) + CELL_GAP_PX;
    return 1 - (clientY - top) / (rowHeight - CELL_GAP_PX * 2);
  };

  /** Follow the pointer until release, then commit once (one undo entry). */
  // One pointer owns the strip at a time (F53): its id filters every event.
  const pointerRef = useRef<number | null>(null);
  const track = (target: HTMLElement, g: Gesture) => {
    const id = gestureSeqRef.current;
    const pointerId = pointerRef.current;
    const mine = (ev: PointerEvent) => pointerId === null || ev.pointerId === pointerId;
    const move = (ev: PointerEvent) => {
      if (mine(ev)) g.move(ev);
    };
    const up = (ev: PointerEvent) => {
      if (!mine(ev)) return;
      cleanup();
      const ops = g.commit();
      if (ops.length === 0) {
        setPreview(null);
        return;
      }
      // Keep the preview until the committed row arrives, so nothing flickers.
      void propsRef.current.runOps(ops).finally(() => {
        if (previewOwnerRef.current === id && !cleanupRef.current && previewRef.current) setPreview(null);
      });
    };
    const cleanup = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancelEv);
      cleanupRef.current = null;
      pointerRef.current = null;
    };
    const cancel = () => {
      cleanup();
      g.cancel?.();
      setPreview(null);
    };
    const cancelEv = (ev: PointerEvent) => {
      if (mine(ev)) cancel();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancelEv);
    cleanupRef.current = cancel;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // A second pointer while a gesture is held is ignored (F53).
    if (cleanupRef.current) return;
    pointerRef.current = e.pointerId ?? null;
    gestureSeqRef.current += 1;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { clipId, mac, onSelectionChange, onStepAudition } = propsRef.current;
    const spec = MODE_SPECS[mode];
    const cmd = mac ? e.metaKey : e.ctrlKey;
    const opt = e.altKey;
    const shift = e.shiftKey;
    const start = localStep(e.clientX);
    const startY = e.clientY;
    const startFraction = localFraction(e.clientY);
    const target = e.currentTarget;
    const selection = propsRef.current.getSelection();
    const selected = rowSelection(selection, row.id);
    const isBool = spec.kind === "bool";
    const isValue = spec.kind === "number" || spec.kind === "rate";
    const spans = tieSpans(row);
    const spanAt = (s: number) => spans.find((sp) => s >= sp.start && s <= sp.end);
    const tied = row.steps[start]?.tie === true;
    let last = start;
    let moved = false;

    // Shift-click selects (SQ34), any mode except Loop. A tied cell selects its first step.
    if (shift && !cmd && !opt && mode !== "loop") {
      const cell = isValue ? start : (spanAt(start)?.start ?? start);
      const next = new Set(selection);
      const k = stepKey(row.id, cell);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      onSelectionChange(next, k);
      // Dragging on grows a marquee across steps and rows (F28, p. 749).
      const { marqueeTo } = propsRef.current;
      if (!marqueeTo) return;
      return track(target, {
        move: (ev) => {
          if (!moved && localStep(ev.clientX) === start && Math.abs(ev.clientY - startY) < 4) return;
          moved = true;
          onSelectionChange(marqueeTo({ rowId: row.id, step: cell }, ev.clientX, ev.clientY, selection), k);
        },
        commit: () => []
      });
    }

    if (opt && cmd) {
      // Option-Command-click on a tied step unties it (SQ33, p. 1197).
      if (!isValue) {
        return track(target, {
          move: () => undefined,
          commit: () => (tied ? [tieOp(clipId, row.id, start, start, false)] : [])
        });
      }
      // Ramp (SQ33): Command-Option-drag; with Shift the steps stay off.
      const from = valueFromFraction(row, mode, startFraction);
      let toVal = from;
      const device = isDeviceValue(row, mode);
      const update = () => {
        const lo = Math.min(start, last);
        const hi = Math.max(start, last);
        const values = new Map<number, number>();
        for (let s = lo; s <= hi; s++) {
          const f = hi === lo ? 0 : (s - start) / (last - start);
          const v = from + (toVal - from) * f;
          values.set(s, device ? v : Math.round(v));
        }
        setPreview({ rowId: row.id, mode, values, readout: last });
        const v = values.get(last);
        if (v !== undefined) hear(last, v);
      };
      const hear = dragAudition(row, mode, onStepAudition);
      hear(start, from);
      return track(target, {
        cancel: hear.cancel,
        move: (ev) => {
          last = localStep(ev.clientX);
          toVal = valueFromFraction(row, mode, localFraction(ev.clientY));
          moved = true;
          update();
        },
        commit: () => {
          if (!moved && tied) return [tieOp(clipId, row.id, start, start, false)];
          if (!moved) return [];
          return spec.kind === "rate"
            ? rateRampOps(clipId, row, start, last, from, toVal, shift)
            : [rampOp(clipId, row.id, start, last, mode, from, toVal, shift)];
        }
      });
    }
    if (opt) {
      // Option-click resets the step, or the selection it is part of (D75, p. 750).
      const passed = new Set<number>(selected.length > 1 && selected.includes(start) ? selected : [start]);
      const show = () => setPreview({ rowId: row.id, mode: "onOff", values: new Map([...passed].map((s) => [s, 0])) });
      show();
      return track(target, {
        move: (ev) => {
          passed.add(localStep(ev.clientX));
          show();
        },
        commit: () => [resetStepsOp(clipId, row.id, [...passed])]
      });
    }
    if (cmd && mode !== "tie" && mode !== "stepRate" && mode !== "loop") {
      // Command-drag ties (D74) on rows that tie. A Command-click toggles (p. 1197).
      const canTie = rowSupportsMode(row, "tie");
      return track(target, {
        move: (ev) => {
          last = localStep(ev.clientX);
          moved = moved || last !== start;
          if (moved && canTie) setPreview({ rowId: row.id, mode, values: new Map(), tie: { from: start, to: last, tie: true } });
        },
        commit: () =>
          moved
            ? canTie
              ? [tieOp(clipId, row.id, start, last, true)]
              : []
            : [setOnOp(clipId, row.id, [start], row.steps[start]?.on !== true)]
      });
    }
    if (mode === "loop") {
      // The nearer edge follows the pointer and the other edge stays (p. 734).
      // A vertical drag sets that edge on every row it crosses (p. 734, F10).
      const lo0 = row.loopStart;
      const hi0 = row.loopEnd - 1;
      const edge: "start" | "end" = start < lo0 || (start <= hi0 && start - lo0 < hi0 - start) ? "start" : "end";
      const { rowsSpanned } = propsRef.current;
      let rows: StepRow[] = [row];
      const rangeFor = (r: StepRow): [number, number] => {
        const s = Math.min(last, r.lengthSteps - 1);
        return edge === "start" ? [Math.min(s, r.loopEnd - 1), r.loopEnd - 1] : [r.loopStart, Math.max(s, r.loopStart)];
      };
      const show = () => {
        const [lo, hi] = rangeFor(row);
        setPreview({ rowId: row.id, mode, values: new Map(), loop: { from: lo, to: hi } });
      };
      show();
      return track(target, {
        move: (ev) => {
          last = localStep(ev.clientX);
          if (rowsSpanned) rows = rowsSpanned(row.id, ev.clientY);
          show();
        },
        commit: () =>
          rows
            .map((r) => [r, rangeFor(r)] as const)
            .filter(([r, [lo, hi]]) => r.id === row.id || lo !== r.loopStart || hi !== r.loopEnd - 1)
            .map(([r, [lo, hi]]) => loopRangeOp(clipId, r.id, lo, hi))
      });
    }
    if (mode === "tie") {
      const span = spanAt(start);
      return track(target, {
        move: (ev) => {
          last = localStep(ev.clientX);
          moved = moved || last !== start;
          if (moved) {
            setPreview({
              rowId: row.id,
              mode,
              values: new Map(),
              tie: last > start ? { from: start, to: last, tie: true } : { from: last + 1, to: start, tie: false }
            });
          }
        },
        commit: () => {
          // Drag right ties the following steps; drag left unties back to the step it lands on.
          if (moved) return last > start ? [tieOp(clipId, row.id, start, last, true)] : [tieOp(clipId, row.id, last + 1, start, false)];
          // A click inside a tied cell shortens the tie to that step (p. 733).
          if (span && span.end > span.start) {
            if (start < span.end) return [tieOp(clipId, row.id, start + 1, span.end, false)];
            return [tieOp(clipId, row.id, start, start, false)];
          }
          // Step 1 has no step before it to tie to.
          if (start === 0) return [];
          return [setValueOp(clipId, row, [start], "tie", row.steps[start]?.tie !== true)];
        }
      });
    }
    if (isBool) {
      // On/Off and Skip: paint the first step's new state (SQ32).
      const next = stepModeValue(row, start, mode) ? 0 : 1;
      const passed = new Set<number>([start]);
      const show = () => setPreview({ rowId: row.id, mode, values: new Map([...passed].map((s) => [s, next])) });
      show();
      if (mode === "onOff" && next === 1) onStepAudition?.(row, start);
      return track(target, {
        move: (ev) => {
          const s = localStep(ev.clientX);
          if (passed.has(s)) return;
          passed.add(s);
          if (mode === "onOff" && next === 1) onStepAudition?.(row, s);
          show();
        },
        commit: () =>
          mode === "onOff" ? [setOnOp(clipId, row.id, [...passed], next === 1)] : [setValueOp(clipId, row, [...passed], mode, next === 1)]
      });
    }
    // Value modes: a vertical drag sets the pressed step only (SQ32).
    if (selected.length > 1 && selected.includes(start)) {
      // Several steps selected: one shared delta, limited to the range (p. 736).
      const span = rowHeight - CELL_GAP_PX * 2;
      const { min, max } = modeRange(row, mode);
      let values = sharedDeltaValues(row, selected, mode, 0);
      setPreview({ rowId: row.id, mode, values, readout: start });
      const hear = dragAudition(row, mode, onStepAudition);
      return track(target, {
        cancel: hear.cancel,
        move: (ev) => {
          values = sharedDeltaValues(row, selected, mode, ((startY - ev.clientY) / span) * (max - min));
          setPreview({ rowId: row.id, mode, values, readout: start });
          const v = values.get(start);
          if (v !== undefined) hear(start, v);
        },
        commit: () => setValuesOps(clipId, row, mode, values)
      });
    }
    const values = new Map<number, number>([[start, valueFromFraction(row, mode, startFraction)]]);
    setPreview({ rowId: row.id, mode, values: new Map(values), readout: start });
    const hear = dragAudition(row, mode, onStepAudition);
    hear(start, values.get(start)!);
    return track(target, {
      cancel: hear.cancel,
      move: (ev) => {
        values.set(start, valueFromFraction(row, mode, localFraction(ev.clientY)));
        setPreview({ rowId: row.id, mode, values: new Map(values), readout: start });
        hear(start, values.get(start)!);
      },
      commit: () => setValuesOps(clipId, row, mode, values)
    });
  };

  const onSteps = row.steps
    .slice(0, row.lengthSteps)
    .flatMap((s, i) => (s?.on ? [i + 1] : []))
    .join(", ");
  const modeName = t(`stepSequencer.mode.${mode}`);
  return (
    <canvas
      ref={canvasRef}
      data-testid={`strip-${row.id}-${mode}`}
      data-values={showValues ? "true" : "false"}
      data-selected={selectedSteps}
      data-row-id={row.id}
      aria-label={
        onSteps
          ? t("stepSequencer.aria.strip", { row: props.rowName, mode: modeName, steps: onSteps })
          : t("stepSequencer.aria.stripEmpty", { row: props.rowName, mode: modeName })
      }
      role="img"
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        // Option shows the Eraser: an Option-click resets the step (p. 750, F17).
        const c = e.altKey ? toolCursor("eraser") : baseCursor;
        if (e.currentTarget.style.cursor !== c) e.currentTarget.style.cursor = c;
      }}
      css={canvasStyles}
      style={{ width, height: rowHeight, cursor: baseCursor }}
    />
  );
});
StepStrip.displayName = "StepStrip";

/** A small select that opens a menu (row playback, subrow mode). */
const MenuSelect: React.FC<{
  label: string;
  tooltip: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onPick: (value: string) => void;
  testId?: string;
}> = ({ label, tooltip, value, options, onPick, testId }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <ToolbarIconButton
        tooltip={tooltip}
        data-testid={testId}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        <Caption component="span">{label}</Caption>
      </ToolbarIconButton>
      <ContextMenu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {options.map((o) => (
          <MenuItemPrimitive
            key={o.value}
            label={o.label}
            checkable="radio"
            checked={o.value === value}
            onClick={() => {
              setAnchor(null);
              onPick(o.value);
            }}
          />
        ))}
      </ContextMenu>
    </>
  );
};

interface MenuAt {
  anchor: HTMLElement | null;
  position: { x: number; y: number } | null;
}

/** Rotate, decrement/increment, randomize and clear for a row or subrow (SQ29), as menu items. */
function rowActions(
  t: (k: string) => string,
  clipId: string,
  row: StepRow,
  mode: StepEditMode,
  subrow: boolean
): Array<{ id: string; label: string; ops: TimelineOp[] }> {
  // A main-row rotate moves whole steps; a subrow rotate moves that mode only (p. 748).
  const rotateMode = subrow ? { mode } : {};
  const unit = modeUnit(row, mode);
  return [
    { id: "rotateLeft", label: t("stepSequencer.row.rotateLeft"), ops: [{ op: "rotate_pattern", clipId, row: row.id, by: -1, ...rotateMode }] },
    { id: "rotateRight", label: t("stepSequencer.row.rotateRight"), ops: [{ op: "rotate_pattern", clipId, row: row.id, by: 1, ...rotateMode }] },
    { id: "decrement", label: t("stepSequencer.row.decrement"), ops: [{ op: "nudge_pattern_values", clipId, row: row.id, mode, delta: -unit }] },
    { id: "increment", label: t("stepSequencer.row.increment"), ops: [{ op: "nudge_pattern_values", clipId, row: row.id, mode, delta: unit }] },
    {
      id: "randomize",
      label: t("stepSequencer.row.randomize"),
      ops: [{ op: "randomize_pattern", clipId, rows: [row.id], mode, seed: Math.floor(Math.random() * 0xffffffff) >>> 0 }]
    },
    {
      id: "clear",
      label: t("stepSequencer.row.clear"),
      ops: [{ op: "clear_pattern", clipId, scope: "row", row: row.id, mode: mode === "onOff" ? undefined : mode }]
    }
  ];
}

interface RowBlockProps {
  clipId: string;
  row: StepRow;
  rowName: string;
  color: string;
  palette: StripPalette;
  subPalette: StripPalette;
  editMode: StepEditMode;
  expanded: boolean;
  selected: boolean;
  showValues: boolean;
  selectedSteps: string;
  stepWidth: number;
  rowHeight: number;
  mac: boolean;
  playing: PlayingSource;
  getSelection: () => ReadonlySet<StepKey>;
  onSelectionChange: (next: Set<StepKey>, anchor: StepKey | null) => void;
  /** Marquee selection from an anchor step to the pointer, across rows (F28). */
  marqueeTo?: (anchor: { rowId: string; step: number }, clientX: number, clientY: number, base: ReadonlySet<StepKey>) => Set<StepKey>;
  /** The rows from `fromRowId` to the row under `clientY`, in grid order (F10). */
  rowsSpanned?: (fromRowId: string, clientY: number) => StepRow[];
  onSelectRow: (rowId: string, additive: boolean) => void;
  onToggleExpanded: (rowId: string, all: boolean) => void;
  onRenameRow: (rowId: string) => void;
  runOps: (ops: TimelineOp[]) => Promise<void>;
  onStepAudition?: (row: StepRow, step: number, values?: Partial<Step>) => void;
  index: number;
  assignmentGroups?: readonly AssignmentGroup[];
  onAssignRow?: (rowId: string, choice: AssignmentChoice) => void;
  onRowPlayback?: (rowId: string, playback: StepRow["playback"]) => void;
  onMoveRow?: (rowId: string, toIndex: number) => void;
  colorChoices?: readonly string[];
}

/** The row id a header drag carries; module state, since dataTransfer reads are blocked on dragover. */
let draggedRowId: string | null = null;

const RowBlock: React.FC<RowBlockProps> = memo((props) => {
  const { clipId, row, rowName, color, editMode, expanded, selected, rowHeight, runOps } = props;
  const { t } = useTranslation();
  const theme = useTheme();
  const [menu, setMenu] = useState<(MenuAt & { mode: StepEditMode; subrow: boolean }) | null>(null);
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const mainMode = rowSupportsMode(row, editMode) ? effectiveMode(row, editMode) : "onOff";
  const subModes = expanded ? row.subrows.filter((m) => rowSupportsMode(row, m)) : [];
  const Icon = ROW_ICONS[row.assignment.type];
  const compact = rowHeight < 56;
  const freeModes = EDIT_MODE_ORDER.filter((m) => m !== "onOff" && rowSupportsMode(row, m) && !row.subrows.includes(m));

  const openMenu = (mode: StepEditMode, subrow: boolean) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu(
      e.type === "contextmenu"
        ? { anchor: null, position: { x: e.clientX, y: e.clientY }, mode, subrow }
        : { anchor: e.currentTarget, position: null, mode, subrow }
    );
  };
  const run = (ops: TimelineOp[]) => {
    setMenu(null);
    void runOps(ops);
  };

  const strip = (mode: StepEditMode, main: boolean) => (
    <StepStrip
      clipId={clipId}
      row={row}
      rowName={rowName}
      mode={mode}
      palette={main ? props.palette : props.subPalette}
      stepWidth={props.stepWidth}
      rowHeight={rowHeight}
      selectedSteps={props.selectedSteps}
      showValues={props.showValues}
      isMainRow={main}
      mac={props.mac}
      playing={props.playing}
      getSelection={props.getSelection}
      onSelectionChange={props.onSelectionChange}
      marqueeTo={props.marqueeTo}
      rowsSpanned={props.rowsSpanned}
      runOps={runOps}
      onStepAudition={props.onStepAudition}
    />
  );

  const msToggle = (
    <ToggleGroup
      segmented
      sx={{ height: CONTROL.height.xs, "& .MuiToggleButtonGroup-grouped": { px: 1, border: "none" } }}
      value={[...(row.mute ? ["mute"] : []), ...(row.solo ? ["solo"] : [])]}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <ToggleOption
        value="mute"
        aria-label={t("stepSequencer.row.mute")}
        data-testid={`mute-${row.id}`}
        onClick={() => void runOps([{ op: "set_pattern_row", clipId, row: row.id, mute: !row.mute }])}
      >
        M
      </ToggleOption>
      <ToggleOption
        value="solo"
        aria-label={t("stepSequencer.row.solo")}
        data-testid={`solo-${row.id}`}
        onClick={() => void runOps([{ op: "set_pattern_row", clipId, row: row.id, solo: !row.solo }])}
      >
        S
      </ToggleOption>
    </ToggleGroup>
  );

  const playbackSelect = (
    <MenuSelect
      label={PLAYBACK_GLYPH[row.playback]}
      tooltip={t("stepSequencer.row.playback")}
      value={row.playback}
      options={STEP_PLAYBACK_MODES.map((m) => ({ value: m, label: t(`stepSequencer.playback.${m}`) }))}
      testId={`row-playback-${row.id}`}
      onPick={(v) =>
        props.onRowPlayback
          ? props.onRowPlayback(row.id, v as StepRow["playback"])
          : void runOps([{ op: "set_pattern_row", clipId, row: row.id, playback: v as StepRow["playback"] }])
      }
    />
  );

  const moreButton = (mode: StepEditMode, subrow: boolean) => (
    <ToolbarIconButton
      tooltip={t(subrow ? "stepSequencer.row.subrowMore" : "stepSequencer.row.more")}
      aria-haspopup="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={openMenu(mode, subrow)}
    >
      <MoreHorizOutlinedIcon fontSize="small" />
    </ToolbarIconButton>
  );

  const INLINE_ICONS: Record<string, typeof RotateLeftOutlinedIcon> = {
    rotateLeft: RotateLeftOutlinedIcon,
    rotateRight: RotateRightOutlinedIcon,
    decrement: KeyboardArrowDownOutlinedIcon,
    increment: KeyboardArrowUpOutlinedIcon,
    randomize: CasinoOutlinedIcon,
    clear: DisabledByDefaultOutlinedIcon
  };
  const inlineButtons = (mode: StepEditMode, subrow: boolean, testId: string, place: "lower" | "contained") => (
    <FlexRow className={`inline ${place}`} gap={SPACING.none} data-testid={testId} onPointerDown={(e) => e.stopPropagation()}>
      {rowActions(t, clipId, row, mode, subrow).map((a) => {
        const Glyph = INLINE_ICONS[a.id]!;
        return (
          <ToolbarIconButton
            key={a.id}
            tooltip={a.label}
            aria-label={a.label}
            sx={{ minWidth: CONTROL.height.xs, width: CONTROL.height.xs, height: CONTROL.height.xs }}
            onClick={(e) => {
              e.stopPropagation();
              void runOps(a.ops);
            }}
          >
            <Glyph sx={{ fontSize: ICON_SIZE.xs }} />
          </ToolbarIconButton>
        );
      })}
    </FlexRow>
  );

  return (
    <FlexColumn data-testid={`row-${row.id}`}>
      <FlexRow>
        <FlexColumn
          justify="center"
          css={headerStyles(theme)}
          className={[selected ? "selected" : "", dropTarget ? "dropTarget" : ""].join(" ")}
          style={{ height: rowHeight }}
          draggable={props.onMoveRow !== undefined}
          onDragStart={(e: React.DragEvent) => {
            draggedRowId = row.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", row.id);
          }}
          onDragOver={(e: React.DragEvent) => {
            if (!draggedRowId || draggedRowId === row.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget(true);
          }}
          onDragLeave={() => setDropTarget(false)}
          onDragEnd={() => {
            draggedRowId = null;
          }}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setDropTarget(false);
            const from = draggedRowId;
            draggedRowId = null;
            if (from && from !== row.id) props.onMoveRow?.(from, props.index);
          }}
          onClick={(e) => props.onSelectRow(row.id, e.shiftKey)}
          onContextMenu={openMenu(mainMode, false)}
          data-testid={`row-header-${row.id}`}
        >
          <span className="stripe" style={{ backgroundColor: color }} />
          <FlexRow align="center" gap={SPACING.xs}>
            <ToolbarIconButton
              tooltip={expanded ? t("stepSequencer.row.hideSubrows") : t("stepSequencer.row.showSubrows")}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleExpanded(row.id, e.altKey);
              }}
            >
              {expanded ? <KeyboardArrowDownOutlinedIcon fontSize="small" /> : <KeyboardArrowRightOutlinedIcon fontSize="small" />}
            </ToolbarIconButton>
            <Icon sx={{ fontSize: ICON_SIZE.xs, color }} />
            <FlexRow align="center" sx={{ flex: 1, minWidth: 0, position: "relative" }}>
            <FlexRow
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-label={`${t("stepSequencer.row.assign")}: ${rowName}`}
              data-testid={`row-assign-${row.id}`}
              align="center"
              sx={{ flex: 1, minWidth: 0, cursor: "pointer", "&:focus-visible": { outline: (th) => `2px solid ${th.vars.palette.primary.main}` } }}
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
              onClick={(e: React.MouseEvent<HTMLElement>) => {
                e.stopPropagation();
                if (props.assignmentGroups) setAssignAnchor(e.currentTarget);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                if (props.assignmentGroups) setAssignAnchor(e.currentTarget);
              }}
            >
              <Text size="small" truncate sx={{ minWidth: 0 }}>
                {rowName}
              </Text>
              <KeyboardArrowDownOutlinedIcon className="restLabel" sx={{ fontSize: ICON_SIZE.xs, color: "text.secondary" }} />
            </FlexRow>
              {compact && inlineButtons(mainMode, false, `row-inline-${row.id}`, "contained")}
            </FlexRow>
            {!compact && playbackSelect}
            {compact ? msToggle : <Caption color="muted">{t(`stepSequencer.mode.${mainMode}`)}</Caption>}
            {compact && moreButton(mainMode, false)}
          </FlexRow>
          {!compact && inlineButtons(mainMode, false, `row-inline-${row.id}`, "lower")}
          {!compact && (
            <FlexRow align="center" gap={SPACING.xs} sx={{ pl: SPACING.xl }}>
              {msToggle}
              <FlexRow sx={{ flex: 1 }} />
              {moreButton(mainMode, false)}
            </FlexRow>
          )}
        </FlexColumn>
        {strip(mainMode, true)}
      </FlexRow>
      {subModes.map((mode) => (
        <FlexRow key={mode}>
          <FlexRow
            align="center"
            justify="flex-end"
            gap={SPACING.xs}
            css={headerStyles(theme)}
            style={{ height: rowHeight, cursor: "default" }}
            onContextMenu={openMenu(mode, true)}
            data-testid={`subrow-header-${row.id}-${mode}`}
          >
            <span className="stripe" style={{ backgroundColor: props.subPalette.on }} />
            <FlexRow align="center" sx={{ flex: 1, minWidth: 0, alignSelf: "stretch", position: "relative" }}>
              {inlineButtons(mode, true, `row-inline-${row.id}-${mode}`, "contained")}
            </FlexRow>
            <MenuSelect
              label={t(`stepSequencer.mode.${mode}`)}
              tooltip={t("stepSequencer.row.subrowMode")}
              value={mode}
              options={[mode, ...freeModes].map((m) => ({ value: m, label: t(`stepSequencer.mode.${m}`) }))}
              onPick={(v) =>
                void runOps([
                  { op: "set_pattern_row", clipId, row: row.id, subrows: row.subrows.map((m) => (m === mode ? (v as StepEditMode) : m)) }
                ])
              }
            />
            {moreButton(mode, true)}
          </FlexRow>
          {strip(mode, false)}
        </FlexRow>
      ))}
      <ContextMenu
        open={menu !== null}
        anchorEl={menu?.anchor ?? null}
        position={menu?.position ?? null}
        onClose={() => setMenu(null)}
      >
        {menu &&
          [
            ...rowActions(t, clipId, row, menu.mode, menu.subrow).map((a) => (
              <MenuItemPrimitive key={a.id} label={a.label} onClick={() => run(a.ops)} />
            )),
            <MenuItemPrimitive
              key="addSubrow"
              label={t("stepSequencer.row.addSubrow")}
              dividerBefore
              disabled={freeModes.length === 0}
              onClick={() => {
                run([{ op: "set_pattern_row", clipId, row: row.id, subrows: [...row.subrows, freeModes[0]!], subrowsExpanded: true }]);
                if (!expanded) props.onToggleExpanded(row.id, false);
              }}
            />,
            menu.subrow ? (
              <MenuItemPrimitive
                key="deleteSubrow"
                label={t("stepSequencer.row.deleteSubrow")}
                onClick={() => run([{ op: "set_pattern_row", clipId, row: row.id, subrows: row.subrows.filter((m) => m !== menu.mode) }])}
              />
            ) : (
              <MenuItemPrimitive
                key="rename"
                label={t("stepSequencer.row.renameTitle")}
                onClick={() => {
                  setMenu(null);
                  props.onRenameRow(row.id);
                }}
              />
            ),
            !menu.subrow && props.colorChoices && (
              <FlexRow key="colors" gap={SPACING.xs} sx={{ px: SPACING.md, py: SPACING.xs }} role="group" aria-label={t("stepSequencer.row.color")}>
                {props.colorChoices.map((c, i) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    size={CONTROL.height.xs - 8}
                    shape="circle"
                    selected={row.color === c}
                    tooltip={t("stepSequencer.row.colorSwatch", { n: i + 1 })}
                    data-testid={`row-color-swatch-${i}`}
                    onClick={() => run([{ op: "set_pattern_row", clipId, row: row.id, color: c }])}
                  />
                ))}
              </FlexRow>
            ),
            !menu.subrow && props.colorChoices && (
              <MenuItemPrimitive
                key="defaultColor"
                label={t("stepSequencer.row.colorDefault")}
                disabled={row.color === undefined}
                onClick={() => run([{ op: "set_pattern_row", clipId, row: row.id, color: null }])}
              />
            ),
            !menu.subrow && (
              <MenuItemPrimitive
                key="delete"
                label={t("stepSequencer.row.delete")}
                color="error"
                onClick={() => run([{ op: "remove_pattern_rows", clipId, rows: [row.id] }])}
              />
            )
          ].filter(Boolean)}
      </ContextMenu>
      {props.assignmentGroups && (
        <RowAssignmentMenu
          anchorEl={assignAnchor}
          groups={props.assignmentGroups}
          currentId={assignmentChoiceId(row.assignment)}
          onClose={() => setAssignAnchor(null)}
          onPick={(choice) => props.onAssignRow?.(row.id, choice)}
        />
      )}
    </FlexColumn>
  );
});
RowBlock.displayName = "RowBlock";

/** Step numbers above the grid, beat starts emphasized (p. 724). */
const StepRuler: React.FC<{ steps: number; stepWidth: number; scheme: "light" | "dark" }> = memo(({ steps, stepWidth, scheme }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const width = stripWidth(steps, stepWidth);
  const [dprTick, setDprTick] = useState(0);
  useEffect(() => watchDevicePixelRatio(() => setDprTick((n) => n + 1)), []);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(RULER_HEIGHT_PX * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(canvas);
    ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
    ctx.clearRect(0, 0, width, RULER_HEIGHT_PX);
    const c = schemeColors(theme, scheme);
    const muted = mixHex(c.text, c.paper, 0.55);
    for (let s = 0; s < steps; s++) {
      const beat = s % 4 === 0;
      if (!beat && stepWidth < 28) continue;
      ctx.fillStyle = beat ? c.text : muted;
      ctx.fillText(String(s + 1), stepX(s, stepWidth) + 4, RULER_HEIGHT_PX - 5);
    }
  }, [steps, stepWidth, width, theme, scheme, dprTick]);
  return <canvas ref={ref} aria-label={t("stepSequencer.toolbar.stepRuler")} role="img" css={canvasStyles} style={{ width, height: RULER_HEIGHT_PX }} />;
});
StepRuler.displayName = "StepRuler";

export const StepSequencerGrid: React.FC<StepGridProps> = memo((props) => {
  const { pattern, instrument, baseColor, rowColor, scheme, showRowColors, editMode, valueDisplay, selection, selectedRowIds } = props;
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = useMemo(() => schemeColors(theme, scheme), [theme, scheme]);

  // Rows whose values show under "Always for Selected Row" (SQ36, D100).
  const focusRows = useMemo(() => {
    const out = new Set(selectedRowIds);
    for (const k of selection) out.add(parseStepKey(k).rowId);
    return out;
  }, [selectedRowIds, selection]);

  const selectedByRow = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of pattern.rows) out.set(r.id, rowSelection(selection, r.id).join(","));
    return out;
  }, [pattern.rows, selection]);

  const palettes = useMemo(
    () =>
      pattern.rows.map((row, i) => {
        const color = !showRowColors ? baseColor : (row.color ?? rowColor(i));
        const main = stripPalette(color, colors);
        return { color: main.on, main, sub: stripPalette(mixHex(color, colors.paper, 0.1), colors) };
      }),
    [pattern.rows, showRowColors, baseColor, rowColor, colors]
  );
  const maxSteps = Math.max(pattern.lengthSteps, ...pattern.rows.map((r) => r.lengthSteps));

  const gridRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const stepWidthRef = useRef(props.stepWidth);
  stepWidthRef.current = props.stepWidth;
  const marqueeTo = useCallback(
    (anchor: { rowId: string; step: number }, clientX: number, clientY: number, base: ReadonlySet<StepKey>) => {
      const strips = Array.from(gridRef.current?.querySelectorAll<HTMLCanvasElement>("canvas[data-row-id]") ?? []);
      let hit: { rowId: string; left: number } | null = null;
      let best = Infinity;
      for (const el of strips) {
        const r = el.getBoundingClientRect();
        const d = clientY < r.top ? r.top - clientY : clientY >= r.bottom ? clientY - r.bottom + 1 : 0;
        if (d < best) {
          best = d;
          hit = { rowId: el.dataset.rowId!, left: r.left };
        }
      }
      const p = patternRef.current;
      if (!hit) return new Set(base);
      const steps = p.rows.find((r) => r.id === hit!.rowId)?.lengthSteps ?? p.lengthSteps;
      return marqueeSelection(p, anchor, { rowId: hit.rowId, step: stepAtX(clientX - hit.left, steps, stepWidthRef.current) }, base);
    },
    []
  );

  const rowsSpanned = useCallback((fromRowId: string, clientY: number): StepRow[] => {
    const strips = Array.from(gridRef.current?.querySelectorAll<HTMLCanvasElement>("canvas[data-row-id]") ?? []);
    let hitId: string | null = null;
    let best = Infinity;
    for (const el of strips) {
      const r = el.getBoundingClientRect();
      const d = clientY < r.top ? r.top - clientY : clientY >= r.bottom ? clientY - r.bottom + 1 : 0;
      if (d < best) {
        best = d;
        hitId = el.dataset.rowId ?? null;
      }
    }
    const rows = patternRef.current.rows;
    const a = rows.findIndex((r) => r.id === fromRowId);
    const b = hitId ? rows.findIndex((r) => r.id === hitId) : a;
    if (a < 0) return [];
    return rows.slice(Math.min(a, b < 0 ? a : b), Math.max(a, b) + 1);
  }, []);

  return (
    <div ref={gridRef} role="group" aria-label={t("stepSequencer.aria.grid")} data-testid="step-sequencer-grid">
      <FlexRow>
        <FlexRow css={headerStyles(theme)} style={{ height: RULER_HEIGHT_PX, cursor: "default" }} />
        <StepRuler steps={maxSteps} stepWidth={props.stepWidth} scheme={scheme} />
      </FlexRow>
      {pattern.rows.map((row, i) => (
        <RowBlock
          key={row.id}
          clipId={props.clipId}
          row={row}
          rowName={rowLabel(row, instrument)}
          color={palettes[i]!.color}
          palette={palettes[i]!.main}
          subPalette={palettes[i]!.sub}
          editMode={editMode}
          expanded={props.expandedRows.has(row.id)}
          selected={selectedRowIds.has(row.id)}
          showValues={valueDisplay === "all" || (valueDisplay === "selectedRow" && focusRows.has(row.id))}
          selectedSteps={selectedByRow.get(row.id) ?? ""}
          stepWidth={props.stepWidth}
          rowHeight={props.rowHeight}
          mac={props.mac}
          playing={props.playing}
          getSelection={props.getSelection}
          onSelectionChange={props.onSelectionChange}
          marqueeTo={marqueeTo}
          rowsSpanned={rowsSpanned}
          onSelectRow={props.onSelectRow}
          onToggleExpanded={props.onToggleExpanded}
          onRenameRow={props.onRenameRow}
          runOps={props.runOps}
          onStepAudition={props.onStepAudition}
          index={i}
          assignmentGroups={props.assignmentGroups}
          onAssignRow={props.onAssignRow}
          onRowPlayback={props.onRowPlayback}
          onMoveRow={props.onMoveRow}
          colorChoices={props.colorChoices}
        />
      ))}
    </div>
  );
});
StepSequencerGrid.displayName = "StepSequencerGrid";
