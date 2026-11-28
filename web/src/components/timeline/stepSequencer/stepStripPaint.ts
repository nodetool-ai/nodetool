/**
 * Canvas drawing of one Step Sequencer strip (SQ30, figure p0736). One canvas
 * per row or subrow: the strip paints itself from the row, the edit mode and
 * the live drag preview, so a drag or a playing-step change repaints one
 * canvas and never re-renders React (F34).
 */

import { STEP_RATES } from "@nodetool-ai/timeline";
import type { Step, StepEditMode, StepRow } from "@nodetool-ai/timeline";

import { mixHex } from "../Tracks/regionColors";
import {
  MODE_SPECS,
  previewValueText,
  stepModeValue,
  stepValueText,
  tieSpans,
  valueFraction
} from "./stepSequencerModel";

/** Extra space after every fourth step, so beats read as groups (p. 724). */
export const GROUP_GAP_PX = 6;
/** Inset of a cell inside its step box. */
export const CELL_GAP_PX = 3;
const CELL_SIDE_INSET_PX = 1.5;

export const stepX = (step: number, stepWidth: number): number =>
  step * stepWidth + Math.floor(step / 4) * GROUP_GAP_PX;

export const stripWidth = (steps: number, stepWidth: number): number =>
  steps > 0 ? stepX(steps - 1, stepWidth) + stepWidth : 0;

/** The step under `x`, or the nearest one. */
export function stepAtX(x: number, steps: number, stepWidth: number): number {
  // The boundary is midway between this cell's right edge and the next
  // cell's left edge, so a click on a painted cell edits that cell (F47).
  for (let s = 0; s < steps - 1; s++) {
    if (x < (stepX(s, stepWidth) + stepWidth + stepX(s + 1, stepWidth)) / 2) return s;
  }
  return Math.max(0, steps - 1);
}

/**
 * Call `onChange` when the device pixel ratio changes: a move to another
 * display or a browser zoom (F52). Returns the unsubscribe function.
 */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  let mq: MediaQueryList | null = null;
  const listen = () => {
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener("change", handle, { once: true });
  };
  const handle = () => {
    onChange();
    listen();
  };
  listen();
  return () => mq?.removeEventListener("change", handle);
}

export interface DragPreview {
  rowId: string;
  mode: StepEditMode;
  values: Map<number, number>;
  /** Tie preview: the range a Command-drag or Tie-mode drag spans. */
  tie?: { from: number; to: number; tie: boolean };
  loop?: { from: number; to: number };
  /** The step whose value the readout shows above the cell. */
  readout?: number;
}

export interface StripPalette {
  on: string;
  off: string;
  offBorder: string;
  /** Value bar of an off step: visible, well below the on color. */
  offBar: string;
  /** Value-mode cell background above the bar on an on step. */
  valueBg: string;
  line: string;
  text: string;
  textOff: string;
  /** Behind every other beat group. */
  band: string;
  select: string;
  playhead: string;
  readoutBg: string;
}

/** Colors for one row: the track color muted toward the panel (SQ29). */
export function stripPalette(
  color: string,
  scheme: { dark: boolean; paper: string; text: string; playhead: string; band: string }
): StripPalette {
  const { dark, paper } = scheme;
  // On cells carry the row color nearly full; off cells sit close to the
  // panel, so on and off read apart in every subrow (p0736).
  const on = mixHex(color, paper, dark ? 0.12 : 0.08);
  return {
    on,
    off: mixHex(color, paper, dark ? 0.88 : 0.9),
    offBorder: mixHex(color, paper, dark ? 0.72 : 0.74),
    offBar: mixHex(color, paper, dark ? 0.8 : 0.82),
    valueBg: mixHex(color, paper, dark ? 0.5 : 0.48),
    line: mixHex(on, scheme.text, 0.55),
    text: scheme.text,
    textOff: mixHex(color, paper, 0.45),
    band: scheme.band,
    select: scheme.text,
    playhead: scheme.playhead,
    readoutBg: paper
  };
}

