/**
 * JS script debug vocabulary.
 *
 * One report shape for "is this script document sound, and what did a scripted
 * edit session leave behind" — shared by the CLI `jsscript validate` /
 * `jsscript debug` commands and the `validate_js_script` capability, the same
 * way `../sketch-debug/types.ts` is shared by the sketch surfaces.
 */

import type { DebugVerdict } from "../debug/types.js";

/** One finding against a JS script document. */
export interface JsScriptDebugIssue {
  severity: "error" | "warning";
  /** Stable machine code, e.g. `js_script_duplicate_port`, `code_syntax`. */
  code: string;
  message: string;
  /** JSON path of the offending field, for schema findings. */
  path?: string;
}

export interface JsScriptValidation {
  /** True when there are no errors. Warnings do not clear `ok`. */
  ok: boolean;
  errors: JsScriptDebugIssue[];
  warnings: JsScriptDebugIssue[];
}

/** One executed step of a `--interact` script. */
export interface JsScriptInteractionRecord {
  /** Tool name as invoked (canonical `ui_jsscript_*` form). */
  tool: string;
  input: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface JsScriptDebugTarget {
  kind: "file" | "id";
  ref: string;
  name?: string;
}

export interface JsScriptDocumentMeta {
  inputCount: number;
  outputCount: number;
  packageCount: number;
  secretCount: number;
  testCount: number;
  timeoutSeconds: number;
  codeLength: number;
}

export interface JsScriptDebugReport {
  target: JsScriptDebugTarget;
  meta: JsScriptDocumentMeta;
  /** Static validation of the input document. */
  validation: JsScriptValidation;
  /** Scripted edit session, when one ran. */
  interactions: JsScriptInteractionRecord[];
  /** Bridge snapshot after the script. */
  finalState?: unknown;
  /** Validation of the document the session left behind. */
  finalValidation?: JsScriptValidation;
  /** What a headless run cannot answer. */
  notSimulated: string[];
  verdict: DebugVerdict;
}
