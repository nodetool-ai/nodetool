/**
 * Where the transport's loop toggle puts the loop when nothing is marked:
 * over the selected clips, else over the whole bars on screen.
 */

import { barDurationMs, barStartMs, barsBeatsAt } from "@nodetool-ai/timeline";
import type { TimelineTempo } from "@nodetool-ai/timeline";

export interface LoopRangeInput {
  selectedClips: ReadonlyArray<{ startMs: number; durationMs: number }>;
  /** The lanes' visible window. A zero-width window counts as unknown. */
  viewStartMs: number;
  viewEndMs: number;
  /** Where the playhead is, for the fallback when the view is unknown. */
  playheadMs: number;
  tempo: TimelineTempo;
}

/** Bars the loop spans when the view is unknown or holds less than a bar. */
const FALLBACK_BARS = 4;

export function defaultLoopRange(input: LoopRangeInput): { inMs: number; outMs: number } {
  const { selectedClips, viewStartMs, viewEndMs, playheadMs, tempo } = input;
  if (selectedClips.length > 0) {
    let inMs = Infinity;
    let outMs = -Infinity;
    for (const clip of selectedClips) {
      inMs = Math.min(inMs, clip.startMs);
      outMs = Math.max(outMs, clip.startMs + clip.durationMs);
    }
    if (outMs > inMs) return { inMs: Math.max(0, inMs), outMs };
  }
  const barMs = barDurationMs(tempo);
  if (viewEndMs > viewStartMs) {
    // The first bar line at or after the view start, then every whole bar
    // that fits before the view end.
    const startBar = barsBeatsAt(Math.max(0, viewStartMs), tempo);
    const firstBar =
      barStartMs(startBar.bar, tempo) < Math.max(0, viewStartMs) - 0.5
        ? startBar.bar + 1
        : startBar.bar;
    const inMs = Math.max(0, barStartMs(firstBar, tempo));
    const bars = Math.floor((viewEndMs - inMs) / barMs + 1e-6);
    if (bars >= 1) return { inMs, outMs: inMs + bars * barMs };
  }
  const bar = barsBeatsAt(Math.max(0, playheadMs), tempo).bar;
  const inMs = Math.max(0, barStartMs(bar, tempo));
  return { inMs, outMs: inMs + FALLBACK_BARS * barMs };
}

/** `"3:2:480"` — bar, beat and tick, the transport's musical position. */
export function formatBarsBeatsTicks(ms: number, tempo: TimelineTempo): string {
  const { bar, beat, tick } = barsBeatsAt(ms, tempo);
  return `${bar}:${beat}:${String(tick).padStart(3, "0")}`;
}
