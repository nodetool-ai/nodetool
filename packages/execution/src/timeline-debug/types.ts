/**
 * Timeline debug vocabulary.
 *
 * One report shape for "is this timeline document sound, and what did a
 * scripted edit session leave behind" — shared by the CLI `timeline validate`
 * / `timeline debug` commands and any future server surface, the same way
 * `../debug/types.ts` is shared by every workflow-debug surface.
 */

import type { DebugVerdict } from "../debug/types.js";

/** One finding against a timeline document. */
export interface TimelineDebugIssue {
  severity: "error" | "warning";
  /** Stable machine code, e.g. `field_stripped`, `clip_track_missing`. */
  code: string;
  message: string;
  trackId?: string;
  clipId?: string;
  /** JSON path of the offending field, for schema/round-trip findings. */
  path?: string;
}

export interface TimelineValidation {
  /** True when there are no errors. Warnings do not clear `ok`. */
  ok: boolean;
  errors: TimelineDebugIssue[];
  warnings: TimelineDebugIssue[];
}

/** One executed step of a `--interact` script. */
export interface TimelineInteractionRecord {
  /** Tool name as invoked (canonical `ui_timeline_*` form). */
  tool: string;
  input: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface TimelineDebugTarget {
  kind: "file" | "id";
  ref: string;
  name?: string;
}

export interface TimelineSequenceMeta {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  trackCount: number;
  clipCount: number;
}

export interface TimelineDebugReport {
  target: TimelineDebugTarget;
  meta: TimelineSequenceMeta;
  /** Static validation of the input document. */
  validation: TimelineValidation;
  /** Scripted edit session, when one ran. */
  interactions: TimelineInteractionRecord[];
  /** Bridge snapshot after the script (TimelineBridgeFinalState shape). */
  finalState?: unknown;
  /** Validation of the document reconstructed from the final state. */
  finalValidation?: TimelineValidation;
  /** What a headless run cannot answer (rendering, playback, generation …). */
  notSimulated: string[];
  verdict: DebugVerdict;
}
