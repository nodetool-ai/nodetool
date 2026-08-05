/**
 * Sketch debug vocabulary.
 *
 * One report shape for "is this image document sound, and what did a scripted
 * edit session leave behind" — shared by the CLI `sketch validate` /
 * `sketch debug` commands and any future server surface, the same way
 * `../timeline-debug/types.ts` is shared by the timeline surfaces.
 */

import type { DebugVerdict } from "../debug/types.js";

/** One finding against an image document. */
export interface SketchDebugIssue {
  severity: "error" | "warning";
  /** Stable machine code, e.g. `field_stripped`, `binding_layer_missing`. */
  code: string;
  message: string;
  layerId?: string;
  /** JSON path of the offending field, for schema/round-trip findings. */
  path?: string;
}

export interface SketchValidation {
  /** True when there are no errors. Warnings do not clear `ok`. */
  ok: boolean;
  errors: SketchDebugIssue[];
  warnings: SketchDebugIssue[];
}

/** One executed step of a `--interact` script. */
export interface SketchInteractionRecord {
  /** Tool name as invoked (canonical `ui_sketch_*` form). */
  tool: string;
  input: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface SketchDebugTarget {
  kind: "file" | "id";
  ref: string;
  name?: string;
}

export interface SketchDocumentMeta {
  width: number;
  height: number;
  backgroundColor: string;
  layerCount: number;
  bindingCount: number;
}

export interface SketchDebugReport {
  target: SketchDebugTarget;
  meta: SketchDocumentMeta;
  /** Static validation of the input document. */
  validation: SketchValidation;
  /** Scripted edit session, when one ran. */
  interactions: SketchInteractionRecord[];
  /** Bridge snapshot after the script (SketchBridgeFinalState shape). */
  finalState?: unknown;
  /** Validation of the document reconstructed from the final state. */
  finalValidation?: SketchValidation;
  /** What a headless run cannot answer (pixels, rendering, assets …). */
  notSimulated: string[];
  verdict: DebugVerdict;
}