/** The row with a drag preview applied, so the paint shows it as committed. */
export function previewRow(row: StepRow, preview: DragPreview | null): StepRow {
  if (!preview || preview.rowId !== row.id) return row;
  const steps: Array<Step | null> = row.steps.slice();
  const patch = (i: number, p: Partial<Step>) => {
    steps[i] = { ...(steps[i] ?? {}), ...p };
  };
  const spec = MODE_SPECS[preview.mode];
  for (const [s, v] of preview.values) {
    if (preview.mode === "onOff") patch(s, { on: v === 1 });
    else if (spec.kind === "bool" && spec.field) patch(s, { [spec.field]: v === 1 } as Partial<Step>);
    else if (spec.kind === "rate") patch(s, { on: true, stepRate: STEP_RATES[v] });
    else if (spec.field) patch(s, { on: true, [spec.field]: v } as Partial<Step>);
  }
  if (preview.tie) {
    const lo = Math.min(preview.tie.from, preview.tie.to);
    const hi = Math.max(preview.tie.from, preview.tie.to);
    if (preview.tie.tie) {
      patch(lo, { on: true });
      for (let s = lo + 1; s <= hi; s++) patch(s, { tie: true });
    } else {
      for (let s = lo; s <= hi; s++) patch(s, { tie: false });
    }
  }
  let { loopStart, loopEnd } = row;
  if (preview.loop) {
    loopStart = Math.min(preview.loop.from, preview.loop.to);
    loopEnd = Math.max(preview.loop.from, preview.loop.to) + 1;
  }
  return { ...row, steps: steps as StepRow["steps"], loopStart, loopEnd };
}

export interface StripPaintInput {
  row: StepRow;
  mode: StepEditMode;
  stepWidth: number;
  height: number;
  palette: StripPalette;
  selected: ReadonlySet<number>;
  showValues: boolean;
  playStep: number | undefined;
  preview: DragPreview | null;
  font: string;
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "fillRect"
  | "strokeRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "fillText"
  | "measureText"
  | "save"
  | "restore"
  | "rect"
  | "clip"
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textBaseline: CanvasRenderingContext2D["textBaseline"];
};

