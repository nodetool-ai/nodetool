/**
 * Assembles a `JsScriptDebugReport` from a document, an optional scripted edit
 * session, and the document that session left behind.
 *
 * Pure: the host resolves the target (file, id) and writes the bundle; this
 * decides what the run means.
 */
import { JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { DebugVerdict } from "../debug/types.js";
import type {
  JsScriptDebugIssue,
  JsScriptDebugReport,
  JsScriptDebugTarget,
  JsScriptDocumentMeta,
  JsScriptInteractionRecord,
  JsScriptValidation
} from "./types.js";
import {
  validateJsScriptDoc,
  type JsScriptValidationOptions
} from "./validate.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What a headless JS-script run cannot answer. Fixed, because the boundary is
 * a property of the harness, not of the document it was pointed at.
 */
const NOT_SIMULATED: ReadonlyArray<string> = [
  "The editor — Monaco, the assistant panel, the ports/packages/secrets controls, and the run console render nothing headlessly.",
  "Version history — a debug session never snapshots or restores; use `jsscript versions` for that.",
  "Persistence — a scripted session edits an in-memory document and is never saved back onto the row.",
  "Secret values — a run reads only the secrets the document declares, and the store is per-install."
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const count = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

function describeDocument(document: unknown): JsScriptDocumentMeta {
  const record = isRecord(document) ? document : {};
  const timeout = record.timeoutSeconds;
  return {
    inputCount: count(record.inputs),
    outputCount: count(record.outputs),
    packageCount: count(record.packages),
    secretCount: count(record.secrets),
    testCount: count(record.tests),
    timeoutSeconds:
      typeof timeout === "number" && Number.isFinite(timeout)
        ? timeout
        : JS_SCRIPT_DEFAULT_TIMEOUT_SECONDS,
    codeLength: typeof record.code === "string" ? record.code.length : 0
  };
}

const describe = (issue: JsScriptDebugIssue): string =>
  issue.path
    ? `[${issue.code}] ${issue.path}: ${issue.message}`
    : `[${issue.code}] ${issue.message}`;

function buildVerdict(
  validation: JsScriptValidation,
  interactions: ReadonlyArray<JsScriptInteractionRecord>,
  finalValidation: JsScriptValidation | undefined
): DebugVerdict {
  const failedSteps = interactions.filter((step) => !step.ok);
  const issues: string[] = [
    ...validation.errors.map(describe),
    ...failedSteps.map(
      (step) =>
        `Interaction \`${step.tool}\` failed${step.error ? `: ${step.error}` : ""}`
    ),
    ...(finalValidation?.errors ?? []).map(
      (issue) => `After edits — ${describe(issue)}`
    )
  ];
  const warnings: string[] = [
    ...validation.warnings.map(describe),
    ...(finalValidation?.warnings ?? []).map(
      (issue) => `After edits — ${describe(issue)}`
    )
  ];

  const ok = issues.length === 0;
  const headline = ok
    ? `Script is sound — ${interactions.length} interaction(s) ran clean` +
      (warnings.length > 0 ? `, ${warnings.length} warning(s)` : "") +
      "."
    : `Script has ${issues.length} problem(s)` +
      (failedSteps.length > 0
        ? `, ${failedSteps.length} failed interaction(s)`
        : "") +
      (warnings.length > 0 ? `, ${warnings.length} warning(s)` : "") +
      ` — ${issues[0]}`;

  return warnings.length > 0
    ? { ok, headline, issues, warnings }
    : { ok, headline, issues };
}

export interface JsScriptDebugReportInput {
  target: JsScriptDebugTarget;
  /** The document as loaded — untrusted, validated here. */
  document: unknown;
  options?: JsScriptValidationOptions;
  interactions?: JsScriptInteractionRecord[];
  /** Bridge snapshot after the scripted session. */
  finalState?: unknown;
  /** The document the session left behind, validated as a second pass. */
  finalDocument?: unknown;
}

export async function buildJsScriptDebugReport(
  input: JsScriptDebugReportInput
): Promise<JsScriptDebugReport> {
  const options = input.options ?? {};
  const validation = await validateJsScriptDoc(input.document, options);
  const finalValidation =
    input.finalDocument === undefined
      ? undefined
      : await validateJsScriptDoc(input.finalDocument, options);
  const interactions = input.interactions ?? [];

  // The final document is what the session left behind, so it — not the input
  // — describes the script the report is about.
  type ReportFields = Mutable<JsScriptDebugReport>;
  const report: ReportFields = {
    target: input.target,
    meta: describeDocument(input.finalDocument ?? input.document),
    validation,
    interactions,
    notSimulated: [...NOT_SIMULATED],
    verdict: buildVerdict(validation, interactions, finalValidation)
  };
  if (input.finalState !== undefined) {
    report.finalState = input.finalState;
  }
  if (finalValidation) {
    report.finalValidation = finalValidation;
  }
  return report;
}
