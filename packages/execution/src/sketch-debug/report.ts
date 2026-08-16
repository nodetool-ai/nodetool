/**
 * Assembles a `SketchDebugReport` from a document, an optional scripted edit
 * session, and the document that session left behind.
 *
 * Pure: the host resolves the target (file, id) and writes the bundle; this
 * decides what the run means.
 */
import type { DebugVerdict } from "../debug/types.js";
import type {
  SketchDebugIssue,
  SketchDebugReport,
  SketchDebugTarget,
  SketchDocumentMeta,
  SketchInteractionRecord,
  SketchValidation
} from "./types.js";
import {
  validateSketchDocument,
  type SketchValidationMeta
} from "./validate.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const DEFAULTS = {
  width: 1024,
  height: 1024,
  backgroundColor: "#ffffff"
} as const;

/**
 * What a headless sketch run cannot answer. Fixed, because the boundary is a
 * property of the harness, not of the document it was pointed at.
 */
const NOT_SIMULATED: ReadonlyArray<string> = [
  "Pixels — layer bitmaps are never decoded, composited, or diffed.",
  "Rendering and flattening — no canvas exists, so blend modes and effects produce nothing to look at.",
  "Painting tools — brush, eraser, fill, gradient and transform strokes leave no marks headlessly.",
  "Generation providers — no imagery is produced; bindings are checked structurally only.",
  "Asset I/O — asset ids are never resolved, fetched, or uploaded.",
  "Generation bindings after edits — the headless bridge tracks a layer's prompt/provider/model but not the persisted binding record, so a post-edit document is validated with no bindings."
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const count = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

function describeDocument(
  document: unknown,
  meta: SketchValidationMeta | undefined
): SketchDocumentMeta {
  const record = isRecord(document) ? document : {};
  const sketch = isRecord(record.sketch) ? record.sketch : {};
  const canvas = isRecord(sketch.canvas) ? sketch.canvas : {};
  const pick = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  const background =
    typeof canvas.backgroundColor === "string"
      ? canvas.backgroundColor
      : (meta?.backgroundColor ?? DEFAULTS.backgroundColor);

  return {
    width: pick(canvas.width, pick(meta?.width, DEFAULTS.width)),
    height: pick(canvas.height, pick(meta?.height, DEFAULTS.height)),
    backgroundColor: background,
    layerCount: count(sketch.layers),
    bindingCount: count(record.layerBindings)
  };
}

const describe = (issue: SketchDebugIssue): string => {
  const where = issue.layerId ?? issue.path;
  return where
    ? `[${issue.code}] ${where}: ${issue.message}`
    : `[${issue.code}] ${issue.message}`;
};

function buildSketchVerdict(
  validation: SketchValidation,
  interactions: ReadonlyArray<SketchInteractionRecord>,
  finalValidation: SketchValidation | undefined
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
  const warningCount = warnings.length;
  const headline = ok
    ? `Sketch is sound — ${interactions.length} interaction(s) ran clean` +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      "."
    : `Sketch has ${issues.length} problem(s)` +
      (failedSteps.length > 0
        ? `, ${failedSteps.length} failed interaction(s)`
        : "") +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      ` — ${issues[0]}`;

  return warningCount > 0
    ? { ok, headline, issues, warnings }
    : { ok, headline, issues };
}

export interface SketchDebugReportInput {
  target: SketchDebugTarget;
  /** The document as loaded — untrusted, validated here. */
  document: unknown;
  meta?: SketchValidationMeta;
  interactions?: SketchInteractionRecord[];
  /** Bridge snapshot after the scripted session (`SketchBridgeFinalState`). */
  finalState?: unknown;
  /** Document reconstructed from the final state, validated as a second pass. */
  finalDocument?: unknown;
}

export function buildSketchDebugReport(
  input: SketchDebugReportInput
): SketchDebugReport {
  const validation = validateSketchDocument(input.document, input.meta);
  // The post-edit pass runs without `meta`: a session may have resized the
  // canvas, and the stored row's size is then the stale number, not the bug.
  const finalValidation =
    input.finalDocument === undefined
      ? undefined
      : validateSketchDocument(input.finalDocument);
  const interactions = input.interactions ?? [];

  // The final document is what the session left behind, so it — not the input
  // — describes the sketch the report is about.
  const meta = describeDocument(
    input.finalDocument ?? input.document,
    input.meta
  );

  type ReportFields = Mutable<SketchDebugReport>;
  const report: ReportFields = {
    target: input.target,
    meta,
    validation,
    interactions,
    notSimulated: [...NOT_SIMULATED],
    verdict: buildSketchVerdict(validation, interactions, finalValidation)
  };
  if (input.finalState !== undefined) {
    report.finalState = input.finalState;
  }
  if (finalValidation) {
    report.finalValidation = finalValidation;
  }
  return report;
}
