/**
 * The tempo grid the editor draws and snaps to.
 *
 * `tempoGridMs` in `@nodetool-ai/timeline` refuses a range holding more than
 * `MAX_BEAT_GRID_POINTS` lines, which is the right answer for a caller that
 * named a range — but the editor's range is whatever happens to be on screen
 * at whatever zoom, so it clamps the range to what the grid can hold before
 * asking. Everything here is pure: the ruler's bar labels are computed rather
 * than drawn, so a 120 BPM 4/4 ruler is testable without a canvas.
 */

import {
  MAX_BEAT_GRID_POINTS,
  barDurationMs,
  barsBeatsAt,
  beatDurationMs,
  divisionToTicks,
  tempoGridMs,
  ticksToMs,
  QUANTIZE_DIVISIONS
} from "@nodetool-ai/timeline";
import type { TempoGridDivision, TimelineTempo } from "@nodetool-ai/timeline";

/** How far apart `division`'s grid lines sit, in ms. */
export function tempoGridIntervalMs(
  tempo: TimelineTempo,
  division: TempoGridDivision
): number {
  if (division === "bar") return barDurationMs(tempo);
  if (division === "beat") return beatDurationMs(tempo);
  return ticksToMs(divisionToTicks(division), tempo.bpm);
}

export interface VisibleTempoGridSpec {
  tempo: TimelineTempo;
  division: TempoGridDivision;
  fromMs: number;
  toMs: number;
}

/**
 * The grid lines inside the range, with the range's far end pulled in when the
 * division would put more lines in it than the grid may hold.
 */
export function visibleTempoGrid(spec: VisibleTempoGridSpec): number[] {
  const fromMs = Math.max(0, spec.fromMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(spec.toMs)) return [];
  if (spec.toMs <= fromMs) return [];
  const interval = tempoGridIntervalMs(spec.tempo, spec.division);
  if (!Number.isFinite(interval) || interval <= 0) return [];
  const span = Math.min(spec.toMs - fromMs, (MAX_BEAT_GRID_POINTS - 1) * interval);
  return tempoGridMs({
    tempo: spec.tempo,
    division: spec.division,
    fromMs,
    toMs: fromMs + span
  });
}

/** The divisions the grid select offers, coarsest first. */
export const GRID_DIVISION_OPTIONS: readonly {
  value: TempoGridDivision;
  label: string;
}[] = [
  { value: "bar", label: "Bar" },
  { value: "beat", label: "Beat" },
  ...QUANTIZE_DIVISIONS.map((division) => ({
    value: division as TempoGridDivision,
    label: division
  }))
];

/** One line the bars ruler draws. A bar line carries the bar number. */
export interface BarRulerTick {
  timeMs: number;
  kind: "bar" | "beat";
  /** Bar number, on the bar lines that are labelled. */
  label?: string;
}

/** Below this the beat ticks crowd into a smear, so only bars are drawn. */
const MIN_BEAT_TICK_GAP_PX = 8;
/** A bar number needs this much room before the next one is drawn. */
const MIN_BAR_LABEL_GAP_PX = 44;

export interface BarRulerSpec {
  tempo: TimelineTempo;
  /** Zoom, as the ruler's own `msPerPx`. */
  msPerPx: number;
  fromMs: number;
  toMs: number;
}

/**
 * The bar and beat lines for one visible range, with the label stride chosen
 * from the zoom the way the timecode ruler picks its major interval: a bar
 * number is drawn only where the next one is at least
 * `MIN_BAR_LABEL_GAP_PX` away, and beats are dropped entirely once they would
 * sit closer together than `MIN_BEAT_TICK_GAP_PX`.
 */
export function computeBarRulerTicks(spec: BarRulerSpec): BarRulerTick[] {
  const { tempo, msPerPx } = spec;
  if (!Number.isFinite(msPerPx) || msPerPx <= 0) return [];
  const barMs = barDurationMs(tempo);
  const beatMs = beatDurationMs(tempo);
  if (!Number.isFinite(barMs) || barMs <= 0) return [];

  const barTimes = visibleTempoGrid({
    tempo,
    division: "bar",
    fromMs: spec.fromMs,
    toMs: spec.toMs
  });

  // How many bars apart the labels sit: the first power of two wide enough.
  let labelStride = 1;
  while ((barMs * labelStride) / msPerPx < MIN_BAR_LABEL_GAP_PX) {
    labelStride *= 2;
    if (labelStride > 1024) break;
  }

  const ticks: BarRulerTick[] = [];
  const showBeats =
    labelStride === 1 && beatMs / msPerPx >= MIN_BEAT_TICK_GAP_PX;

  for (const timeMs of barTimes) {
    const { bar } = barsBeatsAt(timeMs, tempo);
    const labelled = ((bar - 1) % labelStride + labelStride) % labelStride === 0;
    const tick: BarRulerTick = { timeMs, kind: "bar" };
    if (labelled) {
      tick.label = String(bar);
    }
    ticks.push(tick);
    if (!showBeats) continue;
    for (let beat = 1; beat < tempo.timeSignature.beatsPerBar; beat++) {
      const beatTimeMs = timeMs + beat * beatMs;
      if (beatTimeMs > spec.toMs) break;
      ticks.push({ timeMs: beatTimeMs, kind: "beat" });
    }
  }
  return ticks;
}
