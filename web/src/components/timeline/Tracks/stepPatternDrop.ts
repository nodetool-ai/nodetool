/**
 * A Pattern Browser entry dropped on the tracks area (SQ43): on a MIDI lane it
 * creates a pattern region at the drop time, and below the last track it
 * creates a MIDI track holding the region. The start snaps down to the grid
 * line left of the pointer when snap is on. Each drop is one ops run, so one
 * undo step.
 */

import { resolveTempo } from "@nodetool-ai/timeline";
import type { TimelineTempo, TimelineTrack, TempoGridDivision } from "@nodetool-ai/timeline";

import { STEP_PATTERN_DRAG_TYPE } from "../stepSequencer/StepPatternBrowser";
import type { StepPatternOpStep } from "../stepSequencer/useStepPatternOps";
import { tempoGridIntervalMs, visibleTempoGrid } from "./tempoGrid";

export const isStepPatternDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types ?? []).includes(STEP_PATTERN_DRAG_TYPE);

/** The grid line at or before `pointerMs`, or `pointerMs` with snap off. */
export function snapPatternDropMs(
  pointerMs: number,
  doc: { tracks: readonly TimelineTrack[]; tempo?: TimelineTempo },
  ui: { snapEnabled: boolean; gridDivision: TempoGridDivision }
): number {
  const ms = Number.isFinite(pointerMs) ? Math.max(0, Math.round(pointerMs)) : 0;
  if (!ui.snapEnabled) return ms;
  const tempo = resolveTempo(doc);
  const interval = tempoGridIntervalMs(tempo, ui.gridDivision);
  const lines = visibleTempoGrid({ tempo, division: ui.gridDivision, fromMs: Math.max(0, ms - 2 * interval), toMs: ms + 1 });
  let snapped: number | null = null;
  for (const line of lines) if (line <= ms) snapped = line;
  return snapped === null ? ms : Math.round(snapped);
}

/** The ops that place `patternId` at `atMs`, on `trackId` or on a new MIDI track. */
export function patternDropOps(patternId: string, atMs: number, trackId: string | null): StepPatternOpStep[] {
  if (trackId) return [{ op: "apply_step_pattern", trackId, atMs, pattern: patternId }];
  return [
    { op: "add_track", type: "midi" },
    (previous) => ({
      op: "apply_step_pattern",
      trackId: (previous[0] as { track: { id: string } }).track.id,
      atMs,
      pattern: patternId
    })
  ];
}
