/**
 * `@nodetool-ai/execution/sketch-debug` — sketch validation + debug report.
 *
 * Pure, dependency-injected core: no DB, no canvas, no browser. Hosts (the CLI
 * `sketch` command today) resolve the target and write the bundle.
 */

export type {
  SketchDebugIssue,
  SketchValidation,
  SketchInteractionRecord,
  SketchDebugTarget,
  SketchDocumentMeta,
  SketchDebugReport
} from "./types.js";

export { validateSketchDocument, type SketchValidationMeta } from "./validate.js";
export {
  buildSketchDebugReport,
  type SketchDebugReportInput
} from "./report.js";
export { renderSketchReportMarkdown } from "./markdown.js";