/** Paint one strip. Cells merge across ties in On/Off, Tie and Skip (SQ30). */
export function paintStrip(ctx: Ctx, input: StripPaintInput): void {
  const { mode, stepWidth, height, palette, selected, showValues, playStep, preview } = input;
  const row = previewRow(input.row, preview);
  const spec = MODE_SPECS[mode];
  const valueMode = spec.kind === "number" || spec.kind === "rate";
  const top = CELL_GAP_PX;
  const h = height - CELL_GAP_PX * 2;
  ctx.clearRect(0, 0, stripWidth(row.lengthSteps, stepWidth) + GROUP_GAP_PX, height);
  ctx.font = input.font;
  ctx.textBaseline = "alphabetic";

  // Beat groups: a band behind every other group of four.
  ctx.fillStyle = palette.band;
  for (let g = 1; g * 4 < row.lengthSteps; g += 2) {
    const x0 = stepX(g * 4, stepWidth) - GROUP_GAP_PX / 2;
    const x1 = stepX(Math.min(row.lengthSteps - 1, g * 4 + 3), stepWidth) + stepWidth + GROUP_GAP_PX / 2;
    ctx.fillRect(x0, 0, x1 - x0, height);
  }

  // Value modes draw every step alone, so a tied step's own gate stays editable.
  const spans = valueMode
    ? Array.from({ length: row.lengthSteps }, (_, i) => ({ start: i, end: i }))
    : tieSpans(row);
  for (const span of spans) {
    const first = span.start;
    const x = stepX(first, stepWidth) + CELL_SIDE_INSET_PX;
    const w = stepX(span.end, stepWidth) + stepWidth - CELL_SIDE_INSET_PX - x;
    const on = row.steps[first]?.on === true;
    const boolValue = spec.kind === "bool" && mode !== "onOff" ? stepModeValue(row, first, mode) === 1 : on;
    const outOfLoop = first < row.loopStart || first >= row.loopEnd;
    ctx.globalAlpha = outOfLoop ? 0.35 : row.mute ? 0.5 : 1;

    if (valueMode) {
      const fraction = Math.max(0, Math.min(1, valueFraction(row, first, mode)));
      ctx.fillStyle = on ? palette.valueBg : palette.off;
      ctx.fillRect(x, top, w, h);
      if (mode === "chance") {
        paintDots(ctx, x, top, w, h, stepModeValue(row, first, "chance"), on ? palette.on : palette.offBar);
      } else if (mode === "repeat") {
        const n = stepModeValue(row, first, "repeat");
        ctx.fillStyle = on ? palette.on : palette.offBar;
        if (n > 1) {
          for (let i = 0; i < n; i++) ctx.fillRect(x + (w / n) * i + 1, top, Math.max(1, w / n - 2), h);
        } else {
          ctx.fillRect(x, top, w, h);
          // The repeat glyph: a dotted vertical line in a single-repeat cell (p0736).
          ctx.fillStyle = on ? palette.line : palette.offBorder;
          const cx = x + w / 2 - 1;
          for (let dy = top + h * 0.3; dy < top + h * 0.7; dy += 4) ctx.fillRect(cx, dy, 2, 2);
        }
      } else {
        const barH = Math.round(fraction * h);
        ctx.fillStyle = on ? palette.on : palette.offBar;
        ctx.fillRect(x, top + h - barH, w, barH);
        ctx.fillStyle = on ? palette.line : palette.offBorder;
        ctx.fillRect(x, top + h - barH - 1, w, 2);
      }
      if (showValues || preview?.readout === first) {
        ctx.fillStyle = on ? palette.text : palette.textOff;
        ctx.fillText(stepValueText(row, first, mode), x + 4, top + h - 3);
      }
    } else {
      ctx.fillStyle = boolValue ? palette.on : palette.off;
      ctx.fillRect(x, top, w, h);
      if (!boolValue) {
        ctx.strokeStyle = palette.offBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
      }
      // Tie mode: an arrow at the right edge of each cell shows where a tie
      // continues (p0736).
      if (mode === "tie") {
        ctx.fillStyle = boolValue || on ? palette.line : palette.offBorder;
        const ax = x + w - 7;
        const ay = top + h / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 4);
        ctx.lineTo(ax + 4, ay);
        ctx.lineTo(ax, ay + 4);
        ctx.closePath();
        ctx.fill();
      }
      // A diamond at each join of a tied cell.
      ctx.fillStyle = palette.line;
      for (let s = span.start + 1; s <= span.end; s++) {
        const jx = stepX(s, stepWidth) - (stepX(s, stepWidth) - stepX(s - 1, stepWidth) - stepWidth) / 2;
        diamond(ctx, jx, top + h / 2, 4);
      }
    }

    ctx.globalAlpha = 1;
    if ([...selected].some((s) => s >= span.start && s <= span.end)) {
      ctx.strokeStyle = palette.select;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, top + 1, w - 2, h - 2);
    }
    if (playStep !== undefined && playStep >= span.start && playStep <= span.end) {
      ctx.strokeStyle = palette.playhead;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, top, w, h);
    }
  }

  if (mode === "loop" || preview?.loop) {
    const x = stepX(row.loopStart, stepWidth);
    const x1 = stepX(Math.max(row.loopStart, row.loopEnd - 1), stepWidth) + stepWidth;
    ctx.strokeStyle = palette.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, 1, x1 - x - 2, height - 2);
  }

  // Readout above the dragged step (SQ32, p. 735).
  if (preview?.readout !== undefined && valueMode) {
    const s = preview.readout;
    const v = preview.values.get(s);
    const text = v !== undefined ? previewValueText(input.row, s, mode, v) : stepValueText(row, s, mode);
    const tw = ctx.measureText(text).width + 8;
    const cx = stepX(s, stepWidth) + stepWidth / 2;
    ctx.fillStyle = palette.readoutBg;
    ctx.fillRect(cx - tw / 2, top + 2, tw, 14);
    ctx.fillStyle = palette.text;
    ctx.fillText(text, cx - tw / 2 + 4, top + 13);
  }
}

function diamond(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

/** Chance: a dot texture whose density is the chance (SQ30). */
function paintDots(ctx: Ctx, x: number, y: number, w: number, h: number, chance: number, color: string): void {
  const pitch = Math.max(3, Math.round(12 - (chance / 100) * 8));
  ctx.fillStyle = color;
  for (let dy = pitch / 2; dy < h; dy += pitch) {
    for (let dx = pitch / 2; dx < w; dx += pitch) ctx.fillRect(x + dx - 1, y + dy - 1, 2, 2);
  }
}
